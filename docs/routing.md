# ルーティング全体図

## ルート一覧

```
/
└── Portfolio (public)

/app
├── /login                     ← 未認証時の入口
├── /reset-password?oobCode=   ← メールリンクから遷移
├── /dashboard                 ← 認証済みの入口 [Protected]
├── /settings                  ← 設定TOP [Protected]
├── /settings/edit             ← プロフィール編集 [Protected]
├── /timetable                 ← 時間割 [Protected]
├── /quiz                      ← 問題集管理 [Protected]
├── /quiz/play                 ← 問題集プレイ [Protected]
└── *                          ← 404 Not Found
```

## 遷移フロー全体

```
[未認証ユーザー]
  → /app → /app/login
  → 認証成功 → /app/dashboard
  → パスワードリセットメール → /app/reset-password

[認証済みユーザー]
  /app/login → /app/dashboard (自動リダイレクト)

  /app/dashboard
    ├── 時間割 → /app/timetable
    ├── 問題集 → /app/quiz
    ├── 設定アイコン → /app/settings
    └── ログアウト → /app/login

  /app/settings
    ├── プロフィール編集 → /app/settings/edit
    └── 戻る → /app/dashboard

  /app/quiz
    └── 出題開始 → /app/quiz/play
        └── 戻る → /app/quiz
```

## グローバルプロバイダー構成

```
ErrorBoundary
└── AppLoadingProvider  ← ローディングオーバーレイ
    └── AuthProvider    ← Firebase Auth + Firestore username
        └── ThemeProvider ← ダークモード
            └── RouterProvider (React Router v7)
```

## Firestore データ構造

```
users/
└── {uid}/
    ├── profile/
    │   └── data
    │       ├── username: string
    │       ├── id: string
    │       └── darkMode: boolean
    ├── quizzes/
    │   └── data
    │       ├── sets: ProblemSet[]
    │       └── recentConfigs: RecentConfig[]
    ├── timetables/
    │   └── data
    │       ├── events: Events
    │       ├── periods: Period[]
    │       └── notifyBefore: number
    └── pushTokens/
        └── {token}
            ├── token: string
            ├── notifyBefore: number
            └── periods: Period[]

sharedProblems/
└── {8文字コード}
    ├── problems: Problem[]
    ├── title: string
    ├── format: AnswerFormat
    └── expiresAt: Timestamp
```
