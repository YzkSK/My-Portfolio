# 文字起こし（Transcribe） `/app/transcribe` と `/app/transcribe/play`

AI（Google Gemini）を使った動画ファイルの文字起こし・要約・キーワード抽出。

## 概要

- **アップロード対応形式**: MP4、MOV、WebM、AVI（100MB まで）
- **処理エンジン**: Google Generative AI API（Gemini 2.5 Flash）
- **言語対応**: 自動検出、日本語、英語、中国語
- **保存先**: Firestore `users/{uid}/transcribe/transcriptions/{id}`
- **UI**: マーケットプレイスで導入・アンインストール可能な独立アプリ

## ファイル構成

```
src/app/transcribe/
  constants.ts              型定義・エラーコード・バリデーション
  transcriptionService.ts   Gemini Files API + ストリーミング処理
  Transcribe.tsx            アップロード・一覧ページ
  TranscribePlay.tsx        詳細表示・編集・エクスポート・削除ページ
  TranscribeSettings.tsx    設定ページのセクション
  transcribe.css            スタイル
```

## 型定義

### `Transcription`

```typescript
type TranscriptionParagraph = {
  id: string;
  text: string;
  startTime?: number;  // 秒単位
  endTime?: number;
  speaker?: string | null;
};

type Transcription = {
  transcriptionId: string;
  fileId?: string;                    // Gemini Files API に upload した ID
  fileName: string;                   // アップロード時のファイル名
  language?: string;                  // 'auto' / 'ja' / 'en' / 'zh'
  text?: string;                      // 全文テキスト
  paragraphs?: TranscriptionParagraph[];
  keywords?: string[];                // AI 抽出キーワード
  summary?: string;                   // AI 生成要約
  confidence?: number;                // 信頼度（0-1）
  createdAt?: number;
  updatedAt?: number;
  processedAt?: number;               // 処理完了タイムスタンプ
};
```

### `TranscribeSettingsData`

```typescript
type TranscribeSettingsData = {
  defaultLanguage: 'auto' | 'ja' | 'en' | 'zh';
  autoDeleteDays: number | null;      // null = 無効
};
```

## Transcribe.tsx（アップロード・一覧ページ）

### 状態管理

```typescript
const [file, setFile] = useState<File | null>(null);
const [language, setLanguage] = useState<string>('auto');
const [processing, setProcessing] = useState(false);
const [transcriptions, dbError] = useFirestoreData<Transcription[]>({ ... });
```

### フロー

1. **ファイル選択**
   - 形式・サイズバリデーション（`validateVideoFile()`）
   - `SUPPORTED_VIDEO_TYPES`（mp4, quicktime, webm, avi）
   - `MAX_UPLOAD_BYTES` = 100MB
   - 失敗時: トースト表示（エラーコード `E102` / `E103`）

2. **処理開始**
   - `uploadVideoToGeminiFiles()` — Gemini Files API にアップロード（fileId 取得）
   - `generateTranscription()` — ストリーミングで JSON パース
   - JSON マーカー（`<<<JSON>>>` / `<<<END>>>`）で抽出
   - 解析失敗時: 生テキスト で fallback
   - Firestore に `setDoc()` で保存（デバウンスなし、即保存）

3. **一覧表示**
   - `users/{uid}/transcribe/transcriptions` コレクションを読み込み（`useFirestoreData`）
   - アイテムクリック → `/app/transcribe/play?id={id}` に遷移

### エラーハンドリング

| エラーコード | 状況 | 対応 |
|---|---|---|
| E101 | API キー未設定 | トースト表示 |
| E102 | 無効なファイル形式 | トースト表示 |
| E103 | ファイルサイズ超過 | トースト表示 |
| E104 | Gemini API エラー | トースト表示 |
| E105 | 不正なレスポンス | トースト表示 |

## TranscribePlay.tsx（詳細・編集ページ）

### 状態管理

```typescript
const [editText, setEditText] = useState(transcription?.text ?? '');
const [isDirty, setIsDirty] = useState(false);
const [showDeleteDialog, setShowDeleteDialog] = useState(false);
const [isDeleting, setIsDeleting] = useState(false);
```

### UI パターン

1. **テキスト編集**
   - `<textarea>` で `transcription.text` を編集
   - 変更時 `isDirty = true`

2. **保存**
   - `onSave()` — `setDoc(..., { merge: true })` で更新
   - `updatedAt` を `Date.now()` に更新
   - 成功時: トースト表示

3. **削除確認ダイアログ**
   - Radix UI `<Dialog>` コンポーネント
   - ファイル名表示＋キャンセル・削除ボタン
   - 削除時: `deleteDoc()` + 一覧ページへ戻す

4. **エクスポート**
  - 「エクスポート」ボタンから形式を選択
  - TXT: 文字起こし本文をそのままダウンロード
  - JSON: メタデータ込みでダウンロード
   - `Blob` 生成 → `URL.createObjectURL()`
   - `<a download>` で自動ダウンロード

### クエリパラメーター

- `?id={transcriptionId}` — 詳細を読み込む

## TranscribeSettings.tsx（設定ページ）

### UI

- **デフォルト言語**: セレクトボックス（自動検出／日本語／英語／中国語）
- **自動削除**: 数値入力（日数、null で無効化）
- **保存ボタン**: `useFirestoreSave` で 800ms デバウンス

### Firestore パス

```
users/{uid}/transcribe/settings
  { defaultLanguage: 'ja', autoDeleteDays: 30 }
```

## transcriptionService.ts（ビジネスロジック）

### `validateVideoFile(file: File)`

```typescript
{ valid: boolean; error?: string }
```

- MIME type チェック
- ファイルサイズ ≤ 100MB

### `uploadVideoToGeminiFiles(file: File)`

```typescript
Promise<string>  // fileId
```

- **実装**: REST API fetch to Google Cloud Storage endpoint
  - Endpoint: `https://www.googleapis.com/upload/storage/v1/b/generative-ai-studio-uploads/o?uploadType=multipart`
  - 失敗時: mock fileId (`mock-${Date.now()}`) で continue
  - 詳細エラーは `console.warn` で出力

### `generateTranscription(fileId: string, language?: string)`

```typescript
Promise<Transcription>
```

**フロー:**

1. `getGenerativeModel()` で Gemini クライアント取得（`src/app/shared/geminiClient.ts`）
2. Prompt 構築
   ```
   以下のビデオファイル (fileId: ...) を文字起こししてください。
   言語: (指定または自動検出)
   
   JSON 形式で以下を返してください:
   <<<JSON>>>
   {
     "text": "...",
     "paragraphs": [...],
     "keywords": [...],
     "summary": "...",
     "language": "ja",
     "confidence": 0.95
   }
   <<<END>>>
   ```
3. `streamGenerate()` でストリーミング処理
4. 累積テキストから `<<<JSON>>>...<<<END>>>` を正規表現で抽出
5. JSON パース
   - 成功: `parseTranscription()` で型チェック
   - 失敗: 生テキスト を `text` フィールドで返す（`confidence = 0`）

## Firestore スキーマ

```
users/{uid}/
  transcribe/
    transcriptions/
      {transcriptionId}
        transcriptionId: string
        fileId?: string
        fileName: string
        language?: string
        text?: string
        paragraphs?: TranscriptionParagraph[]
        keywords?: string[]
        summary?: string
        confidence?: number
        createdAt: number
        updatedAt: number
        processedAt?: number
    settings
      defaultLanguage: 'auto' | 'ja' | 'en' | 'zh'
      autoDeleteDays: number | null
```

## プラットフォーム統合

### Marketplace

- **ID**: `transcribe`
- **ラベル**: 文字起こし
- **アイコン**: 📝
- **説明**: 動画の文字起こし・要約・キーワード抽出

### Migration

- 既存ユーザー: `users/{uid}/transcribe/transcriptions` が存在するとインストール済みと判定

### アンインストール

- 削除対象: `transcriptions` コレクション全体 + `transcribe/settings` ドキュメント
- 実装: `onUninstall()` callback で `getDocs()` + `deleteDoc()`

## 主要な規約

- **debounce**: Transcribe.tsx での保存は即座（デバウンスなし）
- **エラーコード**: `E101` 〜 `E105`、設定エラー `E201`
- **ローディング**: `useSetLoading('transcribe', true/false)`
- **型検証**: `parseTranscription()` で Firestore データを厳密化
- **AI ストリーミング**: `streamGenerate()` 経由（`geminiClient.ts` 共用）

## テスト

- `src/__tests__/unit/transcribe/transcriptionService.test.ts`
  - JSON 解析の成功・失敗ケース
  - マーカー抽出ロジック

---

**最終更新**: 2026-05-01（SettingsSection 追加、削除ダイアログ実装）

