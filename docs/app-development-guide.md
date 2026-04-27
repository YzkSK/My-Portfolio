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
