import { useState, useRef } from 'react';
import { type Problem, isWeak, isInvalidProblem } from '../constants';
import { ImageWithLoader } from './ImageWithLoader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ANSWER_INLINE_LIMIT = 5;
const SHIFT_PX = 14;

type Props = {
  problems: Problem[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onShare: () => void;
  onToggleBookmark: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
};

const getItemIdFromPoint = (x: number, y: number): string | null => {
  const el = document.elementFromPoint(x, y);
  return (el?.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId ?? null;
};

export const ProblemList = ({ problems, onAdd, onEdit, onShare, onToggleBookmark, onReorder }: Props) => {
  const [answerDialog, setAnswerDialog] = useState<{ question: string; answer: string } | null>(null);
  const [dragId, setDragId]       = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const didDragRef        = useRef(false);
  const touchDragIdRef    = useRef<string | null>(null);
  const prevDragOverIdRef = useRef<string | null>(null);

  const sorted = [...problems].sort((a, b) => {
    if (a.index && b.index) return a.index - b.index;
    if (a.index) return -1;
    if (b.index) return 1;
    return b.createdAt - a.createdAt;
  });

  const dragFromIdx = dragId     ? sorted.findIndex(p => p.id === dragId)     : -1;
  const dragToIdx   = dragOverId ? sorted.findIndex(p => p.id === dragOverId) : -1;

  const getShift = (i: number): number => {
    if (dragFromIdx === -1 || dragToIdx === -1 || dragFromIdx === dragToIdx) return 0;
    if (dragFromIdx < dragToIdx && i > dragFromIdx && i <= dragToIdx) return -SHIFT_PX;
    if (dragFromIdx > dragToIdx && i >= dragToIdx && i < dragFromIdx) return  SHIFT_PX;
    return 0;
  };

  const updateDragOver = (id: string | null) => {
    if (id !== null && id !== prevDragOverIdRef.current) {
      navigator.vibrate?.(30);
    }
    prevDragOverIdRef.current = id;
    setDragOverId(id);
  };

  const applyReorder = (fromId: string, toId: string) => {
    const next = [...sorted];
    const fromIdx = next.findIndex(x => x.id === fromId);
    const toIdx   = next.findIndex(x => x.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item!);
    onReorder(next.map(x => x.id));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-black text-[#1a1a1a] dark:text-[#e0e0e0]">問題一覧 ({problems.length}件)</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onShare} disabled={problems.length === 0}>シェア</Button>
          <Button variant="default" onClick={onAdd}>＋ 追加</Button>
        </div>
      </div>

      {problems.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          <span className="text-[32px] block mb-3">📝</span>
          ＋ボタンで問題を追加しましょう
        </p>
      ) : (
        sorted.map((p, i) => {
          const isLong     = p.answer.length > ANSWER_INLINE_LIMIT;
          const isDragging = dragId === p.id;
          const isDragOver = dragOverId === p.id && dragId !== p.id;
          const shift      = getShift(i);
          return (
            <div
              key={p.id}
              data-item-id={p.id}
              style={{ transform: `translateY(${shift}px)` }}
              className={`qz-problem-item flex items-stretch gap-0 transition-[transform,opacity] duration-150 ${isDragging ? 'opacity-40' : 'opacity-100'} ${isDragOver ? 'border-t-2 border-blue-400' : ''}`}
              draggable
              onDragStart={e => {
                didDragRef.current = false;
                setDragId(p.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnter={() => updateDragOver(p.id)}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDragEnd={() => { setDragId(null); updateDragOver(null); prevDragOverIdRef.current = null; }}
              onDrop={e => {
                e.preventDefault();
                if (!dragId || dragId === p.id) return;
                didDragRef.current = true;
                applyReorder(dragId, p.id);
                setDragId(null);
                updateDragOver(null);
                prevDragOverIdRef.current = null;
              }}
              onClick={() => { if (!didDragRef.current) onEdit(p.id); didDragRef.current = false; }}
            >
              {/* ドラッグハンドル */}
              <div
                className="-ml-4 -my-[14px] mr-3 flex items-center px-2.5 border-r border-[#ececec] dark:border-[#2a2a2a] rounded-l-[11px] flex-shrink-0 touch-none"
                onTouchStart={e => {
                  e.preventDefault();
                  touchDragIdRef.current = p.id;
                  setDragId(p.id);
                  didDragRef.current = false;
                }}
                onTouchMove={e => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  if (!touch) return;
                  const overId = getItemIdFromPoint(touch.clientX, touch.clientY);
                  updateDragOver(overId !== touchDragIdRef.current ? overId : null);
                }}
                onTouchEnd={e => {
                  e.preventDefault();
                  const touch = e.changedTouches[0];
                  if (touch && touchDragIdRef.current) {
                    const toId = getItemIdFromPoint(touch.clientX, touch.clientY);
                    if (toId && toId !== touchDragIdRef.current) {
                      didDragRef.current = true;
                      applyReorder(touchDragIdRef.current, toId);
                    }
                  }
                  touchDragIdRef.current = null;
                  setDragId(null);
                  updateDragOver(null);
                  prevDragOverIdRef.current = null;
                }}
              >
                <span className="text-[16px] text-[#ccc] cursor-grab select-none">⠿</span>
              </div>

              <div className="qz-problem-qa flex-1 min-w-0">
                {/* 左: 問題側 */}
                <div className="qz-problem-q">
                  <div className="qz-problem-top-row">
                    <button
                      className="qz-bm-btn"
                      onClick={e => { e.stopPropagation(); onToggleBookmark(p.id); }}
                      title="ブックマーク"
                    >
                      {p.bookmarked ? '★' : '☆'}
                    </button>
                    {p.index > 0 && <span className="text-[10px] text-[#aaa] font-bold flex-shrink-0">#{p.index}</span>}
                    {p.imageUrl && <ImageWithLoader src={p.imageUrl} className="qz-problem-thumb" spinnerClassName="qz-img-spinner--thumb" />}
                    <div className="qz-problem-question">{p.question}</div>
                  </div>
                  {p.attemptCount > 0 && (
                    <div className="qz-problem-stats">
                      <span className="qz-problem-stat-item">{p.attemptCount}回</span>
                      <span className="qz-problem-stat-item qz-problem-stat-correct">✓ {p.correctCount}</span>
                      <span className="qz-problem-stat-item qz-problem-stat-wrong">✗ {p.attemptCount - p.correctCount}</span>
                      {isWeak(p) && <span className="qz-problem-stat-item qz-problem-stat-weak">⚡苦手</span>}
                    </div>
                  )}
                  {p.memo && <div className="qz-problem-memo">📝 {p.memo}</div>}
                  {(isInvalidProblem(p) || p.category) && (
                    <div className="qz-problem-meta">
                      {isInvalidProblem(p) && <Badge variant="warning">⚠ 選択肢が不足</Badge>}
                      {p.category && <Badge variant="secondary">{p.category}</Badge>}
                    </div>
                  )}
                </div>
                {/* 右: 答え側 */}
                <div className="qz-problem-a">
                  <div className="qz-result-qa-label">答え</div>
                  {isLong ? (
                    <button
                      className="qz-answer-peek-btn"
                      onClick={e => { e.stopPropagation(); setAnswerDialog({ question: p.question, answer: p.answer }); }}
                    >
                      表示
                    </button>
                  ) : (
                    <div className="qz-problem-answer">{p.answer}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {answerDialog && (
        <Dialog open={true} onOpenChange={() => setAnswerDialog(null)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>答え</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-3">{answerDialog.question}</p>
            <p className="text-base font-semibold text-[#1a1a1a] dark:text-[#e0e0e0] whitespace-pre-wrap">{answerDialog.answer}</p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
