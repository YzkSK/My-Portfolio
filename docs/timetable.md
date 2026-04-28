# 時間割 `/app/timetable`

## 概要

学校の時間割管理アプリ。月・週・日の3ビューで授業イベントを管理する。プッシュ通知機能付き。
通知設定・時限設定は `/app/settings` の時間割セクション (`TimetableSettings`) で行う。

## コンポーネント構成

```
Timetable.tsx
├── DbErrorBanner (dbError=true の場合のみ)
├── <header class="app-header">
│   ├── app-header-left
│   │   ├── AppMenu (ハンバーガーメニュー)
│   │   └── <h1>「時間割」</h1>
│   └── 「ログアウト」ボタン (headerActions)
├── 次の通知予定バナー (notifyEnabled && nextNotify の場合のみ)
│   ├── 「🔔 次の予定: {label}「{name}」{start}〜 → {notifyAt}に通知」
│   └── 「⚠️ プッシュ未登録」(pushReady=false の場合のみ)
├── ビュー切替タブ (月 / 週 / 日)
├── ナビゲーション (← タイトル → 今日)
├── [MonthView] / [WeekView] / [DayView]
└── EventModal (isEventModal(modal) の場合)
```

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `view` | `'month' \| 'week' \| 'day'` | `'week'` | 現在のビュー |
| `cursor` | Date | `today` (時刻は 00:00:00.000) | 表示基準日 |
| `events` | `Events` | `{}` | 全イベント (`useFirestoreData` が管理) |
| `periods` | `Period[]` | `DEFAULT_PERIODS` | 時限定義 (`useFirestoreData` が管理) |
| `notifyBefore` | number | `10` | 通知タイミング (分)（`useFirestoreData` が管理） |
| `modal` | `Modal` | `null` | 開いているモーダル（EventModal のみ） |
| `form` | `Form` | `{name:'', room:'', note:'', colorIdx:0}` | イベント編集フォーム値 |
| `formError` | string | `''` | EventModal のエラー |
| `isEditing` | boolean | `false` | 編集 vs 新規追加 |
| `notifyEnabled` | boolean (読み取り専用) | localStorage + 権限状態 | 通知ON/OFF。setter なし（マウント時の値を保持） |
| `permission` | NotificationPermission (読み取り専用) | `Notification.permission` | ブラウザ通知権限。setter なし |
| `nextNotify` | object \| null | `null` | 次に通知する授業の情報 |
| `loading` | boolean | `true` | Firestore 読み込み中フラグ (`useFirestoreData` が管理) |
| `dbError` | boolean | `false` | Firestore エラーフラグ (`useFirestoreData` が管理) |

> **注意:** `notifyEnabled` / `permission` は setter を持たない読み取り専用 state。
> 通知の ON/OFF 切り替えは設定ページ（`TimetableSettings`）で行い、ページ遷移時に再マウントで最新値が反映される。

## 通知設定の所在

通知に関する設定 UI はすべて `/app/settings` の時間割セクションに移動済み。

| 機能 | 所在 |
|---|---|
| 通知 ON/OFF トグル | `TimetableSettings.tsx`（設定ページ） |
| 通知タイミング選択 | `TimetableSettings.tsx`（設定ページ） |
| 時限設定（追加・編集・削除） | `TimetableSettings.tsx`（設定ページ） |
| 次の通知予定バナー | `Timetable.tsx`（時間割ページ・表示のみ） |
| フォアグラウンド通知受信 | `Timetable.tsx`（onMessage ハンドラ） |
| ローカル通知スケジューリング | `Timetable.tsx`（useEffect） |

## データ構造

```typescript
Period = {
  label: string   // 例: "1限"
  start: string   // "HH:MM" 形式
  end: string     // "HH:MM" 形式
}

TimetableEvent = {
  periodIndex: number   // periods 配列のインデックス
  eventId: number       // Date.now() + Math.random() で生成
  name: string
  room: string
  note: string
  colorIdx: number      // 0-7 (COLORS 配列のインデックス)
}

Events = Record<"YYYY-MM-DD", TimetableEvent[]>
```

## デフォルト時限

```
DEFAULT_PERIODS:
  1限: 09:00 〜 10:30
  2限: 10:45 〜 12:15
  3限: 13:00 〜 14:30
  4限: 14:45 〜 16:15
  5限: 16:30 〜 18:00
```

## カラー定義 (COLORS)

| インデックス | 背景色 | テキスト |
|---|---|---|
| 0 | #64748b (グレー) | #fff |
| 1 | #ef4444 (赤) | #fff |
| 2 | #f97316 (オレンジ) | #fff |
| 3 | #22c55e (緑) | #fff |
| 4 | #3b82f6 (青) | #fff |
| 5 | #8b5cf6 (紫) | #fff |
| 6 | #ec4899 (ピンク) | #fff |
| 7 | #f59e0b (黄) | #fff |

## Firestore 操作

```
パス: users/{uid}/timetable/data

Read (useFirestoreData フック, マウント時1回):
  getDoc(ref)
  → data.events が存在: 旧フォーマット (pi/_idx) → 新フォーマット (periodIndex/eventId) に移行
  → data.periods?.length > 0: parsedPeriods = data.periods (なければ DEFAULT_PERIODS)
  → data.notifyBefore: parsedNotifyBefore
  → エラー: console.error + setDbError(true)
  → 完了: setLoading(false), setGlobalLoading('timetable', false)

Write (useFirestoreSave フック, デバウンス 800ms):
  setDoc(ref, { events, periods, notifyBefore }, { merge: true })
```

## Push Token の Firestore パス

```
users/{uid}/push/{token}
  フィールド: { token, notifyBefore }
  管理: TimetableSettings で行う
```

## ナビゲーションタイトルの生成

```
月ビュー: "{year}年 {month}月"
週ビュー: "{startMonth}/{startDate} 〜 {endMonth}/{endDate}"
日ビュー: "{month}月{date}日（{曜日}）"
```

## moveCursor(dir) の挙動

```
dir = +1 (次へ) / -1 (前へ)
月ビュー: cursor.setMonth(+- dir)
週ビュー: cursor.setDate(+- dir * 7)
日ビュー: cursor.setDate(+- dir)
```

## イベント操作

### openAdd(dateKey, periodIndex)

```
isEditing = false
form = { name:'', room:'', note:'', colorIdx:0 }
formError = ''
modal = { type:'event', dateKey, periodIndex }
```

### openEdit(dateKey, periodIndex, eventId)

```
対象イベントを events[dateKey] から検索
  → 見つからない場合: 何もしない
isEditing = true
form = { name: ev.name, room: ev.room, note: ev.note, colorIdx: ev.colorIdx ?? 0 }
formError = ''
modal = { type:'event', dateKey, periodIndex, eventId }
```

### saveEvent()

```
form.name.trim() が空 → formError = '科目名を入力してください'
isEditing の場合: 同一 periodIndex & eventId を除去してから追加
新規の場合: 同一 periodIndex のイベントを除去してから追加
  (1つの時限に同時に存在できるイベントは1件のみ)
eventId = Date.now() + Math.random() で新規生成
events[dateKey] を periodIndex 昇順でソート
saveToFirestore() 呼び出し
modal = null
```

### deleteEvent()

```
events[dateKey] から対象イベントを除去
saveToFirestore() 呼び出し
modal = null
```

## 通知機能の詳細仕様（Timetable 側）

### notifyEnabled 初期値の決定

```
localStorage.getItem('notifyEnabled') === 'true'
  かつ Notification.permission === 'granted'
→ true (両方満たす場合のみ)
※ setter なし。値の変更は設定ページで行い、ページ再マウント時に反映される。
```

### ローカル通知スケジューリング (useEffect)

```
notifyEnabled && permission === 'granted' の場合:
  今日の全イベントをループ
  各イベントの (開始時刻 - notifyBefore) と現在時刻の差分を計算
  差分 > 0 の場合: setTimeout で addToast('🔔 {label}「{name}」まであと{N}分') をセット
  scheduledRef に保存 (cleanup 時に全クリア)
```

### フォアグラウンド FCM メッセージ受信 (useEffect)

```
onMessage(messaging, payload):
  title = payload.data?.title ?? payload.notification?.title ?? '時間割'
  body  = payload.data?.body  ?? payload.notification?.body  ?? ''
  permission === 'granted':
    serviceWorker.ready.showNotification(title, { body })
```

### 次の通知予定 (nextNotify) の計算

```
毎分実行 (setInterval 60_000ms) + 依存値変化時:
  今日のイベントを開始時刻順にソート
  各イベントについて: notifyAtMin = timeToMin(p.start) - notifyBefore
  nowMin < notifyAtMin の最初のイベントを選択
  pushReady を確認:
    serviceWorker.pushManager.getSubscription() !== null
    かつ Firestore にトークンが存在する
  → nextNotify にセット (見つからない場合 null)
```

## TimetableSettings（設定ページ）の仕様

`src/app/timetable/TimetableSettings.tsx` — `SettingsSectionProps` を実装。

### 状態管理

| state | 説明 |
|---|---|
| `notifyEnabled` | 通知ON/OFF。localStorage + Notification.permission から初期化 |
| `permission` | ブラウザ通知権限 |
| `notifyToggling` | トグル処理中フラグ（多重クリック防止） |
| `editingPeriods` | 時限編集中の一時データ（null = 非編集状態） |
| `periodsError` | 時限編集バリデーションエラー |

### toggleNotify() フロー

```
[OFF → ON]
  notifyToggling = true
  permission !== 'granted' の場合:
    Notification.requestPermission() 呼び出し
    → denied: addToast('通知が許可されていません', 'warning'), return
    → granted: 続行
  navigator.serviceWorker.ready 取得
    → 失敗: addToast('通知の設定に失敗しました [E001]', 'error'), return
  getToken(messaging, { vapidKey, serviceWorkerRegistration })
    → 失敗: addToast('通知の設定に失敗しました [E002]', 'error'), return
  savePushToken(token, notifyBefore) (Firestore に保存)
    → 失敗: addToast('通知の設定に失敗しました [E003]', 'error'), return
  notifyEnabled = true
  localStorage.setItem('notifyEnabled', 'true')
  addToast('通知をオンにしました')

[ON → OFF]
  notifyEnabled = false
  localStorage.setItem('notifyEnabled', 'false')
  deleteToken(messaging)
    → 失敗: addToast('クリーンアップに失敗しました [E004]', 'warning') (続行)
  removePushToken() (Firestore から削除)
    → 失敗: addToast('クリーンアップに失敗しました [E005]', 'warning') (続行)
  addToast('通知をオフにしました')

エラーコード:
  E001: SW_NOT_READY          (ServiceWorker 準備失敗)
  E002: TOKEN_FETCH           (FCM トークン取得失敗)
  E003: TOKEN_SAVE            (Firestore トークン保存失敗)
  E004: TOKEN_DELETE          (FCM トークン削除失敗)
  E005: TOKEN_DB_DELETE       (Firestore トークン削除失敗)
  E006: NOTIFY_BEFORE_UPDATE  (通知タイミング同期失敗)
```

### handleNotifyBefore(value)

```
setData({ ...data, notifyBefore: value })
save({ notifyBefore: value, periods: data.periods }) → Firestore 保存
notifyEnabled && currentUser && token 存在:
  setDoc(users/{uid}/push/{token}, { notifyBefore: value }, { merge: true })
  → 失敗: addToast('通知タイミングの同期に失敗しました [E006]', 'warning')
```

### 時限設定バリデーション (savePeriods)

```
editingPeriods.length === 0 → 「時限を1つ以上追加してください」
label.trim() が空 → 「時限名を入力してください」
start または end が空 → 「開始・終了時刻を入力してください」
start >= end → 「開始時刻は終了時刻より前にしてください」
2つの時限で a.start < b.end && a.end > b.start → 「「A」と「B」の時間が重複しています」

成功時: setData, save({ notifyBefore, periods: editingPeriods }), addToast('時限設定を保存しました')
```

## ビュー仕様

### MonthView

- 7列 × N行の月カレンダー
- 各日付セルに最大3件のイベントバッジを表示、超過分は「+N」
- 今日: 青背景 + テキスト
- クリック: `onDayClick(date)` → view='day', cursor=date

### WeekView

- ヘッダー行: 7日分の日付 (日〜土)
  - 今日: 青ハイライト
  - 日: 赤、土: 青テキスト
- 時限行 × periods.length
- イベントあり: カラー背景 + テキスト (truncated)
- イベントなし: 「+」アイコン
- 日付ヘッダークリック: view='day', cursor=date
- セルクリック: onAdd または onEdit

### DayView

- 最大幅 480px
- 時限行 × periods.length
- 各行: 時限ラベル / 開始〜終了時刻 / イベント名・教室
- 今日: 薄青背景
- クリック: onAdd または onEdit

## グローバルローディング

```
useFirestoreData フック内部の useLayoutEffect が管理:
  マウント時: setGlobalLoading('timetable', true)
  アンマウント時: setGlobalLoading('timetable', false)
  Firestore 読み込み完了後 (finally): setGlobalLoading('timetable', false)
```

## テスト

### 単体テスト — `src/__tests__/unit/timetable/constants.test.ts`

| テスト名 | 結果 |
|---|---|
| toKey — YYYY-MM-DD 形式に変換する | ✅ |
| toKey — 月と日を2桁にゼロパディングする | ✅ |
| addDays — 指定した日数を加算する | ✅ |
| addDays — 負の値で日数を減算する | ✅ |
| addDays — 元の Date オブジェクトを変更しない（immutable） | ✅ |
| addDays — 月をまたいで正しく計算する | ✅ |
| startOfWeek — 日曜始まりで週の最初の日（日曜）を返す | ✅ |
| startOfWeek — 日曜日を渡すとその日を返す | ✅ |
| startOfWeek — 元の Date オブジェクトを変更しない（immutable） | ✅ |
| timeToMin — HH:MM を分に変換する | ✅ |
| isEventModal — type が 'event' なら true | ✅ |
| isEventModal — type が 'settings' なら false | ✅ |
| isEventModal — null なら false | ✅ |

### 単体テスト — `workers/notification-cron/__tests__/index.test.ts`（Cron Worker）

| テスト名 | 結果 |
|---|---|
| base64url — 空の ArrayBuffer は空文字を返す | ✅ |
| base64url — +, /, = を URL-safe な文字に置換する | ✅ |
| base64url — 既知のバイト列を正しくエンコードする | ✅ |
| encodeObj — JSON を base64url エンコードする | ✅ |
| encodeObj — 空オブジェクトもエンコードできる | ✅ |
| pemToArrayBuffer — PEM ヘッダー・フッター・空白を取り除いて ArrayBuffer を返す | ✅ |
| fsValue — stringValue を文字列として返す | ✅ |
| fsValue — integerValue を数値として返す | ✅ |
| fsValue — doubleValue を数値として返す | ✅ |
| fsValue — booleanValue を真偽値として返す | ✅ |
| fsValue — mapValue をオブジェクトに変換する | ✅ |
| fsValue — mapValue.fields がない場合は空オブジェクトを返す | ✅ |
| fsValue — arrayValue を配列に変換する | ✅ |
| fsValue — arrayValue.values がない場合は空配列を返す | ✅ |
| fsValue — mapValue をネストして変換する | ✅ |
| fsValue — 未知のフィールドは null を返す | ✅ |
| parseDoc — Firestore ドキュメントのフィールドを JS オブジェクトに変換する | ✅ |
| parseDoc — fields がない場合は空オブジェクトを返す | ✅ |
| timeToMin — HH:MM を分に変換する | ✅ |
| todayKey — UTC 15:00 は JST 翌 00:00 → 翌日の dateKey を返す | ✅ |
| todayKey — UTC 00:00 は JST 09:00 → 同日の dateKey を返す | ✅ |
| todayKey — 月と日を2桁でゼロパディングする | ✅ |
| nowMinJst — UTC 00:00 は JST 09:00 → 540 分を返す | ✅ |
| nowMinJst — UTC 00:30 は JST 09:30 → 570 分を返す | ✅ |
| nowMinJst — UTC 15:00 は JST 翌 00:00 → 0 分を返す | ✅ |
| nowMinJst — UTC 23:59 は JST 翌 08:59 → 539 分を返す | ✅ |

---

## 遷移フロー

```
/app/timetable
  ├── AppMenu
  │   ├── 🏠 ホーム → /app/dashboard
  │   ├── 📅 時間割 → /app/timetable
  │   ├── 📚 問題集 → /app/quiz
  │   └── ⚙️ 設定 → /app/settings
  ├── 「ログアウト」→ signOut() → /app/login
  └── ビュー内操作はすべてモーダル開閉のみ (ページ遷移なし)
```
