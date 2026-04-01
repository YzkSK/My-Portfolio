# 設計書

## テスト概要

| 種別 | テストファイル数 | テストケース数 | 結果 |
|---|---|---|---|
| 単体テスト | 7 | 94 | ✅ 全件パス |
| 結合テスト | 17 | 121 | ✅ 全件パス |
| Worker 単体テスト | 1 | 25 | ✅ 全件パス |
| **合計** | **25** | **240** | ✅ |

テストコマンド: ルート `npm test`、Worker `cd workers/notification-cron && npm test`

---

## ページ一覧

| ファイル | パス | 説明 |
|---|---|---|
| [routing.md](routing.md) | - | ルーティング全体図・Firestoreデータ構造 |
| [portfolio.md](portfolio.md) | `/` | 公開ポートフォリオ |
| [login.md](login.md) | `/app/login` | ログイン・新規登録・パスワードリセット送信 |
| [reset-password.md](reset-password.md) | `/app/reset-password` | パスワードリセット (メールリンクから) |
| [dashboard.md](dashboard.md) | `/app/dashboard` | ダッシュボード |
| [settings.md](settings.md) | `/app/settings` | 設定 |
| [settings-edit.md](settings-edit.md) | `/app/settings/edit` | プロフィール編集 |
| [timetable.md](timetable.md) | `/app/timetable` | 時間割 |
| [quiz.md](quiz.md) | `/app/quiz` | 問題集管理 |
| [quiz-play.md](quiz-play.md) | `/app/quiz/play` | 問題集プレイ |
| [error-pages.md](error-pages.md) | - | エラーページ (404/403/500/503) |
| [hooks.md](hooks.md) | - | 共有 Hooks (useFirestoreData / useFirestoreSave) |
