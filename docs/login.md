# ログイン `/app/login`

## 概要

ログイン・新規登録・パスワードリセット送信を1ページで提供。モード切替でUIを変化させる。

## コンポーネント構成

```
Login.tsx
├── [ログインモード]
│   ├── メールアドレス入力
│   ├── パスワード入力
│   ├── ログインボタン「ログイン」
│   ├── 「新規登録」モード切替リンク
│   └── 「パスワードをお忘れの方」リンク
├── [新規登録モード]
│   ├── ユーザー名入力
│   ├── メールアドレス入力
│   ├── パスワード入力 + 強度バー (入力中のみ表示)
│   ├── パスワード（確認）入力
│   ├── 登録ボタン「登録する」
│   └── 「ログイン」モード切替リンク
└── [パスワードリセットモード]
    ├── メールアドレス入力
    ├── 送信ボタン「再設定メールを送信」
    ├── 送信完了メッセージ (resetSent=true 時)
    └── 「ログインに戻る」リンク
```

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `email` | string | `''` | メール入力値 |
| `password` | string | `''` | パスワード入力値 |
| `confirmPassword` | string | `''` | パスワード確認（登録時のみ使用） |
| `username` | string | `''` | ユーザー名（登録時のみ使用） |
| `isSignUp` | boolean | `false` | 登録モードフラグ |
| `isReset` | boolean | `false` | リセットモードフラグ |
| `resetSent` | boolean | `false` | リセットメール送信済みフラグ |
| `errors` | `Record<string, string>` | `{}` | フィールド別エラーメッセージ |

## パスワード強度バー

パスワード入力中（`isSignUp && password` が truthy）のときのみ表示。

```
PASSWORD_RULES (passwordRules.ts):
  1. pw.length >= 8          → 「パスワードは8文字以上で入力してください」
  2. /[A-Z]/.test(pw)       → 「大文字を1文字以上含めてください」
  3. /[a-z]/.test(pw)       → 「小文字を1文字以上含めてください」
  4. /[0-9]/.test(pw)       → 「数字を1文字以上含めてください」

getStrength(pw) → score = 満たしたルール数
  score 0-1 → { label: '弱い',      color: '#ef4444' (赤) }
  score 2   → { label: '普通',      color: '#f59e0b' (黄) }
  score 3   → { label: '強い',      color: '#22c55e' (緑) }
  score 4   → { label: 'とても強い', color: '#3b82f6' (青) }

バー: 4セグメント。score 以下のセグメントを strength.color で塗る
ラベル: strength.label を strength.color で表示
```

## バリデーション仕様

`validate()` が実行される条件: フォーム送信時

| フィールド | チェック | エラーメッセージ |
|---|---|---|
| email | 未入力 | 「メールアドレスを入力してください」 |
| email | EMAIL_REGEX 不一致 | 「メールアドレスの形式が正しくありません」 |
| password | 未入力 | 「パスワードを入力してください」 |
| password | 登録時: PASSWORD_RULES の失敗したルール | 各ルールの errorMsg |
| username | 登録時: 未入力 | 「ユーザー名を入力してください」 |
| confirmPassword | 登録時: 未入力 | 「確認用パスワードを入力してください」 |
| confirmPassword | 登録時: password と不一致 | 「パスワードが一致しません」 |

バリデーションエラーが1件でもある場合は Firebase 呼び出しを行わない。

## Firebase 操作

```
[ログイン]
  signInWithEmailAndPassword(auth, email, password)
  → 成功: navigate('/app/dashboard')
  → 失敗: errors.form にエラーメッセージをセット

[新規登録]
  createUserWithEmailAndPassword(auth, email, password)
  → 成功: setDoc(users/{uid}/profile/data, { username: trim, id: uid }, { merge: true })
  → Firestore 書き込み後: navigate('/app/dashboard')
  → 失敗: errors.form にエラーメッセージをセット

[パスワードリセット]
  httpsCallable(functions, 'sendPasswordResetEmail')({ email: trim })
  → 成功: setResetSent(true) → 成功メッセージ表示
  → 失敗: errors.form = 'メールの送信に失敗しました。メールアドレスを確認してください'
```

## Firebase エラーマッピング

| Firebase エラーコード | 表示メッセージ |
|---|---|
| `auth/user-not-found` | メールアドレスまたはパスワードが違います |
| `auth/wrong-password` | メールアドレスまたはパスワードが違います |
| `auth/invalid-credential` | メールアドレスまたはパスワードが違います |
| `auth/email-already-in-use` | このメールアドレスはすでに使用されています |
| `auth/too-many-requests` | ログイン試行が多すぎます。しばらく待ってから再試行してください |
| `auth/network-request-failed` | ネットワークエラーが発生しました |
| その他 | err.message をそのまま表示 |

## モード切替の挙動

```
switchMode() が呼ばれたとき:
  isSignUp を反転
  isReset = false
  resetSent = false
  errors = {}
  confirmPassword = ''
  username = ''
  ※ email, password は保持される

「パスワードをお忘れの方」クリック:
  isReset = true
  errors = {}

「ログインに戻る」（リセットモードから）クリック:
  isReset = false
  errors = {}
```

## 遷移フロー

```
/app/login (ログインモード)
  ├── ログイン成功 → /app/dashboard
  ├── 「新規登録」クリック → 登録モードに切替
  └── 「パスワードをお忘れの方」クリック → リセットモードに切替

/app/login (新規登録モード)
  ├── 登録成功 → /app/dashboard
  └── 「ログイン」クリック → ログインモードに切替

/app/login (パスワードリセットモード)
  ├── 送信成功 → resetSent=true → 「ログインに戻る」ボタン表示
  │     └── 「ログインに戻る」クリック → isReset=false, resetSent=false, email=''
  ├── 送信失敗 → errors.form 表示
  └── 「ログインに戻る」クリック → isReset=false

既にログイン済みの場合:
  /app → /app/dashboard (AppIndex.tsx によるリダイレクト)
```
