# プロフィール編集 `/app/settings/edit`

## 概要

ユーザー名・メールアドレス・パスワードの変更。メール/パスワード変更はセキュリティのため2ステップ構成（再認証必須）。

## コンポーネント構成

```
EditProfile.tsx
├── <header class="app-header">
│   ├── <h1> 「ユーザー情報の変更」
│   └── 「戻る」ボタン → navigate('/app/settings')
└── <main class="app-settings-main">
    ├── Section: 「ユーザー名」
    │   ├── エラー表示 (usernameMsg.error)
    │   ├── 成功表示 (usernameMsg.success)
    │   ├── ユーザー名テキスト入力 (初期値: currentUsername ?? '')
    │   └── 「更新」ボタン
    ├── Section: 「メールアドレス」[emailStep='input']
    │   ├── エラー/成功表示 (emailMsg)
    │   ├── 新しいメールアドレス入力 (type="email")
    │   └── 「更新」ボタン
    ├── Section: 「メールアドレス」[emailStep='confirm']
    │   ├── 「本人確認のため現在のパスワードを入力してください」
    │   ├── 現在のパスワード入力 (autoFocus)
    │   ├── 「確認して更新」ボタン
    │   └── 「キャンセル」ボタン
    ├── Section: 「パスワード」[passwordStep='input']
    │   ├── エラー/成功表示 (passwordMsg)
    │   ├── 新しいパスワード入力
    │   ├── 新しいパスワード（確認）入力
    │   └── 「更新」ボタン
    └── Section: 「パスワード」[passwordStep='confirm']
        ├── 「本人確認のため現在のパスワードを入力してください」
        ├── 現在のパスワード入力 (autoFocus)
        ├── 「確認して更新」ボタン
        └── 「キャンセル」ボタン
```

## Section コンポーネント仕様

共通の内部コンポーネント `Section` を使用:

```typescript
Section({ title, onSubmit, success?, error?, children })
  → <section class="app-settings-section">
       <h3> title
       {error && <p class="app-error">error</p>}
       {success && <p class="app-settings-success">success</p>}
       <form onSubmit noValidate> children </form>
     </section>
```

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `username` | string | `currentUsername ?? ''` | ユーザー名入力値 |
| `usernameMsg` | `{error, success}` | `{error:'', success:''}` | ユーザー名セクションの結果メッセージ |
| `newEmail` | string | `''` | 新メール入力値 |
| `emailStep` | `'input' \| 'confirm'` | `'input'` | メール変更ステップ |
| `emailConfirmPassword` | string | `''` | メール変更時の現パスワード確認用 |
| `emailMsg` | `{error, success}` | `{error:'', success:''}` | メールセクションの結果メッセージ |
| `newPassword` | string | `''` | 新パスワード入力値 |
| `confirmPassword` | string | `''` | 新パスワード確認入力値 |
| `passwordStep` | `'input' \| 'confirm'` | `'input'` | パスワード変更ステップ |
| `passwordConfirm` | string | `''` | パスワード変更時の現パスワード確認用 |
| `passwordMsg` | `{error, success}` | `{error:'', success:''}` | パスワードセクションの結果メッセージ |

## 各セクションのバリデーションと処理フロー

### ユーザー名変更

```
handleUsername():
  username.trim() が空 → usernameMsg.error = 'ユーザー名を入力してください'
  → setDoc(users/{uid}/profile/data, { username: trim, id: uid }, { merge: true })
  → 成功: usernameMsg.success = 'ユーザー名を更新しました'
  → 失敗: usernameMsg.error = 'ユーザー名の更新に失敗しました'
```

### メールアドレス変更 (2ステップ)

```
Step1: handleEmailInput()
  newEmail.trim() が空 → emailMsg.error = 'メールアドレスを入力してください'
  EMAIL_REGEX 不一致  → emailMsg.error = 'メールアドレスの形式が正しくありません'
  → setEmailStep('confirm')

Step2: handleEmailConfirm()
  emailConfirmPassword が空 → emailMsg.error = 'パスワードを入力してください'
  → reauthenticateWithCredential(currentUser, credential(currentUser.email, emailConfirmPassword))
  → updateEmail(currentUser, newEmail.trim())
  → 成功:
      newEmail = '', emailConfirmPassword = '', emailStep = 'input'
      emailMsg.success = 'メールアドレスを更新しました'
  → 失敗:
      auth/wrong-password または auth/invalid-credential → 'パスワードが違います'
      auth/email-already-in-use → 'このメールアドレスはすでに使用されています'
      その他 → 'メールアドレスの更新に失敗しました'

「キャンセル」クリック:
  emailStep = 'input', emailConfirmPassword = '', emailMsg = {error:'', success:''}
```

### パスワード変更 (2ステップ)

```
Step1: handlePasswordInput()
  newPassword が空 → passwordMsg.error = '新しいパスワードを入力してください'
  newPassword !== confirmPassword → passwordMsg.error = 'パスワードが一致しません'
  → setPasswordStep('confirm')

Step2: handlePasswordConfirm()
  passwordConfirm が空 → passwordMsg.error = 'パスワードを入力してください'
  → reauthenticateWithCredential(currentUser, credential(currentUser.email, passwordConfirm))
  → updatePassword(currentUser, newPassword)
  → 成功:
      newPassword = '', confirmPassword = '', passwordConfirm = '', passwordStep = 'input'
      passwordMsg.success = 'パスワードを更新しました'
  → 失敗:
      auth/wrong-password または auth/invalid-credential → '現在のパスワードが違います'
      その他 → 'パスワードの更新に失敗しました'

「キャンセル」クリック:
  passwordStep = 'input', passwordConfirm = '', passwordMsg = {error:'', success:''}
```

## 再認証 (reauth) の仕様

```
reauth(password: string):
  currentUser?.email が null/undefined → throw new Error('ユーザー情報が取得できません')
  credential = EmailAuthProvider.credential(currentUser.email, password)
  await reauthenticateWithCredential(currentUser, credential)
```

## Firebase 操作まとめ

| 操作 | Firebase API |
|---|---|
| ユーザー名保存 | `setDoc(users/{uid}/profile/data, { username, id }, { merge: true })` |
| メール変更 | `reauthenticate` → `updateEmail(currentUser, newEmail)` |
| パスワード変更 | `reauthenticate` → `updatePassword(currentUser, newPassword)` |

## 遷移フロー

```
/app/settings/edit
  ├── 各フォーム操作 → 同ページ内でメッセージ表示（ページ遷移なし）
  └── 「戻る」クリック → /app/settings
```
