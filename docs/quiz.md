# 問題集管理 `/app/quiz`

## 概要

問題集(ProblemSet)と問題(Problem)のCRUD管理画面。PDF取り込み・共有コード生成・インポート機能付き。

## コンポーネント構成

```
Quiz.tsx
├── DbErrorBanner (dbError=true の場合のみ)
├── Toast コンテナ (qz-toast-container)
└── <div class="max-w-[640px] mx-auto">
    ├── [問題集一覧ビュー] ← activeSetId === null
    │   ├── ヘッダー: AppMenu + 「問題集」タイトル + 「ログアウト」
    │   ├── サブヘッダー: 「マイ問題集 (N件)」+ 操作ボタン群
    │   │   ├── 「インポート」→ ImportModal
    │   │   ├── 「PDF抽出」→ GeminiPdfModal
    │   │   └── 「＋ 新規作成」→ ProblemSetModal (type:'set-create')
    │   └── 問題集リスト (sets.length === 0 なら空状態表示)
    │       └── 各カード (qz-set-item)
    │           ├── 問題集名 + 問題数 (+ ⚠ {N}件の選択肢が不足)
    │           └── 「編集」ボタン → ProblemSetModal (type:'set-edit')
    │
    └── [問題一覧ビュー] ← activeSetId !== null
        ├── ヘッダー: AppMenu + 問題集名 + 「名前変更」ボタン + 「← 一覧」ボタン
        └── ProblemList コンポーネント

固定フッター: 「回答する」ボタン (activeSetId===null かつ sets.length>0 の場合のみ表示)
  → navigate('/app/quiz/play')

ドラッグ&ドロップ並び替え (問題集一覧・問題一覧 共通):
  - 各カード左端の ⠿ ハンドルをマウス長押し or タッチ長押し
  - ゴーストカード: ポインター位置に追従（`position:fixed`）
    → `qz-card-lift` アニメーション（scale 1.04 + 大きめ shadow）
  - 元のカード: `qz-drag-placeholder`（点線枠、透明）+ `pointer-events:none` でゴーストカードの下のカードを `elementFromPoint` で検出可能に
  - 他カード: `translateY(±slotHeight)` でリアルタイムにスライド（220ms ease-out）
  - 離した時点で `applyReorder` / `handleReorderSets` を呼び出して Firestore 保存
```

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `sets` | `ProblemSet[]` | `[]` | 全問題集データ (`useFirestoreData` が管理) |
| `activeSetId` | `string \| null` | `null` | 選択中の問題集ID |
| `modal` | `Modal` | `null` | 開いているモーダル |
| `toasts` | Toast[] | `[]` | トースト通知 |
| `loading` | boolean | `true` | 読み込み中フラグ (`useFirestoreData` が管理) |
| `dbError` | boolean | `false` | Firestore エラーフラグ (`useFirestoreData` が管理) |
| `formError` | string | `''` | ProblemModal のエラー |
| `setsRef` | ref | — | cleanupImages 用の最新 sets 参照 |
| `dragSetId` | `string \| null` | `null` | ドラッグ中の問題集 ID |
| `dragOverSetId` | `string \| null` | `null` | ドラッグオーバー中の問題集 ID |
| `setPointerPos` | `{x,y} \| null` | `null` | ゴーストカード位置 |
| `dragSetIdRef` / `dragOverSetIdRef` | ref | — | グローバル mousemove リスナー内の stale-closure 回避用 |

## データ構造

```typescript
ProblemSet = {
  id: string          // nanoid で生成
  name: string
  answerFormat: 'flashcard' | 'written' | 'choice2' | 'choice4'
  problems: Problem[]
  createdAt: number
  shareCode?: string
}

Problem = {
  id: string
  question: string
  answer: string
  wrongChoices: string[]    // choice2: 0件, choice4: 3件
  answerFormat: AnswerFormat
  category: string
  memo: string
  imageUrl: string          // 空文字 = 画像なし
  createdAt: number
  bookmarked: boolean
  consecutiveCorrect: number
  consecutiveWrong: number
  correctCount: number
  attemptCount: number
}
```

## 回答形式の仕様

| answerFormat | 説明 | wrongChoices |
|---|---|---|
| `flashcard` | 答えを自分で確認するカード式 | 0件 |
| `written` | テキスト記述で回答 | 0件 |
| `choice2` | ○/✗ の2択 (wrongChoices 不要) | 0件 |
| `choice4` | 4択選択式 | 3件必須 |

## Firestore 操作

```
パス: users/{uid}/quiz/data

Read (useFirestoreData フック, マウント時1回):
  getDoc(ref)
  → data.sets が配列: parseProblemSet で正規化してセット
  → data.problems が配列 (旧形式): デフォルト「問題集」に移行
    移行が発生した場合は onAfterLoad で saveToFirestore({ sets }) を呼ぶ
  → エラー: console.error + setDbError(true)
  → 完了: setLoading(false), setGlobalLoading('quiz', false)

Write (useFirestoreSave フック, デバウンス 800ms):
  setDoc(ref, { sets: data }, { merge: true })
```

## 問題集 CRUD の詳細

### createSet(name, answerFormat)

```
newProblemSet(name, answerFormat) を生成
sets に追加 → saveToFirestore → modal=null
```

### updateSet(setId, name, answerFormat)

```
answerFormat が変わった場合:
  全問題の answerFormat を新しい形式に更新
  WRONG_CHOICES_COUNT[answerFormat] === 0 の場合: wrongChoices を [] にクリア
name, answerFormat を更新 → saveToFirestore → modal=null
```

### deleteSet(setId)

```
削除する問題集の画像を確認:
  他のセットで同じ画像パスを使用していない場合のみ deleteObject()
sets から除外 → saveToFirestore
activeSetId === setId の場合: setActiveSetId(null)
modal=null
```

### resetSetStats(setId)

```
対象セットの全問題の以下をリセット:
  attemptCount=0, correctCount=0, consecutiveCorrect=0, consecutiveWrong=0
saveToFirestore
```

## 問題 CRUD の詳細

### saveProblem(question, answer, category, wrongChoices, memo, imageUrl)

```
バリデーション:
  question.trim() が空 または answer.trim() が空 → formError = '問題文と答えは必須です'
  answerFormat === 'choice4' かつ wrongChoices に空文字あり → formError = '不正解の選択肢をすべて入力してください'

modal.type === 'add':
  newProblem(question, answer, category, answerFormat, wrongChoices, memo, imageUrl) を生成
  problems に追加

modal.type === 'edit':
  対象問題を更新 (question, answer, category, answerFormat, wrongChoices, memo, imageUrl)

updateActiveSetProblems → saveToFirestore → modal=null
return true (成功) / false (バリデーション失敗)
```

### deleteProblem(id)

```
問題の imageUrl を確認:
  他のセット/問題で同じパスを使用していない場合のみ deleteObject()
problems からフィルタ → updateActiveSetProblems → saveToFirestore → modal=null
```

### toggleBookmark(id)

```
対象問題の bookmarked を反転 → updateActiveSetProblems → saveToFirestore
```

## 画像クリーンアップ (cleanupImages)

```
cleanupImages(guardUrl: string):
  全問題の imageUrl から Storage パスを抽出 → usedPaths
  guardUrl のパスも usedPaths に追加 (削除保護)
  listAll(ref(storage, 'quiz-images/{uid}')) で全ファイル取得
  usedPaths に含まれないファイルを deleteObject()
  (失敗は無視: catch(() => {}))
```

## ⚠ 選択肢不足バッジの仕様

```
isInvalidProblem(p):
  question.trim() が空 → true
  answer.trim() が空 → true
  answerFormat === 'choice4' かつ (wrongChoices.length < 3 または 空文字あり) → true
  それ以外 → false

getInvalidCount(problems): isInvalidProblem の件数を返す

表示: 「⚠ {N}件の選択肢が不足」(amber色)
→ 該当問題集は出題ページでチェックボックスが disabled になる
```

## ShareModal 詳細

```
Phase 1: 設定画面
  - タイトル入力 (任意、未入力なら問題集名を使用)
  - カテゴリフィルター選択 (すべて / 各カテゴリ名)
  - 「メモを含める」チェックボックス
  - 「共有コードを生成」ボタン

生成処理:
  8文字のランダムコード生成 (既存コードがあれば再利用)
  setDoc('sharedProblems/{code}', {
    problems: filtered (memo 含む/除く),
    title,
    format: answerFormat,
    expiresAt: Timestamp.fromMillis(Date.now() + 7日)
  })
  → 生成成功: onShareCodeSaved(code) を呼び出し
    → Quiz 側で sets の shareCode を更新 → saveToFirestore

Phase 2: コード表示
  - 8文字コード表示
  - 問題数 + 有効期限 (7日間)
  - 「コピー」ボタン → navigator.clipboard.writeText(code) + トースト
```

## ImportModal 詳細

```
コード入力 (8文字、自動で大文字変換)
→ 「検索」ボタン
  getDoc('sharedProblems/{code}')
  → 存在しない or 期限切れ → エラー表示
  → 存在: プレビュー表示 (タイトル / 問題数 / 先頭3問)

「インポート」ボタン:
  画像処理 (imageUrl がある問題):
    fetch(url) → ArrayBuffer → SHA-256 ハッシュ計算
    同一ハッシュが allProblems に存在 → 既存 URL を再利用 (dedup)
    存在しない → Firebase Storage に再アップロード
  onImport(problems, title, answerFormat) を呼び出し
  → handleImport: newProblemSet を作成して sets に追加
```

## GeminiPdfModal 詳細

```
Phase 1: アップロード
  - PDF ファイル選択 (max 20MB)
  - ドラッグ&ドロップ対応
  - 「抽出開始」ボタン

Phase 2: 抽出中
  - PDF を base64 エンコード
  - Gemini API (gemini-3.1-flash-lite-preview) に送信
  - ストリーミングでレスポンスを表示
  - 返却形式: JSON { items: [{ question, answer, needsReview }] }
  - テキスト正規化: ルビ除去、図参照除去、○/✗ 統一

Phase 3: レビュー
  - 抽出された問題一覧 (チェックボックス付き)
  - 「要確認」バッジ (needsReview=true の問題)
  - 各問の Q/A を編集可能
  - 「選択した問題を再抽出」ボタン
  - 「全選択 / 全解除」ボタン
  - 「新しい問題集を作成」または「既存の問題集に追加」の選択
  - 「インポート」ボタン
    → 新規: onImportNew(problems, title, answerFormat)
    → 既存: onImportExisting(problems, setId)
```

## グローバルローディング

```
useFirestoreData フック内部の useLayoutEffect が管理:
  マウント時: setGlobalLoading('quiz', true)
  アンマウント時: setGlobalLoading('quiz', false)
  Firestore 読み込み完了後 (finally): setGlobalLoading('quiz', false)
```

## AI 解説生成 (memoGenerator.ts)

```
generateMemoExplanation(question, answer, onChunk):
  VITE_GOOGLE_GEMINI_API_KEY が未設定 → MemoGenError('no_api_key') をスロー
  Gemini API (gemini-3.1-flash-lite-preview) にストリーミングリクエスト
  チャンクごとに累積テキストを onChunk に渡す

エラーコード (MEMO_GEN_ERROR_CODES):
  E011: NO_API_KEY  (APIキー未設定)
  E012: GENERATE    (生成中エラー)
```

### ProblemModal の AI解説ボタン

```
revealed フェーズ・ProblemModal 編集エリア:
  「✨ AI解説を生成」ボタン (問題文・答えが入力済みの場合のみ有効)
  クリック → generateMemoExplanation(question, answer, onChunk)
    → メモ欄にストリーミング挿入
  生成中 (generatingMemo=true):
    Textarea は readOnly
    ボタンは disabled
  エラー時: addToast(`解説生成に失敗しました [E011]` など, 'error')
```

## 画像キャッシュ (imageCache.ts)

```
3層キャッシュ:
  1. メモリキャッシュ (Map<url, blobUrl>)
  2. Cache API ('quiz-img-v1')
  3. fetch (ネットワーク)

inFlight Map:
  同一 URL への並列呼び出しを同一 Promise で処理し blob URL の二重生成を防ぐ

failedUrls Set:
  失敗した URL を記録し、次回呼び出し時に Cache API をスキップして再試行

clearImageCache():
  全 blob URL を URL.revokeObjectURL() で解放しメモリキャッシュをクリア
```

## テスト

### 単体テスト — `src/__tests__/unit/quiz/constants.test.ts`（データ操作系）

| テスト名 | 結果 |
|---|---|
| isInvalidProblem — 正常な問題は false | ✅ |
| isInvalidProblem — question が空なら true | ✅ |
| isInvalidProblem — answer が空なら true | ✅ |
| isInvalidProblem — choice4 で wrongChoices が3件未満なら true | ✅ |
| isInvalidProblem — choice4 で wrongChoices に空文字があれば true | ✅ |
| isInvalidProblem — choice4 で wrongChoices が3件すべて有効なら false | ✅ |
| getCategories — カテゴリが重複なく返る | ✅ |
| getCategories — 空カテゴリは除外される | ✅ |
| getErrorCode — code プロパティを持つオブジェクトからコードを返す | ✅ |
| getErrorCode — Error インスタンスはメッセージを返す | ✅ |
| getErrorCode — その他は文字列化して返す | ✅ |
| parseProblem — すべてのフィールドを正しくパースする | ✅ |
| parseProblem — 欠損フィールドはデフォルト値で補完される | ✅ |
| parseProblemSet — 正常なデータをパースする | ✅ |
| parseProblemSet — shareCode がある場合はセットされる | ✅ |
| parseProblemSet — shareCode がない場合はプロパティなし | ✅ |
| newProblem — 指定した値で問題を生成する | ✅ |
| newProblemSet — 指定した値でセットを生成する | ✅ |
| buildProblemChoices — choice2 は常に ○/✗ の固定2択 | ✅ |
| buildProblemChoices — choice4 は正解 + wrongChoices の計4択を含む | ✅ |
| MAX_RECENT — 10 である | ✅ |
| RECENT_INITIAL_SHOW — 3 である | ✅ |
| MEMO_GEN_ERROR_CODES.NO_API_KEY — E011 | ✅ |
| MEMO_GEN_ERROR_CODES.GENERATE — E012 | ✅ |
| MemoGenError — reason プロパティが正しく設定される | ✅ |
| MemoGenError — generate reason も正しく設定される | ✅ |

### 単体テスト — `src/__tests__/unit/quiz/imageCache.test.ts`

| テスト名 | 結果 |
|---|---|
| メモリキャッシュヒット → fetch せずに blob URL を返す | ✅ |
| Cache API ヒット → fetch せずに blob URL を返す | ✅ |
| キャッシュミス → fetch して blob URL を返す | ✅ |
| fetch 失敗した URL は再取得をスキップしない（再試行する） | ✅ |
| 並列呼び出しは同一 Promise を共有し fetch は1回だけ呼ばれる | ✅ |
| clearImageCache — blob URL を revoke してメモリキャッシュをクリアする | ✅ |

### 結合テスト — `src/__tests__/integration/quiz/memoGenerator.test.ts`

| テスト名 | 結果 |
|---|---|
| API キーがない場合は MemoGenError(no_api_key) をスローする | ✅ |
| ストリーミング成功時に onChunk へ累積テキストが渡される | ✅ |
| ストリーミング成功時に getGenerativeModel が呼ばれる | ✅ |

### 結合テスト — `src/__tests__/integration/quiz/reorder.test.ts`

| テスト名 | 結果 |
|---|---|
| index 順に並ぶ（昇順） | ✅ |
| index=0 の問題は createdAt の新しい順（末尾）になる | ✅ |
| 前方ドラッグ後の順序が正しい | ✅ |
| 前方ドラッグ後に index が 1 始まりで再採番される | ✅ |
| 後方ドラッグ後の順序が正しい | ✅ |
| 後方ドラッグ後に index が 1 始まりで再採番される | ✅ |
| 同じ位置へのドラッグは順序を変えない | ✅ |
| 前方ドラッグ: 間に挟まるカードが -slotHeight ずれる | ✅ |
| 後方ドラッグ: 間に挟まるカードが +slotHeight ずれる | ✅ |
| dragFromIdx === dragToIdx のとき全カードのシフトは 0 | ✅ |
| ドラッグ未開始（-1）のとき全カードのシフトは 0 | ✅ |
| 問題集の前方ドラッグ後の順序が正しい | ✅ |
| 問題集の後方ドラッグ後の順序が正しい | ✅ |
| index が不連続な問題でも並び替え後に連番になる | ✅ |

---

## 遷移フロー

```
/app/quiz
  ├── 問題集カードクリック → 問題一覧ビューへ (activeSetId 更新、ページ遷移なし)
  ├── 「← 一覧」クリック → 問題集一覧ビューへ (activeSetId=null)
  ├── 「回答する」クリック → /app/quiz/play
  ├── 「ログアウト」→ signOut() → /app/login
  └── AppMenu → 各ページ
```
