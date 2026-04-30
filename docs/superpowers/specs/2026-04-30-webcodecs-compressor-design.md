# WebCodecs 動画圧縮設計 (2026-04-30)

## 概要

`videoCompressor.ts` の `@ffmpeg/ffmpeg` 実装を WebCodecs API ベースに置き換える。

**背景:**
- `@ffmpeg/ffmpeg@0.11.x` は `SharedArrayBuffer` を必要とするが、現行の `_headers`（COOP: same-origin-allow-popups のみ、COEP なし）では `crossOriginIsolated = false` となり `SharedArrayBuffer` が利用不可
- 結果として `ffmpegInstance.load()` が永久ハングし「圧縮エンジン読み込み中」から先に進まない
- WebCodecs はハードウェアアクセラレーション対応でヘッダー変更不要

**制約:**
- 入力: MP4 のみ（Google Drive からの動画はほぼ MP4/H.264）
- iOS 16.4+ 以上で WebCodecs 対応。それ未満はエラー表示＋original のみ
- ブラウザが完全に閉じた状態でのエンコードは Web 標準では不可能。ダウンロードは Background Fetch（既存）、エンコードはブラウザ起動中に Web Worker で実行

---

## アーキテクチャ

### 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/app/videocollect/videoCompressor.ts` | 完全書き換え（Worker 生成・管理のみ） |
| `src/app/videocollect/videoCompressorWorker.ts` | **新規** — Worker 内で全パイプラインを実装 |
| `src/app/videocollect/downloadQueue.ts` | `loading-ffmpeg` フェーズ削除、`DownloadPhase` 型更新 |
| `src/app/videocollect/DownloadProgressCard.tsx` | `loading-ffmpeg` ラベル削除 |
| `src/app/videocollect/modals/OfflineSaveModal.tsx` | WebCodecs サポートチェック追加 |
| `package.json` | `@ffmpeg/ffmpeg` 削除、`mp4-muxer` + `mp4box` 追加 |

### フロー全体

```
[メインスレッド]
compressVideo(blob, quality, onProgress, onLog?)
  → quality === 'original': blob をそのまま返す（既存と同じ）
  → それ以外: Worker を生成して { blob, quality } を postMessage
  → Worker からの { type: 'progress', ratio } で onProgress を呼ぶ
  → Worker からの { type: 'done', blob } で resolve
  → Worker からの { type: 'error', message } で reject

[Web Worker: videoCompressorWorker.ts]
mp4box.js demux
  ├─ 映像サンプル → VideoDecoder → VideoFrame
  │    → OffscreenCanvas でスケーリング
  │    → VideoEncoder (H.264)
  │    → mp4-muxer.addVideoChunk()
  └─ 音声サンプル → AudioDecoder → AudioData
       → AudioEncoder (AAC)
       → mp4-muxer.addAudioChunk()

mp4-muxer.finalize() → Blob → postMessage({ type: 'done', blob })
```

**Web Worker を使う理由:**
mp4box.js + VideoDecoder は DOM に依存しないため Worker 内で完結できる。UI スレッドをブロックしない。

---

## パイプライン詳細

### ① mp4box.js demux

```
blob → arrayBuffer()
→ mp4boxFile.appendBuffer(buffer)  // buffer.fileStart = 0 を設定
→ mp4boxFile.flush()
→ onReady(info): 映像・音声トラック情報取得
   - videoTrack: { id, codec, video.width, video.height, timescale, duration, nb_samples }
   - audioTrack: { id, codec, audio.channel_count, audio.sample_rate, nb_samples }
→ setExtractionOptions(videoTrackId, 'video', { nbSamples: Infinity })
→ setExtractionOptions(audioTrackId, 'audio', { nbSamples: Infinity })
→ mp4boxFile.start()
→ onSamples(trackId, user, samples[]):
   - sample.data: Uint8Array (AVCC フォーマット)
   - sample.is_sync: boolean (キーフレーム判定)
   - sample.cts / sample.timescale: タイムスタンプ計算用
   - sample.duration / sample.timescale: デュレーション計算用
```

映像コーデック文字列（例: `avc1.640028`）と AVCDecoderConfigurationRecord（avcC box の内容）は `info.videoTracks[0]` と `mp4boxFile.getTrackById()` から取得する。

### ② VideoDecoder → スケーリング → VideoEncoder

```
EncodedVideoChunk (AVCC フォーマット)
→ VideoDecoder.decode()
→ output callback: VideoFrame (元サイズ、ハードウェアデコード)

VideoFrame
→ if スケーリング必要:
   OffscreenCanvas(outputWidth, outputHeight).drawImage(videoFrame)
   → new VideoFrame(canvas, { timestamp: videoFrame.timestamp })
   → videoFrame.close()
→ VideoEncoder.encode(frame, { keyFrame: frameIndex % 60 === 0 })
→ frame.close()
→ VideoEncoder output callback: EncodedVideoChunk
   → muxer.addVideoChunk(chunk, meta)
```

スケーリング計算（アスペクト比維持、偶数丸め）:
```
scale = min(maxWidth / origWidth, maxHeight / origHeight, 1.0)
outputWidth  = Math.round(origWidth  * scale / 2) * 2
outputHeight = Math.round(origHeight * scale / 2) * 2
```

VideoEncoder は `flush()` を `totalVideoSamples` 分のフレームを encode した後に呼ぶ。

### ③ AudioDecoder → AudioEncoder

```
EncodedAudioChunk (AAC/MP3 等)
→ AudioDecoder.decode()
→ output callback: AudioData
→ AudioEncoder.encode(audioData)
→ audioData.close()
→ AudioEncoder output callback: EncodedAudioChunk
   → muxer.addAudioChunk(chunk, meta)
```

AudioDecoder は mp4box.js から取得した codec 文字列と AudioSpecificConfig（esds box）で configure する。

### ④ mp4-muxer

```typescript
const muxer = new Muxer({
  target: new ArrayBufferTarget(),
  video: { codec: 'avc', width: outputWidth, height: outputHeight },
  audio: { codec: 'aac', numberOfChannels, sampleRate },
  fastStart: 'in-memory',
});
```

映像・音声チャンクを timestamp 順に `addVideoChunk` / `addAudioChunk` で追加。

**完了検出:**
mp4box.js の `onReady` で取得した `videoTrack.nb_samples` と `audioTrack.nb_samples` を総数として保持し、`onSamples` コールバックで受け取った累計サンプル数と比較する。両トラックの全サンプルを `decode()` し終えたら `await Promise.all([videoEncoder.flush(), audioEncoder.flush()])` を呼び出す。両 `flush()` の Promise が解決したら `muxer.finalize()` を呼んで `target.buffer` を `Blob` に変換して返す。

### ⑤ progress 計算

Worker は映像フレームを encode するたびに進捗を通知する:
```
ratio = encodedVideoFrameCount / totalVideoSamples
postMessage({ type: 'progress', ratio })
```

---

## 品質プリセット

| プリセット | 解像度上限 (maxWidth × maxHeight) | 映像ビットレート | 音声ビットレート |
|-----------|----------------------------------|----------------|----------------|
| `high`   | 制限なし（元サイズのまま）         | 4,000,000 bps  | 128,000 bps    |
| `medium` | 1280 × 720                       | 2,000,000 bps  | 96,000 bps     |
| `low`    | 854 × 480                        | 800,000 bps    | 64,000 bps     |

**VideoEncoder コーデック選択:**
1. `avc1.640028`（H.264 High Profile, Level 4.0）を `VideoEncoder.isConfigSupported()` で検証
2. 失敗時: `avc1.42001f`（H.264 Baseline, Level 3.1）にフォールバック
3. 両方 `supported: false` → エラー（非対応環境扱い）

**AudioEncoder コーデック:** `mp4a.40.2`（AAC-LC）固定

---

## WebCodecs サポートチェック

`videoCompressor.ts` に `isWebCodecsSupported(): Promise<boolean>` を export する。

```typescript
export async function isWebCodecsSupported(): Promise<boolean> {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoDecoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof AudioDecoder === 'undefined'
  ) return false;

  const result = await VideoEncoder.isConfigSupported({
    codec: 'avc1.42001f',
    width: 1280,
    height: 720,
    bitrate: 2_000_000,
    framerate: 30,
  });
  return result.supported ?? false;
}
```

**OfflineSaveModal での使用:**
- モーダル起動時（または初回マウント時）に `isWebCodecsSupported()` を呼ぶ
- 非対応の場合: high / medium / low の選択肢を disabled 表示
- 説明文: 「このブラウザでは圧縮に対応していません（iOS 16.4 以上が必要です）。オリジナル画質のみ保存できます。」

---

## `loading-ffmpeg` フェーズの廃止

WebCodecs はエンジン読み込み待ちが不要なため `loading-ffmpeg` フェーズを削除する。

**変更箇所:**

`downloadQueue.ts`:
- `DownloadPhase` 型から `'loading-ffmpeg'` を削除
- `onProgress` コールバックの `ratio < 0` 分岐（`loading-ffmpeg` をセットしていた箇所）を削除
- `resumePendingCompressions` の `phase: 'loading-ffmpeg'` → `phase: 'compressing'` に変更
- SW メッセージ `vc-bgfetch-raw-done` 受信時の `phase: 'loading-ffmpeg'` → `phase: 'compressing'` に変更

`DownloadProgressCard.tsx`:
- `PHASE_LABEL` から `'loading-ffmpeg': '圧縮エンジン読み込み中'` を削除

`videoCompressor.ts`:
- `compressVideo()` 内の `onProgress(-1)` 呼び出しを削除
- `quality !== 'original'` 時は即座に Worker を起動し、最初の progress として `onProgress(0)` を呼ぶ

---

## エラー処理

| エラーケース | 対応 |
|------------|------|
| mp4box.js が音声/映像トラックを検出できない | `E031` エラー |
| VideoDecoder が入力コーデックに対応していない | `E031` エラー |
| VideoEncoder が H.264 に対応していない | `E031` エラー |
| エンコード中の例外 | `E031` エラー + logs に詳細を記録 |
| Worker 側の uncaught error | `type: 'error'` メッセージで main thread に通知 → `E031` |

既存の `VC_ERROR_CODES.COMPRESS`（`E031`）をそのまま使用する。logs 配列には Worker からのデバッグ情報を格納し、DownloadProgressCard のログビューアに表示する。

---

## テスト

| テスト対象 | 検証内容 |
|-----------|---------|
| `isWebCodecsSupported()` | `VideoEncoder` が `undefined` の場合 `false` を返す |
| `compressVideo()` | `quality='original'` は blob をそのまま返す（Worker を起動しない） |
| スケーリング計算ユーティリティ | 1920×1080 + medium → 1280×720 |
| スケーリング計算ユーティリティ | 縦動画 1080×1920 + medium → 406×720 (偶数丸め) |
| スケーリング計算ユーティリティ | 1280×720 (720p) + medium → 1280×720 のまま（スケールアップしない） |
| `OfflineSaveModal` | 非対応環境（`isWebCodecsSupported` が false）で high/medium/low が disabled |

スケーリング計算は純粋関数として `videoCompressorWorker.ts` から切り出し、単体テスト可能にする。

---

## 依存パッケージ変更

```json
// 削除
"@ffmpeg/ffmpeg": "^0.11.6"

// 追加
"mp4-muxer": "latest",  // WebCodecs チャンクを MP4 に結合（TypeScript 型同梱）
"mp4box": "latest"      // MP4 demux（映像・音声サンプル抽出）
```

実装時に npm の最新安定バージョンを確認して固定する。
`mp4-muxer` は TypeScript 型同梱のため `@types` 不要。
`mp4box` は `@types/mp4box` が別途必要。

---

## docs/videocollect.md の更新箇所

- 「圧縮品質プリセット」テーブルを CRF → ビットレート表記に更新
- `videoCompressor.ts` の説明を「ffmpeg.wasm」→「WebCodecs API」に変更
- `videoCompressorWorker.ts` をファイル構成に追加
- サポート要件（iOS 16.4+）を追記
