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

## テスト

### 結合テスト — `src/__tests__/integration/auth/AuthContext.test.tsx`

| テスト名 | 結果 |
|---|---|
| ユーザーなし → loading=false, username=null | ✅ |
| ユーザーあり・プロフィールあり → username が設定される | ✅ |
| ユーザーあり・プロフィールなし → username=null | ✅ |
| Firestore エラー → username=null に fallback する | ✅ |
| onAuthStateChanged の unsubscribe がアンマウント時に呼ばれる | ✅ |

### 結合テスト — `src/__tests__/integration/shared/AppLoadingContext.test.tsx`

| テスト名 | 結果 |
|---|---|
| initialKeys があればオーバーレイが表示状態になる | ✅ |
| initialKeys が空ならオーバーレイは非表示状態になる | ✅ |
| setLoading(key, false) で initialKey を解除するとオーバーレイが非表示になる | ✅ |
| 複数キーがすべて解除されて初めて非表示になる | ✅ |
| setLoading(key, true) で新しいキーを追加するとオーバーレイが再表示される | ✅ |
| 同じキーを複数回 true にしても 1 つとして扱う | ✅ |

### 結合テスト — `src/__tests__/integration/shared/useToast.test.tsx`

| テスト名 | 結果 |
|---|---|
| addToast でトーストが追加される | ✅ |
| type を指定してトーストを追加できる | ✅ |
| duration 経過後にトーストが自動削除される | ✅ |
| duration 未満ではトーストが残る | ✅ |
| 複数トーストは追加した順番で並ぶ | ✅ |
| タイミングがずれた複数トーストが個別に削除される | ✅ |

### 結合テスト — `src/__tests__/integration/shared/usePageTitle.test.tsx`

| テスト名 | 結果 |
|---|---|
| マウント時に document.title が指定タイトルになる | ✅ |
| アンマウント時に document.title が "My PortFolio" に戻る | ✅ |
| title が変わると document.title も更新される | ✅ |

### 単体テスト — `src/__tests__/unit/lib/utils.test.ts`

`cn()` (clsx + tailwind-merge のラッパー):

| テスト名 | 結果 |
|---|---|
| 単純なクラス名を結合する | ✅ |
| falsy な値を除外する | ✅ |
| 条件付きクラスをサポートする | ✅ |
| オブジェクト形式をサポートする | ✅ |
| Tailwind の競合するクラスを後勝ちでマージする | ✅ |
| 競合しないクラスは両方残す | ✅ |
| 引数なしは空文字を返す | ✅ |

---

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
