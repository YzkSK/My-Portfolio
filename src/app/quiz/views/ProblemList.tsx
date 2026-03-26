import { useState } from 'react';
import { type Problem, isWeak, isInvalidProblem } from '../constants';
import { ImageWithLoader } from './ImageWithLoader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ANSWER_INLINE_LIMIT = 5;

type Props = {
  problems: Problem[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onShare: () => void;
  onToggleBookmark: (id: string) => void;
};

export const ProblemList = ({ problems, onAdd, onEdit, onShare, onToggleBookmark }: Props) => {
  const [answerDialog, setAnswerDialog] = useState<{ question: string; answer: string } | null>(null);
  const sorted = [...problems].sort((a, b) => b.createdAt - a.createdAt);

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
        sorted.map(p => {
          const isLong = p.answer.length > ANSWER_INLINE_LIMIT;
          return (
            <div key={p.id} className="qz-problem-item" onClick={() => onEdit(p.id)}>
              <div className="qz-problem-qa">
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
