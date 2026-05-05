# アプリ開発ガイド

このドキュメントでは、アプリプラットフォームに新しいアプリを追加する手順と、最低テスト基準を定義します。

## アーキテクチャ概要

```
src/app/
  platform/          プラットフォーム基盤（registry, AppLayout, InstalledAppsContext, errors）
  shell/             シェルページ（AppMenu, AppFooter, Dashboard, AppIndex）
  shared/            共有ユーティリティ（hooks, firebase, CSS, ErrorBoundary）
  marketplace/       アプリ一覧ページ
  auth/              認証（AuthContext, ProtectedRoute, Login, ResetPassword）
  quiz/              フィーチャーアプリ（例）
  timetable/         フィーチャーアプリ（例）
  videocollect/      フィーチャーアプリ（例）
  settings/          シェルアプリ（設定）
```

## Shell vs App の違い

| 種別 | 説明 | 削除可否 |
|------|------|---------|
| **Shell** | dashboard / settings / marketplace など、プラットフォームの基盤 | 不可 |
| **App** | timetable / quiz / videocollect などのフィーチャーアプリ | Marketplace から可 |

## 新しいアプリを追加する手順

### Step 1: ディレクトリとファイルの作成

```
src/app/<id>/
  <Id>.tsx            メインコンポーネント
  constants.ts        型定義・定数・Firestore パス・parse 関数
  <id>.css            アプリ固有のスタイル
  views/              サブビューコンポーネント
  modals/             モーダルコンポーネント
```

### Step 2: constants.ts の実装

```typescript
// 型定義
export type MyData = { ... };
export const MY_INITIAL_DATA: MyData = { ... };

// Firestore パス
export const firestorePaths = {
  myData: (uid: string) => `users/${uid}/myapp/data`,
} as const;

// parse 関数（Firestore の raw データを型に変換）
export function parseMyData(raw: Record<string, unknown>): MyData { ... }

// エラーコード
export const MY_ERROR_CODES = {
  SAVE_FAILED: 'E0XX',
} as const;
```

**CSS 変数の命名規則:** `--{2-4文字のID}-{役割}` (例: `--nt-bg`, `--nt-text`)

### Step 3: メインコンポーネントを AppLayout で実装

```tsx
import { AppLayout } from '../platform/AppLayout';
import { useToast } from '../shared/useToast';
import { useFirestoreData } from '../shared/useFirestoreData';
import { useFirestoreSave } from '../shared/useFirestoreSave';

export const MyApp = () => {
  const { currentUser } = useAuth();
  const { toasts, addToast } = useToast();
  const { data, setData, loading, dbError } = useFirestoreData({
    currentUser,
    path: currentUser ? firestorePaths.myData(currentUser.uid) : '',
    parse: parseMyData,
    loadingKey: 'myapp',
    initialData: MY_INITIAL_DATA,
  });
  const saveToFirestore = useFirestoreSave({ currentUser, path: ... });

  if (loading) return null;

  return (
    <AppLayout title="アプリ名" dbError={dbError} toasts={toasts}>
      {/* コンテンツ */}
    </AppLayout>
  );
};
```

### Step 4: registry.ts に登録

`src/app/platform/registry.ts` の `APP_REGISTRY` に1エントリ追加:

```typescript
{
  id: 'myapp',
  label: 'アプリ名',
  icon: '📱',
  description: 'アプリの説明（Marketplace に表示される）',
  route: {
    path: 'myapp',
    getComponent: () => import('../myapp/MyApp').then(m => ({ default: m.MyApp })),
    protected: true,
  },
  migrateCheckPath: uid => `users/${uid}/myapp/data`,
  onUninstall: async ({ deleteData, uid }) => {
    if (deleteData) {
      await deleteDoc(doc(db, `users/${uid}/myapp/data`));
    }
  },
},
```

これだけで以下が自動反映されます:
- AppMenu にナビゲーションリンクが追加される
- Dashboard のカードグリッドに表示される
- Marketplace でインストール/アンインストール可能になる
- `/app/myapp` のルートが有効になる
- 既存ユーザーは `migrateCheckPath` のドキュメントがあれば自動導入済みとなる

### Step 5 (任意): 設定セクションを追加する

アプリ固有の設定（通知・時限など）を設定ページに表示したい場合は `SettingsSection` を実装する。

```tsx
// src/app/myapp/MyAppSettings.tsx
import type { SettingsSectionProps } from '../platform/registry';

export const MyAppSettings = ({ addToast }: SettingsSectionProps) => {
  // Firestore データの読み書きは useFirestoreData / useFirestoreSave を使う
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 設定 UI */}
    </div>
  );
};
```

```typescript
// registry.ts の AppMeta に追加
{
  id: 'myapp',
  // ...
  SettingsSection: lazy(() =>
    import('../myapp/MyAppSettings').then(m => ({ default: m.MyAppSettings }))
  ),
}
```

### UI デザイン・コンポーネント規約

新しいアプリはプラットフォーム全体で一貫した見た目になるように、以下のコンポーネント規約に従ってください。特に `Transcribe` のようなユーザー向け機能は、既存の `Quiz` / `Videocollect` / `Timetable` と同じ言語で実装する必要があります。

- **レイアウト**: ルートは必ず `AppLayout` を使用する。ページ内は「カードを積む」構造にして情報密度を合わせる。
  - 見出しと説明はカードの上部に置く。
  - 操作ボタンはカード右上またはカード下部に整列。

- **共通 UI コンポーネント**: 可能な限り既存の共有コンポーネントを使う。
  - `Button`（`variant='default' | 'outline' | 'destructive'`）
  - `Input`, `Label`, `Textarea`（プロジェクト内の UI ライブラリを使用）
  - `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`（Radix ベースのモーダル）
  - `AppMenu`, `AppHeader`, `AppFooter` を必要に応じて活用

- **カード・スペーシング**:
  - カードは `padding: 16px` 前後、角丸 `8px` を目安にする。
  - セクション間は `gap: 12-20px` を保つ。
  - テキストは左揃え、補助説明は `font-size: 13px`、`color: var(--app-text-secondary)` を使う。

- **フォームとテキスト**:
  - `input` / `textarea` のフォントサイズは 16px 以上（iOS 自動ズーム回避）。
  - `autoFocus` は使わない。
  - 重要な説明は `Label` と補助テキストで明示する。

- **ダイアログ / 確認フロー**:
  - 単純な確認は `Dialog` を使う（`window.confirm` を直接使わない）。
  - 危険操作は明示的なラベル（例: 削除は `destructive` / 赤系ボタン）

- **トースト・ロード**:
  - ユーザーへのフィードバックは `useToast` を使って簡潔に表示する。
  - 長時間処理は `useSetLoading('appId', true)` を使ってオーバーレイを出す。

- **エクスポート / シェア**:
  - エクスポートは選択ダイアログを使う（TXT / JSON / 将来 PDF）。
  - JSON はメタデータを持つフォーマットにしてバージョンを振る（例: `exportVersion`）。

- **スタイル変数命名**:
  - アプリ固有変数は `--{2-4文字ID}-{role}`（例: `--tr-bg`, `--tr-text`）に従う。

例: `Transcribe` のページ骨格

```tsx
return (
  <AppLayout title="文字起こし" dbError={dbError} toasts={toasts}>
    <div className="transcribe-root">
      <section className="card">
        <h2>動画をアップロード</h2>
        {/* ファイル入力・言語選択・開始ボタン（Button を使用） */}
      </section>

      <section className="card">
        <h3>過去の文字起こし</h3>
        {/* 一覧をカードで表示。クリックで詳細へ */}
      </section>
    </div>
  </AppLayout>
);
```

これらの規約は、Visual 一貫性とアクセシビリティ、モバイル UX（特に iOS）に重点を置いています。


- `SettingsSection` は `lazy()` でラップして遅延読み込みにすること（設定ページの初回ロードを軽くするため）
- `addToast` はトースト表示専用の prop。データ保存は `useFirestoreData` / `useFirestoreSave` を内部で呼ぶ
- 設定ページには `id="settings-{appId}"` のアンカーで自動スクロール対応のサイドバーリンクが追加される

---

## アプリ導入最低テスト基準（規約）

新しいアプリを registry.ts に登録する前に、以下のテストをすべて作成してパスさせること。

| # | テスト種別 | ファイル | 内容 |
|---|-----------|---------|------|
| 1 | Unit | `src/__tests__/unit/<id>/constants.test.ts` | parse 関数が不完全なデータに対してデフォルト値を返す |
| 2 | Unit | 同上 | Firestore パス関数が正しいパスを生成する |
| 3 | Integration | `src/__tests__/integration/<id>/<Id>.test.tsx` | ローディング中は null または LoadingScreen を返す |
| 4 | Integration | 同上 | `dbError=true` 時に DbErrorBanner が表示される |
| 5 | Integration | 同上 | 未認証時に Forbidden コンポーネントを表示する |
| 6 | Integration | 同上 | 主要 CRUD 操作が Firestore mock を呼ぶ |
| 7 | Integration | 同上 | 未導入状態（isInstalled=false）で AppNotInstalled が表示される |

### テストの書き方（最低テストの例）

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyApp } from '@/app/myapp/MyApp';

afterEach(() => cleanup());

vi.mock('@/app/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: null, username: null, loading: true }),
}));

vi.mock('@/app/platform/InstalledAppsContext', () => ({
  useInstalledApps: () => ({ isInstalled: () => true }),
}));

// ... Firebase mocks ...

it('loading 中は null を返す', () => {
  const { container } = render(<MemoryRouter><MyApp /></MemoryRouter>);
  expect(container.firstChild).toBeNull();
});
```

---

## 共通ユーティリティ

### フック

| Hook | 用途 |
|------|------|
| `useFirestoreData` | Firestore ドキュメントの読み込み |
| `useFirestoreSave` | デバウンス付きの Firestore 保存（800ms） |
| `useToast` | トースト通知 |
| `usePageTitle` | ページタイトル設定 |

### エラーハンドリング

```typescript
import { getErrorCode, errorMsg } from '../platform/errors';

const MY_ERROR_CODES = { SAVE_FAILED: 'E0XX' } as const;

try {
  // ...
} catch (e) {
  console.error('[MyApp] save failed', e, getErrorCode(e));
  addToast(errorMsg('保存に失敗しました', MY_ERROR_CODES.SAVE_FAILED), 'error');
}
```

### InstalledAppsContext

```typescript
import { useInstalledApps } from '../platform/InstalledAppsContext';

const { isInstalled, dashboardApps, menuSections } = useInstalledApps();
```
