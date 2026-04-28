# 設定 `/app/settings`

## 概要

プロフィール情報の閲覧・アピアランス設定、および導入済みアプリの設定。
PC（768px以上）はサイドバー＋コンテンツの2ペインレイアウト、モバイルはスクロールリスト。

## コンポーネント構成

```
Settings.tsx
├── <header class="app-header">
│   ├── app-header-left
│   │   ├── AppMenu (ハンバーガーメニュー)
│   │   └── <h1>「設定」</h1>
│   └── 「戻る」ボタン (app-logout-btn) → navigate('/app/dashboard')
└── <main class="app-settings-body">
    └── <div class="app-settings-layout">
        ├── <nav class="app-settings-sidebar">  ← PC のみ表示
        │   ├── プロフィール (#settings-profile)
        │   ├── 外観 (#settings-appearance)
        │   └── 導入済みアプリのリンク (#settings-{appId})
        └── <div class="app-settings-content">
            ├── <section id="settings-profile">
            │   ├── ユーザー名 / メールアドレス表示
            │   └── 「ユーザー情報を変更」リンク → /app/settings/edit
            ├── <section id="settings-appearance">
            │   └── ダークモードトグル (app-switch)
            └── <section id="settings-{appId}"> （導入済みアプリ分だけ繰り返し）
                └── <Suspense> → AppMeta.SettingsSection コンポーネント
```

## レイアウト仕様

| 画面幅 | レイアウト |
|---|---|
| < 768px (モバイル) | サイドバー非表示。セクションが縦に並ぶスクロールリスト |
| ≥ 768px (PC) | 左サイドバー (220px) + 右コンテンツの2ペイン。両ペインが独立スクロール。フッター非表示 |

## 状態管理

状態は持たず、Context から読み取るのみ:

| 取得元 | 値 | 説明 |
|---|---|---|
| `useAuth()` | `currentUser.email` | ログイン中のメールアドレス |
| `useAuth()` | `username` | ユーザー名 (`undefined`=読み込み中, `null`=未設定, `string`=設定済み) |
| `useTheme()` | `darkMode` | ダークモード状態 |
| `useTheme()` | `toggleDarkMode` | ダークモード切替関数 |
| `useInstalledApps()` | `isInstalled` | アプリの導入状態 |

## アプリ設定セクション

`APP_REGISTRY` の各アプリが `SettingsSection` コンポーネントを持つ場合、導入済みであれば設定ページに自動表示される。

```typescript
// registry.ts の AppMeta
SettingsSection?: LazyExoticComponent<ComponentType<SettingsSectionProps>>

// SettingsSectionProps
type SettingsSectionProps = {
  addToast: (msg: string, type?: 'normal' | 'error' | 'warning') => void;
};
```

現在の導入済みアプリの設定:
- **時間割 (`TimetableSettings`)**: 通知 ON/OFF、通知タイミング、時限設定
- **動画 (`VideocollectSettings`)**: Google Drive 連携

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
