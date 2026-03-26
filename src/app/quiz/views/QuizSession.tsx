import { useState, useEffect, useMemo, useRef } from 'react';
import { ImageWithLoader } from './ImageWithLoader';
import {
  type ActiveSession, type OneByOneSession, type ExamSession, type Problem,
  isExamSession, isAnswerCorrect, buildProblemChoices, formatTime, formatElapsed,
} from '../constants';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ResultFilter = 'all' | 'correct' | 'incorrect' | 'bookmarked';


type Props = {
  session: ActiveSession;
  problems: Problem[];  // 最新の bookmarked / memo 状態のために使う
  onFlashcardReveal: () => void;
  onFlashcardJudge: (correct: boolean) => void;
  onWrittenInputChange: (value: string) => void;
  onWrittenSubmit: () => void;
  onWrittenNext: (correct: boolean, answer: string) => void;
  onChoiceSelect: (option: string) => void;
  onChoiceNext: (correct: boolean, choice: string) => void;
  onExamNext: () => void;
  onExamPrev: () => void;
  onExamWrittenInputChange: (value: string) => void;
  onSubmitExam: () => void;
  onTimeUp: () => void;
  onEnd: () => void;
  onInterrupt: () => void;
  onJumpTo: (index: number) => void;
  onToggleBookmark: (id: string) => void;
  onUpdateMemo: (id: string, memo: string) => void;
};

export const QuizSession = ({
  session, problems,
  onFlashcardReveal, onFlashcardJudge,
  onWrittenInputChange, onWrittenSubmit, onWrittenNext,
  onChoiceSelect, onChoiceNext,
  onExamNext, onExamPrev, onExamWrittenInputChange,
  onSubmitExam, onTimeUp,
  onEnd, onInterrupt, onJumpTo, onToggleBookmark, onUpdateMemo,
}: Props) => {
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [remainingMs, setRemainingMs]   = useState<number>(0);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [memoInput, setMemoInput]         = useState('');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const timeUpFired = useRef(false);

  const isExam = isExamSession(session);

  // selectedChoice を currentIndex が変わるたびにリセット・復元
  useEffect(() => {
    if (isExam && session.phase === 'answering') {
      const prev = session.answers[session.currentIndex];
      setSelectedChoice(prev || null);
    } else {
      setSelectedChoice(null);
    }
  }, [session.currentIndex]);

  // 試験モードタイマー
  useEffect(() => {
    if (!isExam || session.phase !== 'answering') return;
    timeUpFired.current = false;

    const tick = () => {
      const rem = session.startedAt + session.timeLimit - Date.now();
      setRemainingMs(rem);
      if (rem <= 0 && !timeUpFired.current) {
        timeUpFired.current = true;
        onTimeUp();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isExam, session.phase]);

  const oneByOnePhase = !isExam ? (session as OneByOneSession).phase : null;

  // 一問一答: 現在の問題
  const oneByOneQ = !isExam ? session.queue[session.currentIndex] : null;
  // 試験: 現在の問題
  const examQ = isExam ? session.queue[session.currentIndex] : null;
  const currentQ = oneByOneQ ?? examQ;

  // 最新の bookmarked / memo 状態を問題リストから取得
  const getBookmarked = (id: string) => problems.find(p => p.id === id)?.bookmarked ?? false;
  const getMemo       = (id: string) => problems.find(p => p.id === id)?.memo ?? '';

  const startEditMemo = (id: string) => { setEditingMemoId(id); setMemoInput(getMemo(id)); };
  const saveMemo = (id: string) => { onUpdateMemo(id, memoInput); setEditingMemoId(null); };

  const renderMemo = (id: string) => (
    editingMemoId === id ? (
      <div className="qz-memo-edit">
        <textarea name="memo" className="qz-memo-input" value={memoInput} onChange={e => setMemoInput(e.target.value)} autoFocus placeholder="メモを入力" />
        <div className="qz-memo-edit-btns">
          <Button variant="outline" size="sm" onClick={() => setEditingMemoId(null)}>キャンセル</Button>
          <Button variant="default" size="sm" onClick={() => saveMemo(id)}>保存</Button>
        </div>
      </div>
    ) : (
      <div className="qz-memo-row" onClick={() => startEditMemo(id)}>
        {getMemo(id) ? <span className="qz-memo-text">📝 {getMemo(id)}</span> : <span className="qz-memo-placeholder">📝 メモを追加</span>}
      </div>
    )
  );

  // 一問一答: choice オプション（安定化）
  const oneByOneChoiceOptions = useMemo(() => {
    if (isExam || !oneByOneQ) return [];
    if (oneByOneQ.answerFormat === 'choice2' || oneByOneQ.answerFormat === 'choice4') {
      return buildProblemChoices(oneByOneQ);
    }
    return [];
  }, [isExam ? null : session.currentIndex]);

  // 試験: choice オプション（セッション開始時に全問分生成済み）
  const examChoiceOptions = isExam ? (session.choiceOptionsMap[session.currentIndex] ?? []) : [];

  const choiceOptions = isExam ? examChoiceOptions : oneByOneChoiceOptions;

  // チェックシート
  const renderSheet = () => {
    if (oneByOnePhase === 'finished') return null;
    if (isExam && session.phase === 'reviewing') return null;

    return (
      <div className="qz-sheet">
        <div className="qz-sheet-inner">
          {session.queue.map((p, i) => {
            let cls = 'qz-sheet-cell';
            if (i === session.currentIndex) cls += ' qz-sheet-cell--current';
            else if (!isExam) {
              const results = (session as OneByOneSession).results;
              if (i < results.length) {
                cls += results[i] ? ' qz-sheet-cell--correct' : ' qz-sheet-cell--wrong';
              }
            } else {
              if ((session as ExamSession).answers[i]) cls += ' qz-sheet-cell--answered';
            }
            if (isExam) cls += ' qz-sheet-cell--clickable';
            const bm = getBookmarked(p.id);
            return (
              <div key={p.id} className={cls} onClick={isExam ? () => onJumpTo(i) : undefined}>
                {i + 1}
                {bm && <span className="qz-sheet-bm">★</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── 一問一答: finished ─────────────────────────────────
  if (!isExam && oneByOnePhase === 'finished') {
    const s = session as OneByOneSession;
    const correctCount = s.results.filter(Boolean).length;
    const totalCount   = s.queue.length;
    const filtered = session.queue.map((p, i) => ({
      p,
      correct:    s.results[i] as boolean | undefined,
      answered:   i < s.results.length,
    })).filter(({ p, correct, answered }) => {
      if (resultFilter === 'correct')    return correct === true;
      if (resultFilter === 'incorrect')  return answered && correct === false;
      if (resultFilter === 'bookmarked') return getBookmarked(p.id);
      return true;
    });

    return (
      <div className="pb-6">
        <div className="text-center py-7">
          <div className="text-[52px] font-black text-[#1a1a1a] dark:text-[#e0e0e0] leading-none">{correctCount}/{totalCount}</div>
          <div className="text-[13px] text-[#888] mt-[6px]">正解</div>
        </div>

        <div className="flex gap-[6px] mb-[14px] flex-wrap">
          {([['all','すべて'],['correct','✓ 正解'],['incorrect','✗ 不正解'],['bookmarked','★ ブックマーク']] as [ResultFilter, string][]).map(([f, label]) => (
            <button key={f} className={`qz-filter-btn${resultFilter === f ? ' qz-filter-btn--active' : ''}`} onClick={() => setResultFilter(f)}>
              {label}
            </button>
          ))}
        </div>

        {filtered.map(({ p, correct, answered }) => {
          const userAns = s.answers[session.queue.indexOf(p)];
          const rowCls = !answered ? 'skip' : correct ? 'ok' : 'ng';
          return (
          <div key={p.id} className={`qz-result-item qz-result-item--${rowCls}`}>
            <div className={`qz-result-icon qz-result-icon--${!answered ? 'skip' : correct ? 'ok' : 'ng'}`}>
              {!answered ? '—' : correct ? '○' : '✗'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="qz-result-qa">
                <div className="qz-result-q">
                  <div className="qz-result-qa-label">問題</div>
                  <div className={p.imageUrl ? 'qz-result-q-body' : undefined}>
                    {p.imageUrl && <ImageWithLoader src={p.imageUrl} className="qz-result-img" spinnerClassName="qz-img-spinner--thumb" />}
                    <div className="qz-result-question">{p.question}</div>
                  </div>
                </div>
                {p.answerFormat !== 'flashcard' && answered && (
                  <div className="qz-result-a">
                    <div className="qz-result-qa-label">回答</div>
                    <div className={`qz-result-answer${correct ? '' : ' qz-result-answer--wrong'}`}>{userAns || '未回答'}</div>
                    {!correct && <div className="qz-result-userans">正解: {p.answer}</div>}
                  </div>
                )}
                {!answered && p.answerFormat !== 'flashcard' && (
                  <div className="qz-result-a">
                    <div className="qz-result-qa-label text-[#bbb]">未回答</div>
                    <div className="qz-result-userans">正解: {p.answer}</div>
                  </div>
                )}
              </div>
              {editingMemoId === p.id ? (
                <div className="qz-memo-edit">
                  <textarea name="memo" className="qz-memo-input" value={memoInput} onChange={e => setMemoInput(e.target.value)} autoFocus placeholder="メモを入力" />
                  <div className="qz-memo-edit-btns">
                    <Button variant="outline" size="sm" onClick={() => setEditingMemoId(null)}>キャンセル</Button>
                    <Button variant="default" size="sm" onClick={() => saveMemo(p.id)}>保存</Button>
                  </div>
                </div>
              ) : (
                <div className="qz-memo-row" onClick={() => startEditMemo(p.id)}>
                  {getMemo(p.id) ? <span className="qz-memo-text">📝 {getMemo(p.id)}</span> : <span className="qz-memo-placeholder">📝 メモを追加</span>}
                </div>
              )}
            </div>
            <button className="qz-result-bm-btn" onClick={() => onToggleBookmark(p.id)}>
              {getBookmarked(p.id) ? '★' : '☆'}
            </button>
          </div>
          );
        })}

        <div className="mt-5 flex gap-2">
          <Button variant="default" className="flex-1" onClick={onEnd}>問題一覧に戻る</Button>
        </div>
      </div>
    );
  }

  // ── 試験: reviewing ─────────────────────────────────────
  if (isExam && session.phase === 'reviewing') {
    const correctCount = session.queue.filter((p, i) => isAnswerCorrect(session.answers[i] ?? '', p.answer)).length;
    const elapsed = session.elapsedMs != null ? formatElapsed(session.elapsedMs) : null;

    const filtered = session.queue.map((p, i) => {
      const userAns = session.answers[i] ?? '';
      const correct = isAnswerCorrect(userAns, p.answer);
      return { p, correct, userAns };
    }).filter(({ p, correct }) => {
      if (resultFilter === 'correct')    return correct;
      if (resultFilter === 'incorrect')  return !correct;
      if (resultFilter === 'bookmarked') return getBookmarked(p.id);
      return true;
    });

    return (
      <div className="pb-6">
        <div className="text-center py-7">
          <div className="text-[52px] font-black text-[#1a1a1a] dark:text-[#e0e0e0] leading-none">{correctCount}/{session.queue.length}</div>
          <div className="text-[13px] text-[#888] mt-[6px]">正解</div>
        </div>
        {elapsed && <div className="text-center text-[13px] text-[#888] mb-5">所要時間: {elapsed}</div>}

        <div className="flex gap-[6px] mb-[14px] flex-wrap">
          {([['all','すべて'],['correct','✓ 正解'],['incorrect','✗ 不正解'],['bookmarked','★ ブックマーク']] as [ResultFilter, string][]).map(([f, label]) => (
            <button key={f} className={`qz-filter-btn${resultFilter === f ? ' qz-filter-btn--active' : ''}`} onClick={() => setResultFilter(f)}>
              {label}
            </button>
          ))}
        </div>

        {filtered.map(({ p, correct, userAns }) => (
          <div key={p.id} className={`qz-result-item qz-result-item--${correct ? 'ok' : 'ng'}`}>
            <div className={`qz-result-icon qz-result-icon--${correct ? 'ok' : 'ng'}`}>{correct ? '○' : '✗'}</div>
            <div className="flex-1 min-w-0">
              <div className="qz-result-qa">
                <div className="qz-result-q">
                  <div className="qz-result-qa-label">問題</div>
                  <div className={p.imageUrl ? 'qz-result-q-body' : undefined}>
                    {p.imageUrl && <ImageWithLoader src={p.imageUrl} className="qz-result-img" spinnerClassName="qz-img-spinner--thumb" />}
                    <div className="qz-result-question">{p.question}</div>
                  </div>
                </div>
                <div className="qz-result-a">
                  <div className="qz-result-qa-label">回答</div>
                  <div className={`qz-result-answer${correct ? '' : ' qz-result-answer--wrong'}`}>{userAns || '未回答'}</div>
                  {!correct && <div className="qz-result-userans">正解: {p.answer}</div>}
                </div>
              </div>
              {editingMemoId === p.id ? (
                <div className="qz-memo-edit">
                  <textarea name="memo" className="qz-memo-input" value={memoInput} onChange={e => setMemoInput(e.target.value)} autoFocus placeholder="メモを入力" />
                  <div className="qz-memo-edit-btns">
                    <Button variant="outline" size="sm" onClick={() => setEditingMemoId(null)}>キャンセル</Button>
                    <Button variant="default" size="sm" onClick={() => saveMemo(p.id)}>保存</Button>
                  </div>
                </div>
              ) : (
                <div className="qz-memo-row" onClick={() => startEditMemo(p.id)}>
                  {getMemo(p.id) ? <span className="qz-memo-text">📝 {getMemo(p.id)}</span> : <span className="qz-memo-placeholder">📝 メモを追加</span>}
                </div>
              )}
            </div>
            <button className="qz-result-bm-btn" onClick={() => onToggleBookmark(p.id)}>
              {getBookmarked(p.id) ? '★' : '☆'}
            </button>
          </div>
        ))}

        <div className="mt-5">
          <Button variant="default" className="w-full" onClick={onEnd}>問題一覧に戻る</Button>
        </div>
      </div>
    );
  }

  if (!currentQ) return null;

  const isAnswering = session.phase === 'answering';
  const isRevealed  = !isExam && oneByOnePhase === 'revealed';
  const method      = currentQ.answerFormat;
  const bookmarked  = getBookmarked(currentQ.id);

  // ── 試験: answering ─────────────────────────────────────
  if (isExam) {
    const totalQ   = session.queue.length;
    const answeredCount = session.answers.filter(a => a !== '').length;
    const isWritten   = method === 'written';
    const isChoice    = method === 'choice2' || method === 'choice4';
    const isFlashcard = method === 'flashcard';
    const canNext     = isFlashcard || isWritten || (isChoice && !!selectedChoice);

    const handleChoiceClick = (opt: string) => {
      setSelectedChoice(opt);
      onChoiceSelect(opt);
    };

    return (
      <>
        {/* タイマーヘッダー */}
        <div className="flex items-center justify-between mb-[14px]">
          <div className={`qz-timer${remainingMs < 5 * 60 * 1000 ? ' qz-timer--warning' : ''}`}>
            {formatTime(remainingMs)}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-[13px] text-[#888] font-semibold">{answeredCount}/{totalQ} 回答済み</span>
            <Button variant="default" size="sm" onClick={() => {
              const unanswered = session.answers.filter(a => a === '').length;
              if (unanswered > 0) setShowSubmitConfirm(true);
              else onSubmitExam();
            }}>提出する</Button>
          </div>
        </div>

        <Progress value={(session.currentIndex / totalQ) * 100} className="mb-5" />

        <button
          className={`qz-bookmark-row${bookmarked ? ' qz-bookmark-row--active' : ''}`}
          onClick={() => onToggleBookmark(currentQ.id)}
        >
          {bookmarked ? '★ ブックマーク済み' : '☆ ブックマークに追加'}
        </button>

        <div className="qz-card">
          <div className="qz-card-label">問 {session.currentIndex + 1}</div>
          <div className={currentQ.imageUrl ? 'qz-card-body' : undefined}>
            {currentQ.imageUrl && <ImageWithLoader src={currentQ.imageUrl} className="qz-card-img-side" />}
            <div className="qz-card-question">{currentQ.question}</div>
          </div>
        </div>

        {isWritten && (
          <textarea
            name="exam-answer"
            className="qz-written-input"
            value={session.answers[session.currentIndex] ?? ''}
            onChange={e => onExamWrittenInputChange(e.target.value)}
            placeholder="答えを入力（空欄でスキップ）"
          />
        )}

        {isChoice && (
          <div className={`qz-choices${method === 'choice2' ? ' qz-choices--row' : ''}`}>
            {choiceOptions.map((opt) => (
              <button
                key={opt}
                className={`qz-choice-btn${selectedChoice === opt ? ' qz-choice-btn--selected' : ''}`}
                onClick={() => handleChoiceClick(opt)}
              >

                {opt}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-center">
          {session.currentIndex > 0 && (
            <Button variant="outline" onClick={onExamPrev}>← 前の問題</Button>
          )}
          <Button
            variant="default"
            className="flex-1"
            onClick={session.currentIndex === totalQ - 1
            ? () => {
                const unanswered = session.answers.filter(a => a === '').length;
                if (unanswered > 0) setShowSubmitConfirm(true);
                else onSubmitExam();
              }
            : onExamNext}
            disabled={!canNext}
          >
            {session.currentIndex === totalQ - 1 ? '提出する' : '次の問題 →'}
          </Button>
        </div>

        {renderSheet()}

        {showSubmitConfirm && (() => {
          const unansweredNums = session.answers
            .map((a, i) => a === '' ? i + 1 : null)
            .filter((n): n is number => n !== null);
          return (
            <Dialog open={true} onOpenChange={() => setShowSubmitConfirm(false)}>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>未回答の問題があります</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-gray-500 mb-1">
                  以下の問題が未回答のまま提出されます。このまま提出しますか？
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {unansweredNums.map(n => (
                    <span
                      key={n}
                      className="text-xs font-bold px-2 py-1 rounded bg-[#f3f4f6] dark:bg-[#333] text-[#1a1a1a] dark:text-[#e0e0e0] cursor-pointer hover:bg-[#e5e7eb] dark:hover:bg-[#444]"
                      onClick={() => { onJumpTo(n - 1); setShowSubmitConfirm(false); }}
                      title={`問題 ${n} へ移動`}
                    >
                      {n}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowSubmitConfirm(false)}>戻る</Button>
                  <Button variant="default" className="flex-1" onClick={() => { setShowSubmitConfirm(false); onSubmitExam(); }}>提出する</Button>
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}
      </>
    );
  }

  // ── 一問一答 ────────────────────────────────────────────
  const s = session as OneByOneSession;
  const totalQ   = s.queue.length;
  const progress = s.currentIndex + 1;

  return (
    <>
      <div className="flex items-center justify-between mb-[14px]">
        <div className="text-[13px] text-[#888] font-semibold">{progress} / {totalQ}</div>
        <Button variant="outline" size="sm" onClick={onInterrupt}>中断</Button>
      </div>

      <Progress value={(progress / totalQ) * 100} className="mb-5" />

      {/* ブックマークボタン（共通） */}
      <button
        className={`qz-bookmark-row${bookmarked ? ' qz-bookmark-row--active' : ''}`}
        onClick={() => onToggleBookmark(currentQ.id)}
      >
        {bookmarked ? '★ ブックマーク済み' : '☆ ブックマークに追加'}
      </button>

      {/* フラッシュカード */}
      {method === 'flashcard' && (
        <>
          <div className={`qz-card${isRevealed ? ' qz-card--flip' : ''}`}>
            <div className="qz-card-label">問題</div>
            <div className={currentQ.imageUrl ? 'qz-card-body' : undefined}>
              {currentQ.imageUrl && <ImageWithLoader src={currentQ.imageUrl} className="qz-card-img-side" />}
              <div className="qz-card-question">{currentQ.question}</div>
            </div>
            {isRevealed && (
              <div className="qz-card-answer">
                <div className="qz-card-answer-label">答え</div>
                <div className="qz-card-answer-text">{currentQ.answer}</div>
              </div>
            )}
          </div>
          {isAnswering && (
            <Button variant="default" className="w-full" onClick={onFlashcardReveal}>
              答えを見る
            </Button>
          )}
          {isRevealed && (
            <>
              {renderMemo(currentQ.id)}
              <div className="flex gap-2 mt-1">
                <button className="qz-judge-btn qz-judge-btn--incorrect" onClick={() => onFlashcardJudge(false)}>✗ 不正解</button>
                <button className="qz-judge-btn qz-judge-btn--correct"   onClick={() => onFlashcardJudge(true)}>✓ 正解</button>
              </div>
            </>
          )}
        </>
      )}

      {/* 記述式 */}
      {method === 'written' && (
        <>
          <div className="qz-card">
            <div className="qz-card-label">問題</div>
            <div className={currentQ.imageUrl ? 'qz-card-body' : undefined}>
              {currentQ.imageUrl && <ImageWithLoader src={currentQ.imageUrl} className="qz-card-img-side" />}
              <div className="qz-card-question">{currentQ.question}</div>
            </div>
          </div>
          {isAnswering && (
            <>
              <textarea
                name="written-answer"
                className="qz-written-input"
                value={s.writtenInput}
                onChange={e => onWrittenInputChange(e.target.value)}
                placeholder="答えを入力してください"
                autoFocus
              />
              <Button variant="default" className="w-full" onClick={onWrittenSubmit}>
                回答する
              </Button>
            </>
          )}
          {isRevealed && (
            <>
              <div className={`qz-written-result qz-written-result--${s.pendingResult ? 'correct' : 'incorrect'}`}>
                {s.pendingResult ? '✓ 正解' : '✗ 不正解'}
              </div>
              <div className="qz-written-compare">
                あなたの回答: <span>{s.writtenInput || '未回答'}</span>
              </div>
              <div className="qz-written-compare">
                正解: <span>{currentQ.answer}</span>
              </div>
              {renderMemo(currentQ.id)}
              <Button variant="default" className="w-full" onClick={() => onWrittenNext(!!s.pendingResult, s.writtenInput)}>
                次へ
              </Button>
            </>
          )}
        </>
      )}

      {/* 2択 / 4択 */}
      {(method === 'choice2' || method === 'choice4') && (
        <>
          <div className="qz-card">
            <div className="qz-card-label">問題</div>
            <div className={currentQ.imageUrl ? 'qz-card-body' : undefined}>
              {currentQ.imageUrl && <ImageWithLoader src={currentQ.imageUrl} className="qz-card-img-side" />}
              <div className="qz-card-question">{currentQ.question}</div>
            </div>
          </div>
          <div className={`qz-choices${method === 'choice2' ? ' qz-choices--row' : ''}`}>
            {choiceOptions.map((opt) => {
              let cls = 'qz-choice-btn';
              if (isRevealed) {
                if (opt === currentQ.answer)                       cls += ' qz-choice-btn--correct';
                else if (opt === selectedChoice)                   cls += ' qz-choice-btn--incorrect';
              } else if (opt === selectedChoice) {
                cls += ' qz-choice-btn--selected';
              }
              return (
                <button
                  key={opt}
                  className={cls}
                  disabled={isRevealed}
                  onClick={() => {
                    if (isAnswering) {
                      setSelectedChoice(opt);
                      onChoiceSelect(opt);
                    }
                  }}
                >
  
                  {opt}
                </button>
              );
            })}
          </div>
          {isAnswering && (
            <Button
              variant="default"
              className="w-full"
              disabled={!selectedChoice}
              onClick={onFlashcardReveal}
            >
              答えを見る
            </Button>
          )}
          {isRevealed && (
            <>
              {renderMemo(currentQ.id)}
              <Button variant="default" className="w-full" onClick={() => onChoiceNext(selectedChoice === currentQ.answer, selectedChoice ?? '')}>
                次へ
              </Button>
            </>
          )}
        </>
      )}

      {renderSheet()}
    </>
  );
};
