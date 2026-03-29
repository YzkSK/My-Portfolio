# パスワードリセット `/app/reset-password`

## 概要

パスワードリセットメールのリンクから遷移するページ。URLの `oobCode` を検証し、新しいパスワードを設定する。

## コンポーネント構成

```
ResetPassword.tsx
├── [loading] → 「確認中...」テキスト表示
├── [invalid]
│   ├── 「リンクが無効です」タイトル
│   ├── 「このリンクは無効または期限切れです。再度パスワード再設定をリクエストしてください。」
│   └── 「ログインページへ」ボタン → navigate('/app/login')
├── [form]
│   ├── 「パスワード再設定」タイトル
│   ├── 対象メールアドレス表示 (読み取り専用テキスト)
│   ├── errors.form エラー表示
│   ├── 新しいパスワード入力 + 強度バー (入力中のみ)
│   ├── パスワード（確認）入力
│   └── 「パスワードを更新する」ボタン
└── [success]
    ├── 「再設定完了」タイトル
    ├── 「パスワードを更新しました。」
    └── 「ログインする」ボタン → navigate('/app/login')
```

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `state` | `'loading' \| 'form' \| 'success' \| 'invalid'` | `'loading'` | 表示フェーズ |
| `email` | string | `''` | Firebase から取得したメールアドレス |
| `password` | string | `''` | 新パスワード入力値 |
| `confirmPassword` | string | `''` | パスワード確認入力値 |
| `errors` | `Record<string, string>` | `{}` | フィールド別エラー |

## URL パラメータ

```
?oobCode=XXXXXXXX
  └── 未指定の場合: state='invalid' に即座に遷移
```

## 初期化フロー (useEffect)

```
oobCode が空文字 → setState('invalid') で終了

verifyPasswordResetCode(auth, oobCode)
  → 成功: setEmail(verifiedEmail), setState('form')
  → 失敗: setState('invalid')
```

## バリデーション仕様

フォーム送信時に以下を検証:

| チェック | エラーメッセージ |
|---|---|
| PASSWORD_RULES のいずれかのルールを満たさない | 失敗したルールの errorMsg |
| password !== confirmPassword | 「パスワードが一致しません」 |

```
PASSWORD_RULES (passwordRules.ts):
  1. pw.length >= 8          → 「パスワードは8文字以上で入力してください」
  2. /[A-Z]/.test(pw)       → 「大文字を1文字以上含めてください」
  3. /[a-z]/.test(pw)       → 「小文字を1文字以上含めてください」
  4. /[0-9]/.test(pw)       → 「数字を1文字以上含めてください」
```

## パスワード強度バー

`password` が truthy のときのみ表示 (ログインページと同仕様)。

## Firebase 操作

```
confirmPasswordReset(auth, oobCode, password)
  → 成功: setState('success')
  → 失敗: errors.form = 'パスワードの再設定に失敗しました。リンクが無効または期限切れの可能性があります。'
```

## エラー表示の位置

- `errors.form` → パスワード入力フィールドの上に赤文字で表示 (`app-error` クラス)
- `errors.password` → パスワード入力フィールドの下にインライン表示 (`app-field-error` クラス)
- `errors.confirmPassword` → 確認フィールドの下にインライン表示

## 遷移フロー

```
メールリンク → /app/reset-password?oobCode=XXX
  ↓ useEffect
  ├── oobCode なし → [invalid] → 「ログインページへ」→ /app/login
  ├── verifyPasswordResetCode 失敗 → [invalid] → 「ログインページへ」→ /app/login
  └── verifyPasswordResetCode 成功 → [form]
        ↓ フォーム送信
        ├── バリデーション失敗 → errors 表示 (同画面)
        ├── confirmPasswordReset 失敗 → errors.form 表示 (同画面)
        └── confirmPasswordReset 成功 → [success] → 「ログインする」→ /app/login
```
