# Videocollect（動画ビューワー）

## 概要

Google Drive 内の動画ファイルをグリッド表示・再生できる機能。

- パス: `/app/videocollect`（動画一覧）、`/app/videocollect/play`（プレイヤー）
- 要認証: `ProtectedRoute` でラップ
- Google Drive 連携（OAuth 2.0）が必要

---

## Google OAuth 連携フロー

1. ユーザーが `/app/settings` の「外部連携」セクションで「接続する」ボタンをクリック
2. `@react-oauth/google` の `useGoogleLogin({ flow: 'auth-code' })` でポップアップ起動
3. ポップアップから認証コードを取得
4. Cloudflare Worker `workers/drive-proxy/` の `POST /oauth/exchange` に `{ code, uid }` を送信
5. Worker が Google のトークンエンドポイントとコードを交換し `accessToken + refreshToken + tokenExpiry` を取得
6. Worker が Firestore `users/{uid}/videocollect/auth` にトークン情報を保存
7. 以降のアクセスで `accessToken` が期限切れ（5分以内）の場合、Worker の `POST /oauth/refresh` で自動更新

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
  Videocollect.tsx      動画一覧ページ（グリッド・タグフィルター・モーダル管理）
  VideoPlayer.tsx       動画プレイヤーページ
  views/
    VideoGrid.tsx       グリッドレイアウト
    VideoCard.tsx       動画カード（サムネイル・タグ・再生ナビ）
  modals/
    FolderModal.tsx     フォルダ選択（パンくずリスト・チェックボックス）
    TagModal.tsx        タグ編集（チップ UI）
    UploadModal.tsx     動画アップロード（resumable upload・進捗バー）

workers/drive-proxy/
  src/index.ts          Cloudflare Worker（ストリーミングプロキシ・OAuth）
  wrangler.toml
  package.json
```

---

## Cloudflare Worker エンドポイント

| エンドポイント | 用途 |
|---|---|
| `GET /stream/{fileId}?token=` | 動画ストリーミング（Range ヘッダープロキシ） |
| `POST /oauth/exchange` | `{ code, uid }` → トークン交換・Firestore 保存 |
| `POST /oauth/refresh` | `{ uid }` → リフレッシュトークンで accessToken 更新 |

Worker の CORS は `ALLOWED_ORIGIN` 環境変数で指定したオリジンのみ許可。

---

## 環境変数

| 変数 | 説明 | 設定場所 |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth クライアント ID | `.env` / Cloudflare Pages |
| `VITE_DRIVE_PROXY_URL` | drive-proxy Worker の公開 URL | `.env` / Cloudflare Pages |
| `ALLOWED_ORIGIN` | Worker の CORS 許可オリジン | Cloudflare Worker vars |
| `GOOGLE_OAUTH_CLIENT_ID` | Worker 側 OAuth クライアント ID | Cloudflare Worker vars |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth クライアントシークレット | Cloudflare Worker secrets |
| `GOOGLE_SERVICE_ACCOUNT` | Firebase サービスアカウント JSON | Cloudflare Worker secrets |
| `FIREBASE_PROJECT_ID` | Firebase プロジェクト ID | Cloudflare Worker vars |

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
  | { type: 'tag'; file: DriveFile };
```

### 処理フロー

1. `useFirestoreData` で VcData（フォルダ・タグ）を読み込み
2. `getDoc` で VcAuth を読み込み
3. `loadAccessToken()` で有効なアクセストークンを取得（必要に応じて Worker でリフレッシュ）
4. `fetchAllDriveFiles()` でフォルダフィルターを適用して動画一覧を全件取得
5. タグフィルターはクライアントサイドで適用

---

## 動画プレイヤー（VideoPlayer.tsx）

`/app/videocollect/play?id={fileId}&name={fileName}` で起動。

### 機能

- 再生/停止、シークバー、±10秒スキップ
- 音量ミュート、再生速度変更（0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x）
- フルスクリーン（標準 Fullscreen API + iOS Safari フォールバック）
- ダウンロード（Worker プロキシ URL で `<a download>` クリック）
- コントロール 3秒後自動非表示（一時停止中は常時表示）

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

- 画面左側でダブルタップ → -10秒
- 画面右側でダブルタップ → +10秒
- 300ms 以内の同一サイドへの2回タップで判定

### フルスクリーン時の安全領域対応

```css
.vc-player-controls-inner {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  padding-left:   max(16px, env(safe-area-inset-left));
  padding-right:  max(16px, env(safe-area-inset-right));
}
```

---

## Drive API

- ファイル・フォルダ一覧: クライアントから直接 `https://www.googleapis.com/drive/v3/files` を呼び出し（CORS 問題なし）
- ページネーション: `pageSize=1000` + `nextPageToken` で全件取得
- 動画ストリーミング: CORS 制限のため Worker プロキシ経由（Range ヘッダー転送）

---

## エラーコード

| コード | 定数 | 説明 |
|---|---|---|
| E021 | AUTH_FAILED | Google Drive 連携失敗 |
| E022 | FILES_FETCH | 動画一覧取得失敗 |
| E023 | FOLDERS_FETCH | フォルダ一覧取得失敗 |
| E024 | TOKEN_REFRESH | アクセストークン更新失敗 |
| E025 | UPLOAD_FAILED | アップロード失敗 |
| E026 | TAG_SAVE | タグ保存失敗（未使用・予約） |

---

## Google Cloud Console 設定（必須）

1. Google Drive API を有効化
2. OAuth 2.0 クライアント ID（ウェブアプリ）を作成
3. 承認済みの JavaScript 生成元に開発 URL と本番 URL を追加
4. 承認済みのリダイレクト URI に `postmessage` を追加
5. クライアント ID を `VITE_GOOGLE_CLIENT_ID` と Worker vars に設定
6. クライアントシークレットを Worker secrets (`GOOGLE_OAUTH_CLIENT_SECRET`) に設定
