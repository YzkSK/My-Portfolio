import { type Problem, isWeak, isInvalidProblem } from '../constants';
import { ImageWithLoader } from './ImageWithLoader';

type Props = {
  problems: Problem[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onShare: () => void;
  onToggleBookmark: (id: string) => void;
};

export const ProblemList = ({ problems, onAdd, onEdit, onShare, onToggleBookmark }: Props) => {
  const sorted = [...problems].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <div className="qz-list-header">
        <div className="qz-list-title">問題一覧 ({problems.length}件)</div>
        <div className="qz-header-actions">
          <button className="qz-btn" style={{ fontSize: 12 }} onClick={onShare} disabled={problems.length === 0}>シェア</button>
          <button className="qz-btn qz-btn--primary" onClick={onAdd}>＋ 追加</button>
        </div>
      </div>

      {problems.length === 0 ? (
        <div className="qz-empty">
          <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
          <div>＋ボタンで問題を追加しましょう</div>
        </div>
      ) : (
        sorted.map(p => (
          <div key={p.id} className="qz-problem-item" onClick={() => onEdit(p.id)}>
            <div className="qz-problem-row">
              <div className="qz-problem-content">
                <div className="qz-problem-question">{p.question}</div>
                {p.imageUrl && <ImageWithLoader src={p.imageUrl} className="qz-problem-thumb" spinnerClassName="qz-img-spinner--thumb" />}
                <div className="qz-problem-answer">A: {p.answer}</div>
                {p.memo && <div className="qz-problem-memo">📝 {p.memo}</div>}
              </div>
              <button
                className="qz-bm-btn"
                onClick={e => { e.stopPropagation(); onToggleBookmark(p.id); }}
                title="ブックマーク"
              >
                {p.bookmarked ? '★' : '☆'}
              </button>
            </div>
            <div className="qz-problem-meta">
              {isInvalidProblem(p) && <span className="qz-invalid-badge">⚠ 選択肢が不足</span>}
              {p.category && <span className="qz-category-badge">{p.category}</span>}
              {isWeak(p) && <span className="qz-weak-icon">⚡苦手</span>}
              {p.consecutiveCorrect > 0 && (
                <span className="qz-streak-badge">✓×{p.consecutiveCorrect}</span>
              )}
            </div>
          </div>
        ))
      )}
    </>
  );
};
