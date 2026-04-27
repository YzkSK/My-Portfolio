# アプリプラットフォーム化 実装プラン

> このプランは実装中に適宜更新すること

## Context

個人ポートフォリオ + プロダクティビティアプリを「アプリプラットフォーム」として再設計する。

**4つの柱:**
1. **マーケットプレイス** — 利用可能なアプリ一覧から、使いたいものだけ「導入」できる
2. **統一レイアウト** — `AppLayout` で全アプリのヘッダー・ボディ・フッターを統一
3. **パフォーマンス** — bundle splitting の最適化、重い依存の遅延ロード
4. **ファイル構造の整理** — platform / shell / shared / apps を明確に分離

**パッケージ方式の決定:**
- 全アプリはこのリポジトリにバンドル済みのモジュール（外部 CDN ロードなし）
- ユーザーが ON/OFF したアプリは AppMenu・Dashboard から消え、ルートアクセスも「未導入」ページで弾く
- 導入済み状態は Firestore `/users/{uid}/profile/data.installedApps: string[]` で管理

**インストール初期値の方針（重要）:**
- **新規ユーザー**: 全アプリが未導入状態でスタート → Marketplace で好きなものを導入
- **既存ユーザー（マイグレーション）**: `installedApps` フィールドが Firestore に存在しない場合、各アプリの既存データドキュメントの有無を確認し、データがあれば自動的に導入済みとしてマイグレーション
- `installedByDefault` フィールドは registry から削除（不要）

**ルートの方針:**
- `createBrowserRouter` は静的なため、全アプリのルートは常に登録する
- 未導入のアプリにアクセスした場合は `AppNotInstalled` コンポーネントを表示（「マーケットプレイスで導入する」リンク付き）

---

## 新しいファイル構造

```
src/app/
  platform/          ← NEW: プラットフォーム基盤（registry, layout, installed apps 管理）
    registry.ts              AppMeta, ShellMeta, APP_REGISTRY, SHELL_REGISTRY
    AppLayout.tsx
    AppHeader.tsx
    AppNotInstalled.tsx
    InstalledAppsContext.tsx
    errors.ts
  shell/             ← NEW (shared/ から移動): 常に存在するシェルページ
    AppMenu.tsx              ← shared/ から移動
    AppFooter.tsx            ← shared/ から移動
    AppIndex.tsx             ← shared/ から移動
    Dashboard.tsx            ← dashboard/ から移動
  shared/            ← EXISTING: 純粋なユーティリティ（変更なし）
    firebase.ts
    useFirestoreData.ts
    useFirestoreSave.ts
    useToast.ts
    usePageTitle.ts
    validators.ts
    app.css
    ErrorBoundary.tsx
    DbErrorBanner.tsx
    NotFound.tsx
    AppLoadingContext.tsx
    ThemeContext.tsx
  auth/              ← UNCHANGED
  quiz/              ← UNCHANGED
  timetable/         ← UNCHANGED
  videocollect/      ← UNCHANGED
  settings/          ← UNCHANGED
  marketplace/       ← NEW
    Marketplace.tsx
```

---

## フェーズ進捗

- [x] Phase 0: 既存テスト全通過確認（230件 + 26件）
- [x] Phase 1: platform/ + shell/ 構造 + ルート自動生成
- [x] Phase 2: AppLayout + AppHeader 共通コンポーネント
- [x] Phase 3: マーケットプレイスページ
- [x] Phase 4: 共有エラーユーティリティ + テストヘルパー
- [x] Phase 5: 全アプリ AppLayout 移行
- [x] Phase 6: バンドル最適化
- [x] Phase 7: テスト追加 + docs 更新（テスト 230件→251件）
- [ ] Phase 8: CSS 変数分離（後回し・任意）

---

## Phase 0: 事前確認 [x]

```bash
npm test                                    # 230件全通過
cd workers/notification-cron && npm test   # 26件全通過
```

---

## Phase 1: registry.ts + ルート自動生成 [ ]

### 設計思想: Shell と App の分離

- **Shell**: Dashboard・Settings・Marketplace はプラットフォームの基盤。常に存在し、インストール/アンインストール概念なし
- **App**: Timetable・Quiz・Videocollect。Marketplace で導入/削除できる

### 新規作成: `src/app/platform/registry.ts`

```typescript
export type RouteConfig = {
  path: string;
  getComponent: () => Promise<{ default: React.ComponentType }>;
  protected: boolean;
};

export type ShellMeta = {
  id: string;
  label: string;
  icon: string;
  route: RouteConfig;
  extraRoutes?: RouteConfig[];
  menuPosition: 'top' | 'bottom';
};

export type AppMeta = {
  id: string;
  label: string;
  icon: string;
  description: string;
  route: RouteConfig;
  extraRoutes?: RouteConfig[];
  migrateCheckPath: (uid: string) => string;
  onUninstall?: (opts: { deleteData: boolean; uid: string }) => Promise<void>;
};
```

### AppMenu の新デザイン

```
[ ホーム           🏠 ]  ← Shell (top)
────────────────────────
[ 時間割           📅 ]  ← インストール済みアプリ
[ 問題集           📚 ]
────────────────────────
[ アプリ一覧       🛍️ ]  ← Shell (bottom)
[ 設定            ⚙️ ]
```

### マイグレーションロジック

`installedApps` フィールドが Firestore に存在しない場合:
- 各アプリの `migrateCheckPath` でドキュメントの有無を確認
- 存在するアプリを自動的に導入済みとしてマイグレーション
- 新規ユーザー（全ドキュメント不存在）は `[]` でスタート

### Provider 階層（変更後）

```
AppLoadingProvider
└── AuthProvider
    └── InstalledAppsProvider   ← 新規追加
        └── ThemeProvider
            └── ErrorBoundary
                └── Suspense → Routes（registry から自動生成）
```

---

## Phase 2: AppLayout + AppHeader 作成 [ ]

### `src/app/platform/AppLayout.tsx`

```typescript
type AppLayoutProps = {
  title?: string;
  headerLeft?: ReactNode;      // 省略時: AppMenu
  headerActions?: ReactNode;
  header?: ReactNode;          // フルカスタムヘッダー
  children: ReactNode;
  className?: string;          // <main> の追加クラス
  pageClassName?: string;      // ルート <div> の追加クラス
  dbError?: boolean;
  toasts?: ToastItem[];
};
```

---

## Phase 3: マーケットプレイスページ作成 [ ]

### アンインストール確認ダイアログ

```
「{アプリ名}」をアンインストールしますか？

○ データを残す（デフォルト）
○ データも削除する（Firestore 上のデータも完全削除、取り消し不可）

[キャンセル]  [アンインストール]
```

### onUninstall の実装

- **quiz**: `deleteData=true` → `users/{uid}/quiz/data` 削除 + `clearImageCache()` 呼び出し
- **timetable**: `deleteData=true` → `users/{uid}/timetable/data` 削除
- **videocollect**: `deleteData=true` → `users/{uid}/videocollect/data` + `users/{uid}/videocollect/auth` 削除

---

## Phase 4: 共有エラーユーティリティ + テストヘルパー [ ]

### `src/app/platform/errors.ts`

```typescript
export function getErrorCode(e: unknown): string { ... }
export type ErrorCodeMap = Record<string, string>;
export function errorMsg(message: string, code: string): string { ... }
```

---

## Phase 5: 全アプリ AppLayout 移行 [ ]

移行順序: Dashboard → Marketplace → Settings → EditProfile → Timetable → Quiz → QuizPlay → Videocollect → VideoPlayer

---

## Phase 6: バンドル最適化 [ ]

| 対象 | 改善策 |
|------|--------|
| `pdfjs-dist` | GeminiPdfModal 内で dynamic import に変更 |
| `@google/generative-ai` | memoGenerator.ts 内で dynamic import に変更 |

---

## Phase 7: テスト追加 + docs 更新 [ ]

### アプリ導入最低テスト基準（規約）

| # | テスト種別 | 内容 |
|---|-----------|------|
| 1 | Unit | parse 関数が不完全なデータに対してデフォルト値を返す |
| 2 | Unit | Firestore パス関数が正しいパスを生成する |
| 3 | Integration | ローディング中は null または LoadingScreen を返す |
| 4 | Integration | `dbError=true` 時に DbErrorBanner が表示される |
| 5 | Integration | 未認証時に Forbidden コンポーネントを表示する |
| 6 | Integration | 主要 CRUD 操作が Firestore mock を呼ぶ |
| 7 | Integration | 未導入状態で AppNotInstalled が表示される |

---

## Phase 8: CSS 変数分離（後回し・任意） [ ]

- `app.css` から `--tt-*` を `timetable.css` に移動
- `app.css` から `--qz-*` を `quiz.css` に移動

---

## Firestore スキーマ変更

```
users/{uid}/profile/data
  + installedApps: string[]   // 例: ['timetable', 'quiz', 'videocollect']
  // Shell (dashboard/settings/marketplace) はリストに含めない（常に有効）
  // フィールド未存在 → マイグレーション実行
```

## 変更対象ファイル一覧

| フェーズ | 操作 | ファイル |
|---------|------|---------|
| 1 | 新規 | `src/app/platform/registry.ts` |
| 1 | 新規 | `src/app/platform/InstalledAppsContext.tsx` |
| 1 | 新規 | `src/app/platform/AppNotInstalled.tsx` |
| 1 | 新規 | `src/app/platform/errors.ts` |
| 1 | 移動 | `src/app/shared/AppMenu.tsx` → `src/app/shell/AppMenu.tsx` |
| 1 | 移動 | `src/app/shared/AppFooter.tsx` → `src/app/shell/AppFooter.tsx` |
| 1 | 移動 | `src/app/shared/AppIndex.tsx` → `src/app/shell/AppIndex.tsx` |
| 1 | 移動 | `src/app/dashboard/Dashboard.tsx` → `src/app/shell/Dashboard.tsx` |
| 1 | 変更 | `src/main.tsx` |
| 1 | 変更 | `src/app/auth/ProtectedRoute.tsx` |
| 2 | 新規 | `src/app/platform/AppLayout.tsx` |
| 2 | 新規 | `src/app/platform/AppHeader.tsx` |
| 2 | 変更 | `src/app/shared/app.css` |
| 3 | 新規 | `src/app/marketplace/Marketplace.tsx` |
| 4 | 変更 | `src/app/quiz/constants.ts` |
| 4 | 新規 | `src/__tests__/utils/renderWithProviders.tsx` |
| 5 | 変更 | `src/app/shell/Dashboard.tsx` |
| 5 | 変更 | `src/app/settings/Settings.tsx` |
| 5 | 変更 | `src/app/settings/EditProfile.tsx` |
| 5 | 変更 | `src/app/timetable/Timetable.tsx` |
| 5 | 変更 | `src/app/quiz/Quiz.tsx` |
| 5 | 変更 | `src/app/quiz/QuizPlay.tsx` |
| 5 | 変更 | `src/app/videocollect/Videocollect.tsx` |
| 5 | 変更 | `src/app/videocollect/VideoPlayer.tsx` |
| 6 | 変更 | `vite.config.ts` |
| 6 | 変更 | `src/app/quiz/modals/GeminiPdfModal.tsx` |
| 6 | 変更 | `src/app/quiz/memoGenerator.ts` |
| 7 | 新規 | `docs/app-development-guide.md` |
| 7 | 新規 | `src/__tests__/unit/platform/registry.test.ts` |
| 7 | 新規 | `src/__tests__/integration/platform/AppLayout.test.tsx` |
| 7 | 新規 | `src/__tests__/unit/platform/errors.test.ts` |
| 7 | 新規 | `src/__tests__/integration/marketplace/Marketplace.test.tsx` |
| 7 | 変更 | `docs/README.md` |
