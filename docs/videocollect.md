# Videocollect（動画ビューワー）

## 概要

Google Drive 内の動画ファイルをグリッド表示・再生できる機能。

- パス: `/app/videocollect`（動画一覧）、`/app/videocollect/play`（プレイヤー）
- 要認証: `ProtectedRoute` でラップ
- Google Drive 連携（OAuth 2.0）が必要

---

## Google OAuth 連携フロー

1. ユーザーが `/app/settings` の「外部連携」セクションで「接続する」をクリック
2. `@react-oauth/google` の `useGoogleLogin({ flow: 'auth-code', ux_mode: 'redirect' })` でリダイレクト起動
3. コールバックで認証コードを受け取り Worker の `POST /oauth/exchange` に送信（Firebase IDトークン付き）
4. Worker がIDトークンを検証し、Googleとコードを交換して `accessToken + refreshToken + tokenExpiry` を取得
5. Worker が Firestore `users/{uid}/videocollect/auth` にトークン情報を保存
6. 以降のアクセスで `accessToken` が5分以内に期限切れの場合、Worker の `POST /oauth/refresh` で自動更新

---

## Firestore パス

```
users/{uid}/videocollect/auth   →  VcAuth { accessToken, refreshToken, tokenExpiry }
users/{uid}/videocollect/data   →  VcData { folders: DriveFolder[], tags: Record<fileId, string[]> }
```

- `auth`: 設定画面の接続ボタンで Worker 経由で書き込まれる。フロントから直接書き込まない。
- `data`: `useFirestoreData` + `useFirestoreSave`（800ms デバウンス）で管理。

---

## ファイル構成

```
src/app/videocollect/
  constants.ts          型定義・エラーコード・Drive API 関数・ユーティリティ
  videocollect.css      --vc-* CSS 変数・全スタイル
  Videocollect.tsx      動画一覧ページ（グリッド・タグ/並べ替えフィルター・モーダル管理）
  VideoPlayer.tsx       動画プレイヤーページ
  views/
    VideoGrid.tsx       グリッドレイアウト
    VideoCard.tsx       動画カード（サムネイル・プレビュー・タグ）
  modals/
    FolderModal.tsx     フォルダ選択（パンくずリスト・チェックボックス）
    FilterModal.tsx     タグ絞り込み・並べ替え設定
    TagModal.tsx        タグ編集（既存タグ選択・オートコンプリート）
    UploadModal.tsx     動画アップロード（複数ファイル・ドラッグ＆ドロップ・resumable upload）

workers/drive-proxy/
  src/index.ts          Cloudflare Worker（ストリーミングプロキシ・OAuth・IDトークン検証）
  wrangler.toml
  package.json
```

---

## Cloudflare Worker エンドポイント

| エンドポイント | 用途 |
|---|---|
| `GET /stream/{fileId}?token=` | 動画ストリーミング（Range ヘッダープロキシ） |
| `POST /oauth/exchange` | `{ code, uid, idToken, redirectUri }` → トークン交換・Firestore 保存 |
| `POST /oauth/refresh` | `{ uid, idToken }` → リフレッシュトークンで accessToken 更新 |

Worker の CORS は `ALLOWED_ORIGIN` 環境変数で指定したオリジンのみ許可。

`/oauth/exchange` と `/oauth/refresh` は Firebase IDトークンを検証し、リクエスト内 `uid` と一致する場合のみ処理する。

---

## 環境変数

| 変数 | 説明 | 設定場所 |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth クライアント ID | `.env` / Cloudflare Pages |
| `VITE_DRIVE_PROXY_URL` | drive-proxy Worker の公開 URL | `.env` / Cloudflare Pages |
| `ALLOWED_ORIGIN` | Worker の CORS 許可オリジン | Cloudflare Worker vars |
| `FIREBASE_PROJECT_ID` | Firebase プロジェクト ID | Cloudflare Worker vars |
| `FIREBASE_WEB_API_KEY` | Firebase Web API キー（IDトークン検証用） | Cloudflare Worker vars |
| `GOOGLE_OAUTH_CLIENT_ID` | Worker 側 OAuth クライアント ID | Cloudflare Worker vars |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth クライアントシークレット | Cloudflare Worker secrets |
| `GOOGLE_SERVICE_ACCOUNT` | Firebase サービスアカウント JSON | Cloudflare Worker secrets |

---

## 主要な型

```typescript
type DriveFile = {
  id: string; name: string; mimeType: string;
  size: string; modifiedTime: string;
  thumbnailLink?: string;
  videoMediaMetadata?: { durationMillis?: string; width?: number; height?: number };
};

type DriveFolder = { id: string; name: string };

type VcData = {
  folders: DriveFolder[];
  tags: Record<string, string[]>;   // fileId → タグ一覧
};

type VcAuth = {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;   // Unix timestamp (ms)
};
```

---

## 動画一覧ページ（Videocollect.tsx）

### 状態

```typescript
type PageState =
  | { status: 'unauthenticated' }  // refreshToken なし → 設定画面へ誘導
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'loaded'; files: DriveFile[] };

type Modal =
  | null
  | { type: 'folder' }
  | { type: 'upload' }
  | { type: 'filter' }
  | { type: 'tag'; file: DriveFile };
```

### 処理フロー

1. `useFirestoreData` で VcData（フォルダ・タグ）を読み込み
2. `getDoc` で VcAuth を読み込み
3. `currentUser.getIdToken()` で Firebase IDトークンを取得
4. `loadAccessToken(uid, auth, idToken)` で有効なアクセストークンを取得（必要に応じて Worker でリフレッシュ）
5. `fetchAllDriveFiles()` でフォルダフィルターを適用して動画一覧を全件取得
6. タグフィルター・並べ替えはクライアントサイドで適用

### タグフィルター・並べ替え（FilterModal）

- タグ: OR 条件（選択タグのいずれかを持つファイルを表示）
- 並べ替え: 日付（新しい順/古い順）・名前（昇順/降順）・サイズ（大きい順/小さい順）

---

## 動画プレイヤー（VideoPlayer.tsx）

`/app/videocollect/play?id={fileId}&name={fileName}` で起動。

### 機能

- 再生/停止、シークバー（バッファ済み範囲を薄色で表示）
- スキップ秒数設定（設定モーダルで変更可、デフォルト10秒）
- 音量ミュート、再生速度変更（0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x）
- フルスクリーン（標準 Fullscreen API + iOS Safari フォールバック）
- ダウンロード（Worker プロキシ URL で `<a download>` クリック）
- コントロール 3秒後自動非表示（一時停止中は常時表示）
- タグ編集（VideoPlayer 画面からも TagModal を開ける）
- 設定モーダル: フルスクリーン中も表示（container 内に絶対配置）

### エラー表示

| 状態 | 表示 |
|---|---|
| Google Drive 処理中 | 「Google Drive が動画を処理中です」メッセージ |
| コーデック非対応（`videoWidth === 0`） | 黄色い警告バナー（H.265、ハードウェアアクセラレーション有効化を案内） |
| その他エラー | 「動画を読み込めませんでした」＋再試行ボタン |

### キーボードショートカット

| キー | 操作 |
|---|---|
| Space / K | 再生/停止 |
| ← | -5秒 |
| → | +5秒 |
| ↑ | 音量 +10% |
| ↓ | 音量 -10% |
| M | ミュート切り替え |
| F | フルスクリーン切り替え |

### モバイルダブルタップ

- 画面左側でダブルタップ → -N秒（設定モーダルで変更可）
- 画面右側でダブルタップ → +N秒
- 300ms 以内の同一サイドへの2回タップで判定
- 連続ダブルタップで秒数を加算（例: 3回連続 → 30秒）

### フルスクリーン時の安全領域対応

```css
.vc-player-controls-inner {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  padding-left:   max(16px, env(safe-area-inset-left));
  padding-right:  max(16px, env(safe-area-inset-right));
}
```

---

## VideoCard（views/VideoCard.tsx）

- カードクリック: 10秒間ミュートプレビュー再生（プロキシ経由）
- サムネクリック: プレイヤーページへ遷移
- レイアウト: サムネイル → タイトル → 日付 → タグ

---

## アップロード（UploadModal）

- 複数ファイル同時選択・ドラッグ＆ドロップ対応
- Google Drive Resumable Upload API 使用
- ファイルごとに順番にアップロード（一部失敗しても継続）
- 全体進捗バー（N/M 完了・%）を表示。ファイル別進捗は折りたたみ展開
- 推奨形式: H.264 (MP4)。H.265 は Chrome（ハードウェアアクセラレーション無効時）で再生不可

---

## Drive API

- ファイル・フォルダ一覧: クライアントから直接 `https://www.googleapis.com/drive/v3/files` を呼び出し（CORS 問題なし）
- ページネーション: `pageSize=1000` + `nextPageToken` で全件取得
- 動画ストリーミング: CORS 制限のため Worker プロキシ経由（Range ヘッダー転送）
  - `acknowledgeAbuse=true&supportsAllDrives=true` を付与
  - レスポンスが `text/html`（Drive 処理中ページ）の場合は 503 を返す

---

## エラーコード

| コード | 定数 | 説明 |
|---|---|---|
| E021 | AUTH_FAILED | Google Drive 連携失敗 |
| E022 | FILES_FETCH | 動画一覧取得失敗 |
| E023 | FOLDERS_FETCH | フォルダ一覧取得失敗 |
| E024 | TOKEN_REFRESH | アクセストークン更新失敗 |
| E025 | UPLOAD_FAILED | アップロード失敗 |
| E026 | TAG_SAVE | タグ保存失敗（予約） |

---

## Google Cloud Console 設定（必須）

1. Google Drive API を有効化
2. OAuth 2.0 クライアント ID（ウェブアプリ）を作成
3. 承認済みの JavaScript 生成元に開発 URL と本番 URL を追加
4. 承認済みのリダイレクト URI に `/app/settings` の完全 URL を追加
5. クライアント ID を `VITE_GOOGLE_CLIENT_ID` と Worker vars に設定
6. クライアントシークレットを Worker secrets (`GOOGLE_OAUTH_CLIENT_SECRET`) に設定
