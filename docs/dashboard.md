# ダッシュボード `/app/dashboard`

## 概要

認証済みユーザーのホーム画面。各機能へのナビゲーションカードを表示する。

## コンポーネント構成

```
Dashboard.tsx
├── <header class="app-header">
│   ├── <h1> 「ホーム」
│   └── <div class="app-user-info">
│       ├── 設定アイコンボタン (lucide-react: User, size=18) → Link to="/app/settings"
│       └── 「ログアウト」ボタン (Button variant="outline")
└── <main class="app-main">
    └── <div class="app-grid">
        ├── Card: 時間割 → Link to="/app/timetable"
        │     ├── label: 「時間割」
        │     └── description: 「授業・時間割の管理」
        └── Card: 問題集 → Link to="/app/quiz"
              ├── label: 「問題集」
              └── description: 「問題登録・ランダム出題」
```

## 状態管理

なし。Context から以下を利用:
- `useAuth()` — `currentUser` (ログアウト用)
- `usePageTitle('ホーム')` — タブタイトルを「ホーム」に設定

## ページタイトル

`document.title = 'ホーム'`

## Firebase 操作

```
handleLogout():
  await signOut(auth)
  navigate('/app/login')
```

## AppMenu

表示なし（ダッシュボードにはハンバーガーメニューなし）。

## AppFooter

ページ下部に `<AppFooter />` を表示。

## ProtectedRoute の挙動

| 状態 | 表示 |
|---|---|
| 未認証 | Forbidden (403) ページ |
| 認証済み・username=null | 黄色バナー「設定から名前を設定してください」 |
| 認証済み・username あり | 通常表示 |

## 遷移フロー

```
/app/dashboard
  ├── 時間割カード クリック → /app/timetable
  ├── 問題集カード クリック → /app/quiz
  ├── 設定アイコン クリック → /app/settings
  └── 「ログアウト」クリック
        → signOut(auth)
        → navigate('/app/login')
```
