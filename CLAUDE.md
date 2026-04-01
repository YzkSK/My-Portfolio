# CLAUDE.md

このファイルはClaude Code がこのリポジトリで作業する際のガイダンスを提供します。

## 重要

- **回答は必ず日本語で行うこと**
- 各ページの詳細仕様は `docs/` に記載されている。実装前に必ず参照すること（`docs/README.md` が索引）
- **フロントエンドは Cloudflare Pages でデプロイしている**（`wrangler` / Cloudflare ダッシュボードで管理）
- **`.env` は開発環境専用の変数**。本番環境の変数は Cloudflare Pages のダッシュボードで別途管理しており、値が異なる。`.env` の値をそのまま本番に使わないこと
- **純粋関数・ユーティリティ関数を追加・変更した場合は必ずテストコードを書くこと**（テストコマンド: ルート `npm test`、Worker `cd workers/notification-cron && npm test`）

## 禁止事項

### エラー処理
- **エラーを握りつぶさないこと**。`catch` ブロックで何もしない・`console.log` だけで終わらせることは原則禁止
- エラーは必ず `console.error` で記録し、ユーザーへのフィードバック（トースト・バナー・エラーページ）を適切に行うこと
- ただし「失敗しても問題ない補助的な処理」（例: FCM トークン取得失敗）は `catch { /* 無視 */ }` とコメントを明記して意図を示すこと

**エラーコードの規約:**

エラーが起きるシーンが予測できる場合は、必ずエラーコードを定義してユーザーに提示すること。

```ts
// 機能単位で定数オブジェクトにまとめる（例: Timetable.tsx）
const NOTIFY_ERROR_CODES = {
  SW_NOT_READY: 'E001',
  TOKEN_FETCH:  'E002',
  TOKEN_SAVE:   'E003',
} as const;

// ユーザーへの表示: 簡潔なメッセージ + [コード]
addToast(`通知の設定に失敗しました [${NOTIFY_ERROR_CODES.TOKEN_FETCH}]`, 'error');
```

- コードは `'E001'` のように `E` + 3桁数字で統一する
- ユーザーへの文言は**最低限のエラー内容**にとどめ、技術的な詳細は含めない
- 詳細は `console.error` に出力する（ユーザーには見せない）
- コード定数は該当機能の先頭（`constants.ts` または コンポーネントファイル上部）にまとめて定義する

### セキュリティ
- **シークレット・API キーをソースコードにハードコードしないこと**。必ず環境変数経由で参照する
- **XSS**（`dangerouslySetInnerHTML` の乱用など）、**SQL/NoSQL インジェクション**、**CSRF** などの脆弱性を作り込まないこと
- Cloud Functions や Cloudflare Worker では入力値を必ずバリデーションすること
- Firebase Security Rules に頼り切らず、Cloud Functions 側でも認証・認可を確認すること
- ユーザーから受け取った文字列を URL や HTML にそのまま埋め込まないこと

## コマンド

### フロントエンド（ルート）
```bash
npm run dev       # Vite 開発サーバー起動
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npm run preview   # 本番ビルドのプレビュー
```

### Firebase Functions (`firebase-functions/`)
```bash
npm run build     # TypeScript コンパイル
npm run serve     # ビルド + Firebase エミュレーター起動
npm run deploy    # Firebase へデプロイ
npm run logs      # ファンクションログ確認
```

### Cloudflare Worker (`workers/notification-cron/`)
Wrangler CLI でデプロイ。

## デプロイ先

| 対象 | サービス | 備考 |
|------|----------|------|
| フロントエンド（`src/`） | **Cloudflare Pages** | Git push で自動デプロイ（またはダッシュボード） |
| Cron Worker | **Cloudflare Workers** | `workers/notification-cron/`、Wrangler CLI でデプロイ |
| Cloud Functions | **Firebase** | `firebase-functions/`、`npm run deploy` でデプロイ |

本番の環境変数は各サービスのダッシュボードで管理する。`.env` は開発専用。

## アーキテクチャ

個人ポートフォリオ＋認証付きプロダクティビティ Web アプリ。

**フロントエンド:** React 19 + TypeScript (strict)、Vite 6 (React + SWC)、TailwindCSS 4 (Vite プラグイン)、Radix UI、React Router DOM v7。パスエイリアス `@` → `./src`。

**バックエンド:**
- Firebase Auth、Firestore、Storage、Cloud Messaging（Firebase v12）
- Firebase Cloud Functions (`firebase-functions/src/index.ts`) — Resend 経由のパスワードリセットメール送信。リージョン: `asia-northeast1`
- Cloudflare Worker (`workers/notification-cron/`) — プッシュ通知用 cron（毎分実行）

**AI:** Google Generative AI (`@google/generative-ai`) — quiz モジュールで PDF を問題形式にパース（`pdfjs-dist` も使用）、および問題の解説文をストリーミング生成（`memoGenerator.ts`）。

**PWA:** `public/firebase-messaging-sw.js` の Service Worker が Firebase Cloud Messaging を処理。Firebase config は URL クエリパラメーターで渡す（compat SDK 使用）。

## ルーティング（`src/main.tsx`）

`createBrowserRouter` + `RouterProvider` を使用（data router。`useBlocker` が使用可能）。

```
/                → ポートフォリオ
/app/*           → AppRoutes
  /app/          → AppIndex（認証状態に応じて dashboard or login へリダイレクト）
  /app/login
  /app/reset-password
  /app/dashboard         ← ProtectedRoute
  /app/timetable         ← ProtectedRoute
  /app/quiz              ← ProtectedRoute
  /app/quiz/play         ← ProtectedRoute
  /app/settings          ← ProtectedRoute
  /app/settings/edit     ← ProtectedRoute
  /app/*（該当なし）     → 404
/*（該当なし）          → 404
```

**AppRoutes の Provider 階層:**
```
AppWrapper（#root の margin-top をリセット）
└── AppLoadingProvider (initialKeys=['auth'])
    └── AuthProvider
        └── ThemeProvider
            └── ErrorBoundary
                └── Suspense (fallback=null)
                    └── Routes
```

lazy loading: Login / ResetPassword / Dashboard / Timetable / Quiz / QuizPlay / Settings / EditProfile（Suspense で囲む。fallback は null にしてレイアウトのズレを防ぐ）

詳細は `docs/routing.md` を参照。

## アプリ構造

```
src/
  portfolio/         公開ポートフォリオ（認証不要）
  app/
    auth/            Login、ResetPassword、AuthContext、ProtectedRoute
    dashboard/       ダッシュボード
    quiz/            問題集管理・プレイ（PDF インポート、画像キャッシュ）
    timetable/       時間割プランナー
    settings/        プロフィール・設定
    shared/          Firebase 設定、ThemeContext、AppLoadingContext、
                     ErrorBoundary、DbErrorBanner、NotFound 系、
                     AppMenu、AppFooter、toast フック、共有 UI、
                     useFirestoreData（読み込み）、useFirestoreSave（デバウンス保存）、
                     validators.ts、LoadingScreen.tsx
  components/ui/     Radix UI ベースの共有 UI コンポーネント
```

## 環境変数

### フロントエンド（`VITE_*`）

| 変数 | 説明 |
|------|------|
| `VITE_FIREBASE_API_KEY` | Firebase API キー |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth ドメイン |
| `VITE_FIREBASE_PROJECT_ID` | Firebase プロジェクト ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage バケット |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM 送信者 ID |
| `VITE_FIREBASE_APP_ID` | Firebase アプリ ID |
| `VITE_FIREBASE_VAPID_KEY` | FCM Web Push VAPID キー |
| `VITE_GOOGLE_GEMINI_API_KEY` | Gemini API キー（quiz: AI 解説文生成） |

- **開発環境**: `.env` に記載（開発用 Firebase プロジェクトを指している）
- **本番環境**: Cloudflare Pages ダッシュボードの「環境変数」で管理（値が異なる）
- `.env` の値を本番に流用しないこと

### Cloudflare Worker (`workers/notification-cron/`)

Cloudflare ダッシュボードのシークレットで管理:
- `GOOGLE_SERVICE_ACCOUNT` — Firebase Service Account JSON
- `FIREBASE_PROJECT_ID` — Firebase プロジェクト ID（本番）

## Firestore パス

```
users/{uid}/profile/data          username, darkMode, avatarUrl
users/{uid}/quiz/data             sets（ProblemSet[]）, recentConfigs
users/{uid}/timetable/data        events, periods, notifyBefore, notifyEnabled
users/{uid}/push/{tokenId}        FCM トークン（collectionGroup でクエリ）
sharedProblems/{code}             共有問題集（code は 8 桁大文字英数字）
```

## 認証・エラーハンドリング

**AuthContext の `username` 型:**
- `undefined` — 未ロード（初期状態）
- `null` — ロード済みだがユーザー名未設定
- `string` — 設定済み

**ProtectedRoute:**
- `loading` 中は `null` を返す
- 未認証 → `<Forbidden />` (403) を表示（ログインページへのリダイレクトなし）
- `username === null` → 設定ページへのリンク付き警告バナーを表示

**エラーページ**（`src/app/shared/NotFound.tsx`）:

| コンポーネント | コード | 用途 |
|---|---|---|
| `NotFound` | 404 | 存在しないルート |
| `Forbidden` | 403 | 未認証でのアクセス |
| `ServerError` | 500 | 予期しないランタイムエラー |
| `ServiceUnavailable` | 503 | chunk load 失敗・サービス障害 |

詳細は `docs/error-pages.md` を参照。

**ErrorBoundary:**
- chunk load エラー検出（regex）→ `caches.delete()` + `serviceWorker.update()` + 自動リロード
- その他エラー → 500 ページ

**DbErrorBanner:**
- Firestore 読み込み失敗時に各ページ上部にスティッキーバナー表示（再読み込みボタン付き）
- `useFirestoreData` フック内の `catch` で `setDbError(true)` を呼ぶ

## テーマシステム（ThemeContext）

- Dark モード（デフォルト）: `html.dark`
- Light モード: `html.app-theme-light`
- 永続化: `localStorage('tt-dark-mode')` + Firestore の `profile/data.darkMode` に同期
- iOS PWA のみ `display: none → offsetHeight → display: ''` ハックで CSS 変数を再評価

**CSS 変数の名前空間**（`src/app/shared/app.css`）:
- `--app-*` — 汎用（bg、border、text、button 色）
- `--tt-*` — Timetable 専用（タブ、ピッカー、イベント色 `--tt-event-0-bg` 〜 `--tt-event-7-bg`）
- `--qz-*` — Quiz 専用（シート、メモ、答えプレビュー色）

## AppLoadingContext

ローディング状態を文字列キーの集合で管理。1 つ以上のキーが存在する間は overlay（`z-index: 9999`、`opacity` トランジション 0.25s）を表示。

```ts
const setLoading = useSetLoading();
setLoading('quiz', true);   // キーを追加
setLoading('quiz', false);  // キーを削除
```

## ナビゲーションガード（QuizPlay.tsx）

問題回答中（`phase === 'answering'` / `'revealed'`）は以下でページ離脱をブロック:
- `useBlocker`（React Router v7 data router 必須）— アプリ内ナビゲーション・ブラウザバック → 確認ダイアログ
- `beforeunload` イベント — リロード・タブ閉じ

## Quiz モジュール

**AnswerFormat:**
- `'flashcard'` — 自己採点
- `'written'` — 記述式（正規化して比較: trim + lowercase + 連続空白を1つに）
- `'choice2'` — 二択（常に `['○', '✗']`）
- `'choice4'` — 四択（正解 + wrongChoices をシャッフル）

**主要定数:**
- `SAVE_DEBOUNCE_MS`: 800ms（Firestore 自動保存）
- `EXAM_TIME_LIMIT_MS`: 50 分
- `EXAM_MAX_PROBLEMS`: 50 問
- `MASTER_THRESHOLD`: 5 回連続正解でマスター扱い
- `MAX_RECENT`: 10（直近の記録の最大保存件数）
- `RECENT_INITIAL_SHOW`: 3（直近の記録の初期表示件数）
- `MEMO_GEN_ERROR_CODES`: `{ NO_API_KEY: 'E011', GENERATE: 'E012' }`

**型パターン:**
- `ActiveSession = OneByOneSession | ExamSession`（discriminated union）
- `Modal` は union 型（`isExamSession()` などの型ガードを使う）
- `Record<string, unknown>` から `parseProblem()` / `parseProblemSet()` などで厳密化

**画像キャッシュ**（`imageCache.ts`）:
- 3 層: メモリキャッシュ（blob URL）→ Cache API（`'quiz-img-v1'`）→ fetch
- `inFlight` Map で同一 URL への並列呼び出しを共有 Promise で処理し blob URL の二重生成を防ぐ
- `failedUrls` Set で失敗した URL を記録（次回呼び出し時に Cache API をスキップして再試行）
- `clearImageCache()` で blob URL を revoke してメモリ解放

**AI 解説生成**（`memoGenerator.ts`）:
- `generateMemoExplanation(question, answer, onChunk)` — Gemini API でストリーミング生成
- エラーコードは `MEMO_GEN_ERROR_CODES`（`constants.ts` に定義）

## Timetable モジュール

**dateKey 形式:** `'YYYY-MM-DD'`

**主要定数:**
- `SAVE_DEBOUNCE_MS`: 800ms
- `COLORS`: 8 色（Slate / Red / Orange / Green / Blue / Purple / Pink / Amber）
- `NOTIFY_OPTIONS`: `[5, 10, 15, 30]`（分前）
- `DEFAULT_PERIODS`: 5 時限（1 限 09:00〜10:30 など）
- 時刻は JST（UTC+9）固定で計算

## プッシュ通知（Cloudflare Worker）

- Trigger: `* * * * *`（毎分）
- Firestore REST API で `push` コレクショングループからトークン取得
- FCM V1 API（webpush + apns）で送信
- 無効トークン（404）は Firestore から自動削除
- 送信条件: `timeToMin(period.start) - notifyBefore === 現在時刻（JST、分単位）`

## Cloud Functions

`sendPasswordResetEmail`（onCall）:
1. `admin.auth().generatePasswordResetLink()` でリセットリンク生成
2. `oobCode` を抽出し `${APP_BASE_URL}/app/reset-password?oobCode=...` を構築
3. Resend で HTML メール送信
4. ユーザーが存在しない場合も `success` を返す（メールアドレス列挙対策）

## 主要な規約

- TypeScript strict モード — `noUnusedLocals`、`noUnusedParameters`、`noUncheckedSideEffectImports`、`noFallthroughCasesInSwitch` すべて有効
- `@` パスエイリアスを `src/` からのインポートに使用
- 各フィーチャーモジュール（quiz、timetable）は `modals/`、`views/`、`constants.ts`、CSS ファイルを持つ
- Firebase 設定は `src/app/shared/firebase.ts`（Cloud Functions リージョン: `asia-northeast1`）
- `useToast` — タイプ: `'normal' | 'error' | 'warning'`、デフォルト持続時間: 3500ms
- `usePageTitle('タイトル')` — `document.title` を設定し、unmount 時に `'My PortFolio'` に戻す
- Firestore 読み込みは `useFirestoreData` フック、書き込みは `useFirestoreSave` フック（800ms デバウンス）を使う
- 新機能追加時は同じ debounce / caching / error handling パターンを踏襲すること
- `autoFocus` は使用しないこと（モバイルでキーボードが自動展開される）
- `input` / `textarea` のフォントサイズは 16px 以上にすること（iOS Safari の自動ズーム防止）
