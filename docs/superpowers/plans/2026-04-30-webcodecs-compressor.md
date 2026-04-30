# WebCodecs 動画圧縮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ffmpeg/ffmpeg` を WebCodecs API（mp4box demux + VideoDecoder/Encoder + mp4-muxer）に置き換え、SharedArrayBuffer 不要でブラウザ・iOS 対応の動画圧縮を実現する。

**Architecture:** Web Worker 内で mp4box.js による MP4 demux → VideoDecoder でデコード → OffscreenCanvas でスケーリング → VideoEncoder (H.264) → AudioDecoder/Encoder (AAC) → mp4-muxer で MP4 出力。メインスレッドは Worker の生成・メッセージ受信のみ担当する。

**Tech Stack:** WebCodecs API, mp4box (demux), mp4-muxer (mux), Vite Web Worker (`new URL(..., import.meta.url)`)、Vitest (テスト)

---

### Task 1: パッケージ更新

**Files:**
- Modify: `package.json`

- [ ] **Step 1: @ffmpeg/ffmpeg を削除し mp4-muxer / mp4box をインストール**

```bash
cd "C:/Users/Yuzuki/Documents/GitHub/My-Portfolio"
npm uninstall @ffmpeg/ffmpeg
npm install mp4-muxer mp4box
npm install --save-dev @types/mp4box
```

- [ ] **Step 2: 既存テストがすべてパスすることを確認**

```bash
npm test
```

Expected: 全テスト PASS（ffmpeg に依存するテストはないため変化なし）

- [ ] **Step 3: コミット**

```bash
git add package.json package-lock.json
git commit -m "chore: @ffmpeg/ffmpeg 削除、mp4-muxer・mp4box 追加"
```

---

### Task 2: scaleOutput ユーティリティ — テスト作成（失敗確認）

**Files:**
- Create: `src/__tests__/unit/videocollect/videoCompressorUtils.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
// src/__tests__/unit/videocollect/videoCompressorUtils.test.ts
import { describe, it, expect } from 'vitest';
import { scaleOutput } from '@/app/videocollect/videoCompressorUtils';

describe('scaleOutput', () => {
  it('1920×1080 を medium (1280×720 上限) に縮小', () => {
    const result = scaleOutput(1920, 1080, 1280, 720);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  it('1280×720 は medium 上限と同じなので変化しない', () => {
    const result = scaleOutput(1280, 720, 1280, 720);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  it('640×360 は medium 上限より小さいので変化しない（スケールアップしない）', () => {
    const result = scaleOutput(640, 360, 1280, 720);
    expect(result).toEqual({ width: 640, height: 360 });
  });

  it('縦動画 1080×1920 を medium (1280×720 上限) に縮小 — 高さが制限', () => {
    // scale = min(1280/1080, 720/1920, 1.0) = min(1.185, 0.375, 1.0) = 0.375
    // w = round(1080 * 0.375 / 2) * 2 = round(202.5) * 2 = 203 * 2 = 406... wait
    // Actually: round(1080 * 0.375 / 2) * 2 = round(202.5) * 2 = 202 * 2 = 404? 
    // round(202.5) in JS = 203 (rounds half up), so 203 * 2 = 406
    // h = round(1920 * 0.375 / 2) * 2 = round(360) * 2 = 360 * 2 = 720
    const result = scaleOutput(1080, 1920, 1280, 720);
    expect(result.height).toBe(720);
    expect(result.width % 2).toBe(0); // 偶数
  });

  it('出力は常に偶数 — 奇数解像度の入力', () => {
    // 1281×721 を medium 上限へ
    const result = scaleOutput(1281, 721, 1280, 720);
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
  });

  it('high (maxWidth=Infinity, maxHeight=Infinity) は変化しない', () => {
    const result = scaleOutput(3840, 2160, Infinity, Infinity);
    expect(result).toEqual({ width: 3840, height: 2160 });
  });
});
```

- [ ] **Step 2: テストを実行して FAIL を確認（ファイルが存在しないため）**

```bash
npm test -- videoCompressorUtils
```

Expected: FAIL（`Cannot find module '@/app/videocollect/videoCompressorUtils'`）

---

### Task 3: videoCompressorUtils.ts を作成

**Files:**
- Create: `src/app/videocollect/videoCompressorUtils.ts`

- [ ] **Step 1: scaleOutput ユーティリティを実装**

```typescript
// src/app/videocollect/videoCompressorUtils.ts

/**
 * アスペクト比を維持しながら maxWidth/maxHeight に収まる出力サイズを計算する。
 * スケールアップはしない（scale は 1.0 を上限）。
 * 出力は VideoEncoder の要件に合わせ偶数に丸める。
 */
export function scaleOutput(
  origWidth: number,
  origHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / origWidth, maxHeight / origHeight, 1.0);
  return {
    width:  Math.round(origWidth  * scale / 2) * 2,
    height: Math.round(origHeight * scale / 2) * 2,
  };
}
```

- [ ] **Step 2: テストを実行して PASS を確認**

```bash
npm test -- videoCompressorUtils
```

Expected: 6 tests PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/videocollect/videoCompressorUtils.ts src/__tests__/unit/videocollect/videoCompressorUtils.test.ts
git commit -m "feat: scaleOutput ユーティリティを追加"
```

---

### Task 4: videoCompressorWorker.ts を作成

**Files:**
- Create: `src/app/videocollect/videoCompressorWorker.ts`

- [ ] **Step 1: Worker ファイルを作成**

```typescript
// src/app/videocollect/videoCompressorWorker.ts
import mp4box from 'mp4box';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { scaleOutput } from './videoCompressorUtils';

type WorkerQuality = 'high' | 'medium' | 'low';

interface WorkerInMessage {
  blob: Blob;
  quality: WorkerQuality;
}

type WorkerOutMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string; logs: string[] };

const PRESETS: Record<WorkerQuality, {
  maxWidth: number; maxHeight: number;
  videoBitrate: number; audioBitrate: number;
}> = {
  high:   { maxWidth: Infinity, maxHeight: Infinity, videoBitrate: 4_000_000, audioBitrate: 128_000 },
  medium: { maxWidth: 1280,     maxHeight: 720,      videoBitrate: 2_000_000, audioBitrate: 96_000  },
  low:    { maxWidth: 854,      maxHeight: 480,      videoBitrate: 800_000,   audioBitrate: 64_000  },
};

// ─── Demux ───────────────────────────────────────────────────────────────────

interface VideoTrackInfo {
  id: number; codec: string;
  timescale: number; duration: number; nb_samples: number;
  video: { width: number; height: number };
}
interface AudioTrackInfo {
  id: number; codec: string;
  timescale: number; duration: number; nb_samples: number;
  audio: { channel_count: number; sample_rate: number };
}
interface DemuxResult {
  videoTrack: VideoTrackInfo;
  audioTrack: AudioTrackInfo;
  videoSamples: mp4box.MP4Sample[];
  audioSamples: mp4box.MP4Sample[];
  videoDescription: Uint8Array | undefined;
  audioDescription: Uint8Array | undefined;
}

function getBoxDescription(file: mp4box.ISOFile, trackId: number): Uint8Array | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = (file as any).getTrackById(trackId)
    ?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const box = entry?.avcC ?? entry?.hvcC ?? entry?.vpcC;
  if (!box) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = new (mp4box as any).DataStream(undefined, 0, (mp4box as any).DataStream.BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array(stream.buffer, 8); // 8バイトのボックスヘッダをスキップ
}

function getAudioDescription(file: mp4box.ISOFile, trackId: number): Uint8Array | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (file as any).getTrackById(trackId)
      ?.mdia?.minf?.stbl?.stsd?.entries?.[0];
    const esds = entry?.esds ?? entry?.mp4a?.esds;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asc: unknown = (esds as any)?.esd?.descs?.[0]?.decConfigDescr?.decSpecificInfo?.data;
    return asc instanceof Uint8Array ? asc : undefined;
  } catch {
    return undefined;
  }
}

function demux(arrayBuffer: ArrayBuffer): Promise<DemuxResult> {
  return new Promise((resolve, reject) => {
    const file = mp4box.createFile();
    const videoSamples: mp4box.MP4Sample[] = [];
    const audioSamples: mp4box.MP4Sample[] = [];
    let videoTrack!: VideoTrackInfo;
    let audioTrack!: AudioTrackInfo;
    let totalVideo = 0;
    let totalAudio = 0;

    const tryResolve = () => {
      if (videoSamples.length >= totalVideo && audioSamples.length >= totalAudio && totalVideo > 0) {
        resolve({
          videoTrack, audioTrack, videoSamples, audioSamples,
          videoDescription: getBoxDescription(file, videoTrack.id),
          audioDescription: getAudioDescription(file, audioTrack.id),
        });
      }
    };

    file.onReady = (info: mp4box.MP4Info) => {
      if (!info.videoTracks.length) { reject(new Error('映像トラックが見つかりません')); return; }
      if (!info.audioTracks.length) { reject(new Error('音声トラックが見つかりません')); return; }
      videoTrack = info.videoTracks[0] as unknown as VideoTrackInfo;
      audioTrack = info.audioTracks[0] as unknown as AudioTrackInfo;
      totalVideo = videoTrack.nb_samples;
      totalAudio = audioTrack.nb_samples;
      file.setExtractionOptions(videoTrack.id, 'video', { nbSamples: Infinity });
      file.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: Infinity });
      file.start();
    };

    file.onSamples = (_id: number, user: unknown, samples: mp4box.MP4Sample[]) => {
      if (user === 'video') videoSamples.push(...samples);
      else if (user === 'audio') audioSamples.push(...samples);
      tryResolve();
    };

    file.onError = (e: string) => reject(new Error(e));

    const buf = arrayBuffer as mp4box.MP4ArrayBuffer;
    buf.fileStart = 0;
    file.appendBuffer(buf);
    file.flush();
  });
}

// ─── Codec selection ─────────────────────────────────────────────────────────

async function selectVideoCodec(
  width: number, height: number,
  bitrate: number, framerate: number,
): Promise<string> {
  for (const codec of ['avc1.640028', 'avc1.42001f']) {
    const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
    if (supported) return codec;
  }
  throw new Error('H.264 エンコードに対応していません');
}

// ─── Main compress ───────────────────────────────────────────────────────────

async function runCompress(blob: Blob, quality: WorkerQuality, logs: string[]): Promise<Blob> {
  const preset = PRESETS[quality];
  const post = (msg: WorkerOutMessage) =>
    (self as DedicatedWorkerGlobalScope).postMessage(msg);

  const { videoTrack, audioTrack, videoSamples, audioSamples, videoDescription, audioDescription } =
    await demux(await blob.arrayBuffer());

  const { width: outW, height: outH } = scaleOutput(
    videoTrack.video.width, videoTrack.video.height,
    preset.maxWidth, preset.maxHeight,
  );

  const fps = Math.max(1, Math.min(120,
    Math.round(videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale)),
  ));
  const videoCodec = await selectVideoCodec(outW, outH, preset.videoBitrate, fps);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: outW, height: outH },
    audio: { codec: 'aac', numberOfChannels: audioTrack.audio.channel_count, sampleRate: audioTrack.audio.sample_rate },
    fastStart: 'in-memory',
  });

  const totalFrames = videoSamples.length;
  let frameIndex = 0;
  const needsScale = outW !== videoTrack.video.width || outH !== videoTrack.video.height;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { logs.push(`[VideoEncoder] ${e.message}`); },
  });
  videoEncoder.configure({
    codec: videoCodec, width: outW, height: outH,
    bitrate: preset.videoBitrate, framerate: fps,
  });

  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      const ts = frame.timestamp;
      let encodeFrame: VideoFrame;
      if (needsScale) {
        const canvas = new OffscreenCanvas(outW, outH);
        canvas.getContext('2d')!.drawImage(frame, 0, 0, outW, outH);
        frame.close();
        encodeFrame = new VideoFrame(canvas, { timestamp: ts });
      } else {
        encodeFrame = frame;
      }
      videoEncoder.encode(encodeFrame, { keyFrame: frameIndex % 60 === 0 });
      encodeFrame.close();
      frameIndex++;
      post({ type: 'progress', ratio: frameIndex / totalFrames });
    },
    error: (e) => { logs.push(`[VideoDecoder] ${e.message}`); },
  });
  videoDecoder.configure({
    codec: videoTrack.codec,
    codedWidth: videoTrack.video.width,
    codedHeight: videoTrack.video.height,
    ...(videoDescription ? { description: videoDescription } : {}),
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { logs.push(`[AudioEncoder] ${e.message}`); },
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: audioTrack.audio.sample_rate,
    numberOfChannels: audioTrack.audio.channel_count,
    bitrate: preset.audioBitrate,
  });

  const audioDecoder = new AudioDecoder({
    output: (audioData) => {
      audioEncoder.encode(audioData);
      audioData.close();
    },
    error: (e) => { logs.push(`[AudioDecoder] ${e.message}`); },
  });
  audioDecoder.configure({
    codec: audioTrack.codec,
    sampleRate: audioTrack.audio.sample_rate,
    numberOfChannels: audioTrack.audio.channel_count,
    ...(audioDescription ? { description: audioDescription } : {}),
  });

  for (const sample of videoSamples) {
    videoDecoder.decode(new EncodedVideoChunk({
      type:      sample.is_sync ? 'key' : 'delta',
      timestamp: Math.round((sample.cts      / videoTrack.timescale) * 1_000_000),
      duration:  Math.round((sample.duration / videoTrack.timescale) * 1_000_000),
      data:      sample.data,
    }));
  }

  for (const sample of audioSamples) {
    audioDecoder.decode(new EncodedAudioChunk({
      type:      sample.is_sync ? 'key' : 'delta',
      timestamp: Math.round((sample.cts      / audioTrack.timescale) * 1_000_000),
      duration:  Math.round((sample.duration / audioTrack.timescale) * 1_000_000),
      data:      sample.data,
    }));
  }

  await videoDecoder.flush();
  await audioDecoder.flush();
  await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);

  videoDecoder.close();
  audioDecoder.close();
  videoEncoder.close();
  audioEncoder.close();

  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(self as DedicatedWorkerGlobalScope).onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const { blob, quality } = event.data;
  const logs: string[] = [];
  try {
    const result = await runCompress(blob, quality, logs);
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'done', blob: result } satisfies WorkerOutMessage);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'error', message, logs } satisfies WorkerOutMessage);
  }
};
```

- [ ] **Step 2: TypeScript エラーがないことを確認**

```bash
npx tsc --noEmit
```

`mp4box` の型定義が古い場合は `as unknown as VideoTrackInfo` などで対処する（既に Task 4 Step 1 のコードに含まれている）。

- [ ] **Step 3: コミット**

```bash
git add src/app/videocollect/videoCompressorWorker.ts
git commit -m "feat: videoCompressorWorker — WebCodecs mp4 圧縮パイプラインを追加"
```

---

### Task 5: videoCompressor.ts を書き換え

**Files:**
- Modify: `src/app/videocollect/videoCompressor.ts`（完全書き換え）

- [ ] **Step 1: ファイルを書き換える**

```typescript
// src/app/videocollect/videoCompressor.ts

export type Quality = 'original' | 'high' | 'medium' | 'low';

const QUALITY_PRESETS: Record<Quality, { label: string; description: string }> = {
  original: { label: 'オリジナル', description: '圧縮なし・最大サイズ（バックグラウンド保存対応）' },
  high:     { label: '高画質',    description: '元の解像度を維持' },
  medium:   { label: '中画質',    description: '720p に縮小' },
  low:      { label: '低画質',    description: '480p に縮小' },
};

export const QUALITY_INFO = QUALITY_PRESETS;

export function estimatedSizeRatio(quality: Quality): number {
  return { original: 1.0, high: 0.7, medium: 0.4, low: 0.2 }[quality];
}

// ─── Support check ────────────────────────────────────────────────────────────

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

// ─── Worker message types (shared with Worker) ───────────────────────────────

type WorkerOutMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string; logs: string[] };

// ─── Compress ─────────────────────────────────────────────────────────────────

export async function compressVideo(
  blob: Blob,
  quality: Quality,
  onProgress: (ratio: number) => void,
  onLog?: (line: string) => void,
): Promise<Blob> {
  if (quality === 'original') {
    onProgress(1);
    return blob;
  }

  onProgress(0);

  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(
      new URL('./videoCompressorWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress(Math.max(0, Math.min(1, msg.ratio)));
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.blob);
      } else if (msg.type === 'error') {
        worker.terminate();
        msg.logs.forEach(line => onLog?.(line));
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };

    worker.postMessage({ blob, quality });
  });
}
```

- [ ] **Step 2: TypeScript エラーがないことを確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: コミット**

```bash
git add src/app/videocollect/videoCompressor.ts
git commit -m "feat: videoCompressor を WebCodecs Worker ベースに書き換え"
```

---

### Task 6: isWebCodecsSupported と compressVideo(original) のテスト

**Files:**
- Create: `src/__tests__/unit/videocollect/videoCompressor.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
// src/__tests__/unit/videocollect/videoCompressor.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isWebCodecsSupported, compressVideo } from '@/app/videocollect/videoCompressor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isWebCodecsSupported', () => {
  it('VideoEncoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('VideoDecoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', {});
    vi.stubGlobal('VideoDecoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('AudioEncoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', {});
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('AudioDecoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', {});
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', {});
    vi.stubGlobal('AudioDecoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('isConfigSupported が supported: false を返す場合 false', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: false }),
    });
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', {});
    vi.stubGlobal('AudioDecoder', {});
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('isConfigSupported が supported: true を返す場合 true', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
    });
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', {});
    vi.stubGlobal('AudioDecoder', {});
    expect(await isWebCodecsSupported()).toBe(true);
  });
});

describe('compressVideo — original quality', () => {
  it('quality が original のとき blob をそのまま返す', async () => {
    const blob = new Blob(['dummy'], { type: 'video/mp4' });
    const onProgress = vi.fn();
    const result = await compressVideo(blob, 'original', onProgress);
    expect(result).toBe(blob);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('quality が original のとき Worker を生成しない', async () => {
    const MockWorker = vi.fn();
    vi.stubGlobal('Worker', MockWorker);
    const blob = new Blob(['dummy'], { type: 'video/mp4' });
    await compressVideo(blob, 'original', vi.fn());
    expect(MockWorker).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行して PASS を確認**

```bash
npm test -- videoCompressor.test
```

Expected: 7 tests PASS

- [ ] **Step 3: コミット**

```bash
git add src/__tests__/unit/videocollect/videoCompressor.test.ts
git commit -m "test: isWebCodecsSupported と compressVideo(original) のテストを追加"
```

---

### Task 7: downloadQueue.ts から loading-ffmpeg フェーズを削除

**Files:**
- Modify: `src/app/videocollect/downloadQueue.ts`

- [ ] **Step 1: `DownloadPhase` 型から `'loading-ffmpeg'` を削除**

`downloadQueue.ts:5` の型定義を変更:
```typescript
// 変更前
export type DownloadPhase =
  | 'fetching'
  | 'loading-ffmpeg'
  | 'compressing'
  | 'saving'
  | 'done'
  | 'error';

// 変更後
export type DownloadPhase =
  | 'fetching'
  | 'compressing'
  | 'saving'
  | 'done'
  | 'error';
```

- [ ] **Step 2: `runInPageFetchAndCompress` の `onProgress` コールバックを修正**

`downloadQueue.ts:405-415` を変更:
```typescript
// 変更前
const compressed = await compressVideo(
  rawBlob,
  quality,
  (ratio) => {
    if (signal.aborted) return;
    patch(fileId, ratio < 0
      ? { phase: 'loading-ffmpeg', progress: 0 }
      : { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) },
    );
  },
  (line) => { logs.push(line); },
);

// 変更後
const compressed = await compressVideo(
  rawBlob,
  quality,
  (ratio) => {
    if (signal.aborted) return;
    patch(fileId, { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) });
  },
  (line) => { logs.push(line); },
);
```

- [ ] **Step 3: `runCompressionFromRaw` の `onProgress` コールバックを修正**

`downloadQueue.ts:287-296` を変更:
```typescript
// 変更前
const compressed = await compressVideo(
  raw.rawBlob,
  quality as Quality,
  (ratio) => {
    patch(fileId, ratio < 0
      ? { phase: 'loading-ffmpeg', progress: 0 }
      : { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) },
    );
  },
  (line) => { logs.push(line); },
);

// 変更後
const compressed = await compressVideo(
  raw.rawBlob,
  quality as Quality,
  (ratio) => {
    patch(fileId, { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) });
  },
  (line) => { logs.push(line); },
);
```

- [ ] **Step 4: `resumePendingCompressions` の `phase` を修正**

`downloadQueue.ts:147` を変更:
```typescript
// 変更前
tasks.set(entry.fileId, { fileId: entry.fileId, fileName: entry.fileName, phase: 'loading-ffmpeg', progress: 0 });

// 変更後
tasks.set(entry.fileId, { fileId: entry.fileId, fileName: entry.fileName, phase: 'compressing', progress: 0 });
```

- [ ] **Step 5: SW メッセージ `vc-bgfetch-raw-done` 受信時の phase を修正**

`downloadQueue.ts:81-86` を変更:
```typescript
// 変更前
} else if (data.type === 'vc-bgfetch-raw-done') {
  bgFetchRegs.delete(fileId);
  if (!tasks.has(fileId)) {
    tasks.set(fileId, { fileId, fileName, phase: 'loading-ffmpeg', progress: 0 });
    notify();
  } else {
    patch(fileId, { phase: 'loading-ffmpeg', progress: 0 });
  }

// 変更後
} else if (data.type === 'vc-bgfetch-raw-done') {
  bgFetchRegs.delete(fileId);
  if (!tasks.has(fileId)) {
    tasks.set(fileId, { fileId, fileName, phase: 'compressing', progress: 0 });
    notify();
  } else {
    patch(fileId, { phase: 'compressing', progress: 0 });
  }
```

- [ ] **Step 6: `tryStartBgFetch` の progress ハンドラを修正**

`downloadQueue.ts:260-264` を変更:
```typescript
// 変更前
if (quality !== 'original') {
  patch(fileId, { phase: 'loading-ffmpeg', progress: 0 });
}

// 変更後
if (quality !== 'original') {
  patch(fileId, { phase: 'compressing', progress: 0 });
}
```

- [ ] **Step 7: TypeScript エラーがないことを確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: コミット**

```bash
git add src/app/videocollect/downloadQueue.ts
git commit -m "refactor: downloadQueue から loading-ffmpeg フェーズを削除"
```

---

### Task 8: DownloadProgressCard.tsx を更新

**Files:**
- Modify: `src/app/videocollect/DownloadProgressCard.tsx`

- [ ] **Step 1: `PHASE_LABEL` から `loading-ffmpeg` を削除**

`DownloadProgressCard.tsx:4-11` を変更:
```typescript
// 変更前
const PHASE_LABEL: Record<string, string> = {
  'fetching':       '取得中',
  'loading-ffmpeg': '圧縮エンジン読み込み中',
  'compressing':    '圧縮中',
  'saving':         '保存中',
  'done':           '保存完了',
  'error':          'エラー',
};

// 変更後
const PHASE_LABEL: Record<string, string> = {
  'fetching':    '取得中',
  'compressing': '圧縮中',
  'saving':      '保存中',
  'done':        '保存完了',
  'error':       'エラー',
};
```

- [ ] **Step 2: TypeScript エラーがないことを確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: コミット**

```bash
git add src/app/videocollect/DownloadProgressCard.tsx
git commit -m "refactor: DownloadProgressCard から loading-ffmpeg ラベルを削除"
```

---

### Task 9: OfflineSaveModal.tsx に WebCodecs サポートチェックを追加

**Files:**
- Modify: `src/app/videocollect/modals/OfflineSaveModal.tsx`

- [ ] **Step 1: isWebCodecsSupported のインポートと state を追加**

ファイル冒頭のインポートに追加:
```typescript
import { type Quality, QUALITY_INFO, estimatedSizeRatio, isWebCodecsSupported } from '../videoCompressor';
```

コンポーネント内に state を追加（`const [quality, setQuality]` の直後）:
```typescript
const [webCodecsSupported, setWebCodecsSupported] = useState<boolean | null>(null);

useEffect(() => {
  isWebCodecsSupported().then(setWebCodecsSupported).catch(() => setWebCodecsSupported(false));
}, []);
```

- [ ] **Step 2: 品質ボタンに非対応時の disabled を追加**

`QUALITIES.map(q => ...)` のボタン部分を変更。
```typescript
// 変更前
<button
  key={q}
  onClick={() => setQuality(q)}
  style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: quality === q ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
    outline: quality === q ? '1px solid rgba(96,165,250,0.6)' : 'none',
  }}
>

// 変更後
const isDisabled = q !== 'original' && webCodecsSupported === false;
return (
  <button
    key={q}
    onClick={() => !isDisabled && setQuality(q)}
    disabled={isDisabled}
    style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', borderRadius: 8, border: 'none',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.4 : 1,
      background: quality === q ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
      outline: quality === q ? '1px solid rgba(96,165,250,0.6)' : 'none',
    }}
  >
```

- [ ] **Step 3: 非対応時の説明文を追加**

`wouldExceed` の警告文の直前に追加:
```typescript
{webCodecsSupported === false && (
  <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 12 }}>
    このブラウザでは圧縮に対応していません（iOS 16.4 以上が必要です）。オリジナル画質のみ保存できます。
  </p>
)}
```

- [ ] **Step 4: TypeScript エラーがないことを確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: コミット**

```bash
git add src/app/videocollect/modals/OfflineSaveModal.tsx
git commit -m "feat: OfflineSaveModal に WebCodecs サポートチェックを追加"
```

---

### Task 10: OfflineSaveModal のサポートチェック動作テスト

**Files:**
- Create: `src/__tests__/integration/videocollect/OfflineSaveModal.test.tsx`

- [ ] **Step 1: テストファイルを作成**

```typescript
// src/__tests__/integration/videocollect/OfflineSaveModal.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OfflineSaveModal } from '@/app/videocollect/modals/OfflineSaveModal';

// offlineStorage と downloadQueue をモック
vi.mock('@/app/videocollect/offlineStorage', () => ({
  getOfflineStorageUsage: vi.fn().mockResolvedValue({ count: 0, totalBytes: 0 }),
  getStorageLimitGb: vi.fn().mockReturnValue(5),
  checkQuota: vi.fn().mockResolvedValue('ok'),
}));

vi.mock('@/app/videocollect/downloadQueue', () => ({
  startDownload: vi.fn(),
}));

// isWebCodecsSupported をモック
vi.mock('@/app/videocollect/videoCompressor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/videocollect/videoCompressor')>();
  return { ...actual, isWebCodecsSupported: vi.fn() };
});

const defaultProps = {
  fileId: 'file1',
  fileName: 'test.mp4',
  fileSize: '10000000',
  proxyUrl: 'https://proxy.example.com',
  accessToken: 'token',
  onClose: vi.fn(),
  addToast: vi.fn(),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfflineSaveModal — WebCodecs サポートチェック', () => {
  it('WebCodecs 非対応時に high/medium/low ボタンが disabled になる', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(false);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /高画質/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /中画質/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /低画質/ })).toBeDisabled();
    });
  });

  it('WebCodecs 非対応時に original ボタンは disabled にならない', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(false);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /オリジナル/ })).not.toBeDisabled();
    });
  });

  it('WebCodecs 非対応時に警告文が表示される', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(false);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/iOS 16.4 以上が必要/)).toBeInTheDocument();
    });
  });

  it('WebCodecs 対応時は全ボタンが有効', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(true);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /高画質/ })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /中画質/ })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /低画質/ })).not.toBeDisabled();
    });
  });
});
```

- [ ] **Step 2: テストを実行して PASS を確認**

```bash
npm test -- OfflineSaveModal.test
```

Expected: 4 tests PASS

- [ ] **Step 3: コミット**

```bash
git add src/__tests__/integration/videocollect/OfflineSaveModal.test.tsx
git commit -m "test: OfflineSaveModal の WebCodecs サポートチェックテストを追加"
```

---

### Task 11: 全テスト実行と docs 更新

**Files:**
- Modify: `docs/videocollect.md`
- Modify: `docs/README.md`

- [ ] **Step 1: 全テストを実行**

```bash
npm test
```

Expected: 全テスト PASS

- [ ] **Step 2: docs/videocollect.md の「オフラインストレージ」セクションを更新**

`docs/videocollect.md` の「オフラインストレージ」セクション内:

```markdown
<!-- 変更: ファイル一覧テーブル -->
| ファイル | 説明 |
|---|---|
| `src/app/videocollect/offlineStorage.ts` | IndexedDB CRUD（保存・取得・削除・一覧・使用量） |
| `src/app/videocollect/videoCompressorUtils.ts` | スケーリング計算ユーティリティ（純粋関数） |
| `src/app/videocollect/videoCompressor.ts` | WebCodecs Worker の生成・管理、`isWebCodecsSupported()`、Quality 型定義 |
| `src/app/videocollect/videoCompressorWorker.ts` | Web Worker — mp4box demux → VideoDecoder/Encoder → AudioDecoder/Encoder → mp4-muxer |
| `src/app/videocollect/modals/OfflineSaveModal.tsx` | 品質選択・進捗表示モーダル（非対応ブラウザ警告付き） |
```

```markdown
<!-- 変更: 圧縮品質プリセットテーブル -->
| ラベル | 解像度 | 映像ビットレート | 音声ビットレート | 推定サイズ比 |
|---|---|---|---|---|
| 高画質 | 元の解像度 | 4 Mbps | 128 kbps | 約 70% |
| 中画質 | 720p | 2 Mbps | 96 kbps | 約 40% |
| 低画質 | 480p | 800 kbps | 64 kbps | 約 20% |

WebCodecs API（`VideoEncoder` / `AudioDecoder` 等）を使用してブラウザのハードウェアエンコーダーで処理する。
`@ffmpeg/ffmpeg` (ffmpeg.wasm) は削除済み。

**サポート要件:** iOS Safari 16.4+、Chrome 94+。非対応ブラウザではモーダルで警告を表示し original のみ許可。
```

- [ ] **Step 3: docs/README.md のテスト件数を更新**

`docs/README.md` のテスト件数の記載箇所を確認し、追加したテスト数（videoCompressorUtils: 6件、videoCompressor: 7件、OfflineSaveModal: 4件 = +17件）を反映する。

- [ ] **Step 4: 最終コミット**

```bash
git add docs/videocollect.md docs/README.md
git commit -m "docs: WebCodecs 圧縮対応に合わせて videocollect.md を更新"
```
