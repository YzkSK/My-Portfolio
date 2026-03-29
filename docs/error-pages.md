# エラーページ

## 共通コンポーネント (ErrorPage)

全エラーページは内部コンポーネント `ErrorPage` を使用:

```typescript
ErrorPage({ code, title, message, action })
  → <div> フルスクリーン、中央配置
       <p> code (5rem、太字)
       <p> title (lg)
       <p> message (sm、グレー)
       action.href がある場合: <a href={href}> {label}
       action.onClick がある場合: <button onClick={onClick}> {label}
     </div>
```

---

## NotFound (404)

**表示条件:** React Router の `*` ルート（存在しないパスへのアクセス）

```
code:    "404"
title:   "ページが見つかりません"
message: "URLが間違っているか、ページが削除された可能性があります。"
action:  { label: 'トップページへ', href: '/' }
```

**アクション:** `<a href="/">` によるリンク（JavaScript 不要）

---

## Forbidden (403)

**表示条件:** `ProtectedRoute` が未認証ユーザーを検出した場合

```
code:    "403"
title:   "アクセス権限がありません"
message: "このページを表示するにはログインが必要です。"
action:  { label: 'ログインする', href: '/app/login' }
```

**アクション:** `<a href="/app/login">` によるリンク

**ProtectedRoute の仕様:**

```typescript
ProtectedRoute:
  currentUser が null (未認証) → <Forbidden />
  currentUser が存在するが username が null → 黄色バナーを表示しつつ children をレンダリング
  currentUser が存在し username がある → children をレンダリング
  loading=true → null (何も表示しない)
```

---

## ServerError (500)

**表示条件:** `ErrorBoundary` がキャッチした未ハンドルの JavaScript エラー

```
code:    "500"
title:   "予期しないエラーが発生しました"
message: "しばらく時間をおいてから再度お試しください。"
action:  { label: 'ページを再読み込み', onClick: () => window.location.reload() }
```

**アクション:** `window.location.reload()` による再読み込み

---

## ServiceUnavailable (503)

**表示条件:** `ErrorBoundary` が ChunkLoadError を検知した後、自動リカバリーに失敗した場合

```
code:    "503"
title:   "サービスを利用できません"
message: "アプリの読み込みに失敗しました。キャッシュが古くなっているか、一時的な障害の可能性があります。"
action:  { label: 'キャッシュをクリアして再読み込み', onClick: handleReload }
```

**handleReload の処理:**

```typescript
handleReload():
  'caches' in window の場合:
    caches.keys() → 全キャッシュキーを取得
    Promise.all([...keys.map(k => caches.delete(k))])
  'serviceWorker' in navigator の場合:
    navigator.serviceWorker.getRegistration()
    → reg が存在する場合: reg.update()
  window.location.reload()
```

---

## ErrorBoundary の仕様

**クラス:** `ErrorBoundary extends React.Component`

### ChunkLoadError 自動リカバリー

```
componentDidCatch(error):
  error.message に以下を含む場合を ChunkLoadError と判定:
    'Loading chunk'
    'ChunkLoadError'

  自動リカバリー処理:
    navigator.serviceWorker.getRegistrations()
    → 全 SW を sw.unregister()
    caches.keys() → 全キャッシュを caches.delete()
    window.location.reload()
```

### その他のエラー

```
getDerivedStateFromError(error):
  hasError = true
  error をStateに保持

render():
  hasError=true → <ServerError /> を表示
  hasError=false → children をレンダリング
```

---

## テスト

### 結合テスト — `src/__tests__/integration/shared/ErrorBoundary.test.tsx`

| テスト名 | 結果 |
|---|---|
| エラーがなければ子要素をそのまま描画する | ✅ |
| 通常のエラーが発生すると 500 エラーページを表示する | ✅ |
| chunk load エラーが発生するとキャッシュクリア中の UI を表示する | ✅ |

### 結合テスト — `src/__tests__/integration/auth/ProtectedRoute.test.tsx`

| テスト名 | 結果 |
|---|---|
| loading 中は何も描画しない | ✅ |
| 未認証は 403 Forbidden を表示する | ✅ |
| 認証済み・username あり → 子要素を描画する | ✅ |
| 認証済み・username=null → 子要素 + ユーザー名未設定バナーを描画する | ✅ |

---

## ダークモード対応

全エラーページは TailwindCSS のダークモードクラスに対応:

```
背景: bg-[#f8f9fa] dark:bg-[#111]
テキスト: text-[#1a1a1a] dark:text-[#e0e0e0]
ボタン: bg-[#1a1a1a] dark:bg-[#e0e0e0] text-white dark:text-[#111]
```
