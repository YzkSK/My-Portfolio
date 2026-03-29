# 設定 `/app/settings`

## 概要

プロフィール情報の閲覧とアピアランス設定。プロフィール編集へのエントリーポイント。

## コンポーネント構成

```
Settings.tsx
├── <header class="app-header">
│   ├── <h1> 「設定」
│   └── 「戻る」ボタン (app-logout-btn) → navigate('/app/dashboard')
└── <main class="app-settings-main">
    ├── <section> プロフィール
    │   ├── 「ユーザー名」ラベル + username 表示 (null の場合「未設定」)
    │   ├── 「メールアドレス」ラベル + currentUser.email 表示
    │   └── 「ユーザー情報を変更」リンク (app-settings-edit-link) → /app/settings/edit
    │         └── › 矢印 (app-settings-edit-arrow)
    └── <section> 外観
        └── 「ダークモード」ラベル + トグルスイッチ (app-switch)
```

## 状態管理

状態は持たず、Context から読み取るのみ:

| 取得元 | 値 | 説明 |
|---|---|---|
| `useAuth()` | `currentUser.email` | ログイン中のメールアドレス |
| `useAuth()` | `username` | ユーザー名 (`undefined`=読み込み中, `null`=未設定, `string`=設定済み) |
| `useTheme()` | `darkMode` | ダークモード状態 |
| `useTheme()` | `toggleDarkMode` | ダークモード切替関数 |

## ページタイトル

`document.title = '設定'`

## ダークモードトグル仕様

```
toggleDarkMode() (ThemeContext.tsx):
  darkMode を反転
  → localStorage.setItem('darkMode', new value)
  → currentUser が存在する場合:
      setDoc(users/{uid}/profile/data, { darkMode: new value }, { merge: true })
  → document.documentElement の class を更新
      darkMode=true  → 'dark' クラスを追加、'app-theme-light' を除去
      darkMode=false → 'app-theme-light' クラスを追加、'dark' を除去
```

## username の表示仕様

| username の値 | 表示 |
|---|---|
| `undefined` (読み込み中) | `undefined` がそのまま表示される可能性あり |
| `null` | 「未設定」 |
| `string` | そのままの文字列 |

## テスト

### 結合テスト — `src/__tests__/integration/shared/ThemeContext.test.tsx`

| テスト名 | 結果 |
|---|---|
| localStorage に値なし → darkMode=false、app-theme-light クラスが付く | ✅ |
| localStorage が "true" → darkMode=true、dark クラスが付く | ✅ |
| toggleDarkMode → darkMode が反転し localStorage・HTML クラスに反映される | ✅ |
| toggleDarkMode を 2 回 → 元の状態に戻る | ✅ |
| ユーザーログイン時に Firestore からテーマを読み込む | ✅ |
| Firestore に darkMode が未設定 → localStorage の値を維持する | ✅ |
| ユーザーあり・toggleDarkMode → setDoc が呼ばれる | ✅ |
| ユーザーなし・toggleDarkMode → setDoc は呼ばれない | ✅ |

---

## 遷移フロー

```
/app/settings
  ├── 「ユーザー情報を変更」クリック → /app/settings/edit
  └── 「戻る」クリック → /app/dashboard
```
