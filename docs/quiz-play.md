# 問題集プレイ `/app/quiz/play`

## 概要

クイズセッションを実行するページ。問題集・カテゴリ・出題形式を選択してセッションを開始する。一問一答モードと試験モードの2種類。

## コンポーネント構成

```
QuizPlay.tsx
├── DbErrorBanner (dbError=true の場合のみ)
├── Toast コンテナ
└── <div class="max-w-[640px] mx-auto">
    ├── [問題集選択画面] ← session=null && configConfirmed=false
    │   ├── ヘッダー: AppMenu + 「出題する」タイトル + 「← 問題集一覧」
    │   ├── 「直近の記録」セクション (recentConfigs.length > 0 の場合)
    │   │   ├── 最大 RECENT_INITIAL_SHOW(3)件 表示
    │   │   └── 「さらに表示 (N件)▼」/ 「折りたたむ▲」
    │   └── 問題集チェックリスト
    │       ├── 各セット: チェックボックス + 名前 + 問題数
    │       │   └── 問題なし / ⚠ 選択肢不足 の場合は disabled
    │       └── 「次へ →」ボタン (selectedSetIds.length === 0 で disabled)
    │
    ├── [設定画面] ← session=null && configConfirmed=true
    │   ├── ヘッダー: 選択した問題集名 ('+' 結合) + 「← 戻る」
    │   ├── 「問題フィルター」セレクト
    │   │   ├── すべて ({N}件)
    │   │   ├── ★ ブックマーク
    │   │   ├── ⚡ 苦手問題 ({N}件) (weakCount > 0 の場合のみ)
    │   │   └── カテゴリ名一覧 ({N}件)
    │   ├── 「モード」ボタン群
    │   │   ├── 一問一答
    │   │   └── 試験 (「最大50問・50分」サブテキスト)
    │   └── 対象件数表示 + 「出題開始」(targetCount === 0 で disabled)
    │
    └── [セッション中] ← session !== null
        ├── ヘッダー: AppMenu + 「一問一答」or「試験」タイトル
        └── QuizSession コンポーネント

離脱確認ダイアログ (blocker.state === 'blocked' の場合)
```

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `sets` | `ProblemSet[]` | `[]` | 全問題集 (`useFirestoreData` が管理、`recentConfigs` と合成) |
| `recentConfigs` | `RecentConfig[]` | `[]` | 最近の設定・最大 MAX_RECENT(10) 件 (`useFirestoreData` が管理) |
| `showAllRecent` | boolean | `false` | 直近の記録を全件表示するか |
| `selectedSetIds` | `string[]` | `[URL params ?set]` or `[]` | 選択中の問題集ID |
| `configConfirmed` | boolean | `false` | 設定画面に進んだか |
| `session` | `ActiveSession \| null` | `null` | 現在のセッション |
| `categoryFilter` | string | `''` | カテゴリフィルター値 |
| `quizMode` | `QuizMode` | `'oneByOne'` | 出題モード |
| `loading` | boolean | `true` | 読み込み中 (`useFirestoreData` が管理) |
| `dbError` | boolean | `false` | Firestore エラー (`useFirestoreData` が管理) |

## URL パラメータ

```
?set={setId}
  → 指定した場合: selectedSetIds = [setId] で初期化
```

## 問題集選択の仕様

```
toggleSetSelection(id):
  selectedSetIds に含む場合 → 除去
  含まない場合 → 追加

disabled 条件 (チェックボックスが無効):
  s.problems.length === 0 (問題なし)
  または getInvalidCount(s.problems) > 0 (選択肢不足)
```

## 直近の記録 (recentConfigs) の仕様

```
RecentConfig = {
  id: string           // crypto.randomUUID()
  setIds: string[]
  setNames: string[]   // 削除済みセットの名前も保持
  mode: QuizMode
  categoryFilter: string
  usedAt: number       // Date.now()
}

表示:
  setNames を ' + ' で結合
  QUIZ_MODE_LABELS[mode] + (categoryFilter ? ' · {filter}' : '')
  一部削除済み: ' · 一部削除済み' を amber で表示
  usedAt を formatRelativeTime() で相対表示 (「N分前」「N時間前」「N日前」等)

applyRecentConfig(config):
  config.setIds の中で現在の sets に存在するもののみ有効化
  有効なものが 0件 → addToast('選択された問題集が見つかりません')
  setSelectedSetIds(validIds), setQuizMode(mode), setCategoryFilter(filter)
  setConfigConfirmed(true)
```

## filterProblems の仕様

```
categoryFilter:
  '' (空文字)    → 全問題
  'BOOKMARKED'   → bookmarked=true の問題のみ
  'WEAK'         → attemptCount > 0 かつ consecutiveCorrect === 0 の問題のみ
  その他          → category === categoryFilter の問題のみ
```

## isWeak の判定

```
(attemptCount === 1 && consecutiveWrong === 1)  // 初回不正解
または
(consecutiveWrong >= 2)                          // 2回以上連続不正解
```

## startSession(config) の処理

```
1. filterProblems(problems, config.categoryFilter) でフィルタリング
2. isInvalidProblem(p) の問題を除外
3. filtered.length === 0 → addToast('対象の問題がありません'), return

4. RecentConfig を生成し recentConfigs に追加:
   - 同じ setIds + mode + categoryFilter の組み合わせが存在する場合は重複除去
   - 最大 MAX_RECENT(10) 件に制限
   - saveToFirestore({ sets, recentConfigs: updatedRecents })

5. mode === 'oneByOne':
   session = {
     mode: 'oneByOne', config,
     queue: shuffle(filtered),
     currentIndex: 0, results: [], answers: [],
     phase: 'answering', writtenInput: '', pendingResult: null
   }

6. mode === 'exam':
   queue = shuffle(filtered).slice(0, EXAM_MAX_PROBLEMS(50))
   choiceOptionsMap: choice2/choice4 の問題ごとに選択肢をシャッフルして固定
   session = {
     mode: 'exam', config,
     queue, currentIndex: 0,
     answers: new Array(queue.length).fill(''),
     phase: 'answering', choiceOptionsMap,
     startedAt: Date.now(),
     timeLimit: EXAM_TIME_LIMIT_MS (50分 = 3,000,000ms),
     elapsedMs: null
   }
```

## セッション型

```typescript
OneByOneSession = {
  mode: 'oneByOne'
  config: QuizSessionConfig
  queue: Problem[]
  currentIndex: number
  results: boolean[]       // 各問の正誤 (flashcard は自己判定)
  answers: string[]        // 各問のユーザー回答 (flashcard は '')
  phase: 'answering' | 'revealed' | 'finished'
  writtenInput: string
  pendingResult: boolean | null  // written 正誤の一時保持
}

ExamSession = {
  mode: 'exam'
  config: QuizSessionConfig
  queue: Problem[]
  currentIndex: number
  answers: string[]
  phase: 'answering' | 'reviewing'
  choiceOptionsMap: Record<number, string[]>  // インデックス → 選択肢配列
  startedAt: number
  timeLimit: number   // 3,000,000ms (50分)
  elapsedMs: number | null
}
```

## 一問一答ハンドラー

### flashcard (フラッシュカード)

```
handleFlashcardReveal():
  phase: 'answering' → 'revealed'

handleFlashcardJudge(correct: boolean):
  advanceOneByOne(correct, '')
  ※ 正誤はユーザーが自己判定 (○/✗ ボタン)
```

### written (記述式)

```
handleWrittenInputChange(value):
  session.writtenInput = value

handleWrittenSubmit():
  correct = isAnswerCorrect(writtenInput, currentProblem.answer)
  phase: 'answering' → 'revealed'
  pendingResult = correct

handleWrittenNext(correct, answer):
  advanceOneByOne(correct, answer)
```

### choice2 / choice4 (選択式)

```
一問一答モードでの選択:
  handleChoiceNext(correct, choice):
    advanceOneByOne(correct, choice)
    ※ 選択即判定・次へ遷移
```

### advanceOneByOne(correct, answer)

```
recordResult([{ id: currentProblem.id, correct }])
results に correct を追加
answers に answer を追加
currentIndex + 1 が queue.length 以上:
  → phase: 'finished'
それ以外:
  → currentIndex++, phase: 'answering', writtenInput='', pendingResult=null
```

## 試験ハンドラー

### 回答入力

```
handleExamWrittenInputChange(value):
  answers[currentIndex] = value

handleChoiceSelect(option):  (exam モードでの選択)
  answers[currentIndex] = option
  ※ 試験モードでは選択しても即判定しない (後で提出)
```

### ナビゲーション

```
handleExamNext():
  currentIndex + 1 < queue.length → currentIndex++
  currentIndex + 1 === queue.length → moveToReviewing()

handleExamPrev():
  currentIndex = Math.max(0, currentIndex - 1)

handleJumpTo(index):
  currentIndex = index  (回答進捗から直接ジャンプ)
```

### 提出・時間切れ

```
handleSubmitExam():
  → moveToReviewing()

handleTimeUp():
  addToast('時間終了！')
  → moveToReviewing()

moveToReviewing(session):
  elapsedMs = Date.now() - session.startedAt
  recordResult(全問題の正誤)
  phase: 'answering' → 'reviewing'
```

## recordResult の仕様

```
recordResult(entries: { id: string; correct: boolean }[]):
  setsRef.current (最新の sets) を更新
  各問題について:
    consecutiveCorrect = correct ? prev+1 : 0
    consecutiveWrong   = correct ? 0 : prev+1
    correctCount += correct ? 1 : 0
    attemptCount += 1

  マスター通知:
    consecutiveCorrect が MASTER_THRESHOLD(5) に達した
    かつ attemptCount > consecutiveCorrect (= 過去に不正解あり)
    → addToast('「{問題文(15文字以内)}」をマスターしました！')

  saveToFirestore(next) (デバウンス 800ms)
```

## 正誤判定 (isAnswerCorrect)

```
normalize(s):
  s.trim().toLowerCase().replace(/\s+/g, ' ')
normalize(input) === normalize(answer)
  ※ 全角/半角は非統一 (trim・toLowerCase・空白正規化のみ)
```

## ナビゲーションブロッカー

```
isSessionInProgress:
  session !== null
  かつ phase !== 'finished'
  かつ phase !== 'reviewing'

useBlocker(isSessionInProgress):
  blocker.state === 'blocked' の場合ダイアログを表示

beforeunload イベント:
  isSessionInProgress の場合 e.preventDefault() でブラウザ警告を表示

ダイアログのボタン:
  「続ける」→ blocker.reset?.() (離脱キャンセル)
  「離れる」→ blocker.proceed?.() (離脱実行)
  ダイアログを閉じる → blocker.reset?.()
```

## QuizSession の画面仕様

### 一問一答 - answering フェーズ

```
プログレスバー: min(currentIndex / queue.length, 1) (上限 1 にキャップ)
問題遷移時: フェードインアニメーション (CSS animation)
回答進捗: 全問のチェックリスト (回答済み/未回答)
カテゴリバッジ + ブックマークトグル
問題文 + 画像 (imageUrl がある場合)

回答エリア:
  flashcard:
    「答えを見る」ボタン → handleFlashcardReveal
  written:
    テキスト入力 + 「回答する」ボタン → handleWrittenSubmit
  choice2:
    ○ / ✗ ボタン → handleChoiceNext (即判定)
  choice4:
    選択肢ボタン (4件) → handleChoiceNext (即判定)
```

### 一問一答 - revealed フェーズ

```
正解表示
ユーザー回答表示 + 正誤マーク (written/choice のみ)
メモ編集エリア (onUpdateMemo) + 「✨」ボタン → generateMemo(id)
  生成中: textarea readOnly、保存ボタン disabled
  エラー時: addToast(`... [E011]` など, 'error')

flashcard:
  「○ 正解」→ handleFlashcardJudge(true)
  「✗ 不正解」→ handleFlashcardJudge(false)
written/choice:
  「次へ」→ handleWrittenNext(pendingResult, input)
```

### 一問一答 - finished フェーズ

```
スコア: {正解数}/{総問数}
フィルターボタン: すべて / 正解のみ / 不正解のみ / ブックマーク
結果リスト (各問):
  問題文, 正解, ユーザー回答, 正誤マーク, メモ編集 + 「✨」ボタン
「戻る」→ endSession() → session=null
```

### 試験 - answering フェーズ

```
プログレスバー + タイマー (残り時間表示)
問題番号ナビゲーション (← / →)
問題文 + 回答エリア (written or choice)
回答進捗 (クリックで handleJumpTo)
「提出する」ボタン
  → 未回答あり: 警告ダイアログ (「N問未回答です。提出しますか？」)
  → 全回答済み or 強制提出: handleSubmitExam
```

### 試験 - reviewing フェーズ

```
スコア + 解答時間
フィルターボタン
結果リスト (各問: 問題文, 正解, ユーザー回答, 正誤, メモ編集 + 「✨」ボタン)
「戻る」→ endSession()
```

## 定数

| 定数 | 値 | 説明 |
|---|---|---|
| `EXAM_TIME_LIMIT_MS` | 3,000,000 (50分) | 試験の制限時間 |
| `EXAM_MAX_PROBLEMS` | 50 | 試験モードの最大問題数 |
| `MASTER_THRESHOLD` | 5 | マスター判定の連続正解数 |
| `MAX_RECENT` | 10 | 直近の記録の最大保存件数 |
| `RECENT_INITIAL_SHOW` | 3 | 直近の記録の初期表示件数 |
| `SAVE_DEBOUNCE_MS` | 800 | Firestore 保存のデバウンス |

## テスト

### 単体テスト — `src/__tests__/unit/quiz/constants.test.ts`（セッション系）

| テスト名 | 結果 |
|---|---|
| isAnswerCorrect — 完全一致 | ✅ |
| isAnswerCorrect — 大文字・小文字を区別しない | ✅ |
| isAnswerCorrect — 前後の空白を無視する | ✅ |
| isAnswerCorrect — 連続する空白を1つに正規化する | ✅ |
| isAnswerCorrect — 内容が異なれば false | ✅ |
| filterProblems — '' → 全件返す | ✅ |
| filterProblems — 'BOOKMARKED' → ブックマークのみ | ✅ |
| filterProblems — 'WEAK' → 苦手問題のみ（attemptCount > 0 かつ consecutiveCorrect === 0） | ✅ |
| filterProblems — カテゴリ名 → 該当カテゴリのみ | ✅ |
| isWeak — 初回不正解（attemptCount=1, consecutiveWrong=1）は苦手 | ✅ |
| isWeak — 2回連続不正解以上は苦手 | ✅ |
| isWeak — 正解済みは苦手でない | ✅ |
| isExamSession — exam モードは true | ✅ |
| isExamSession — oneByOne モードは false | ✅ |
| formatTime — ミリ秒をMM:SS形式に変換する | ✅ |
| formatTime — 負値は 00:00 になる | ✅ |
| formatTime — 1秒未満の端数は切り上げる | ✅ |
| formatElapsed — ミリ秒を「X分Y秒」形式に変換する | ✅ |
| formatRelativeTime — 1分未満 → たった今 | ✅ |
| formatRelativeTime — 1〜59分前 | ✅ |
| formatRelativeTime — 1〜23時間前 | ✅ |
| formatRelativeTime — 1〜29日前 | ✅ |
| formatRelativeTime — 30日以上前 → Xヶ月前 | ✅ |

### 結合テスト — `src/__tests__/integration/quiz/quizSession.test.ts`

| テスト名 | 結果 |
|---|---|
| 無効な問題が正しく検出される | ✅ |
| カテゴリ一覧が重複なく取得できる | ✅ |
| カテゴリフィルタで対象問題だけが返る | ✅ |
| 全件フィルタ（空文字）は全問題を返す | ✅ |
| written: 正規化して正誤判定できる | ✅ |
| choice2: buildProblemChoices が ○/✗ の固定2択を返す | ✅ |
| 初回不正解で苦手フラグが立ち、WEAK フィルタに引っかかる | ✅ |
| 連続正解で苦手フラグが解除され、WEAK フィルタから外れる | ✅ |
| ブックマーク登録・解除が BOOKMARKED フィルタに反映される | ✅ |
| 有効な問題だけに絞ったうえでカテゴリフィルタを適用できる | ✅ |

---

## 遷移フロー

```
/app/quiz/play
  ├── (URL: ?set=X) → selectedSetIds=[X] で問題集選択画面
  ├── 問題集選択 → 「次へ」→ 設定画面
  ├── 設定画面 → 「出題開始」→ セッション開始
  ├── セッション完了 (finished/reviewing) → 「戻る」→ 問題集選択画面
  ├── セッション中 → 「戻る」/ AppMenu / ブラウザ操作
  │     → isSessionInProgress=true → ブロッカーダイアログ
  │       ├── 「続ける」→ セッション継続
  │       └── 「離れる」→ proceed → ページ遷移
  └── 「← 問題集一覧」→ /app/quiz
```
