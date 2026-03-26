import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { type Problem, getCategories, filterProblems, genShareCode, firestorePaths } from '../constants';

type Props = {
  problems: Problem[];
  uid: string;
  defaultTitle?: string;
  existingShareCode?: string;
  onShareCodeSaved: (code: string) => void;
  onClose: () => void;
  addToast: (msg: string) => void;
};

export const ShareModal = ({ problems, uid, defaultTitle = '', existingShareCode, onShareCodeSaved, onClose, addToast }: Props) => {
  const [title, setTitle]             = useState(defaultTitle);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [includeMemo, setIncludeMemo] = useState(false);
  const [shareCode, setShareCode]     = useState('');
  const [loading, setLoading]         = useState(false);

  const categories = getCategories(problems);
  const targetProblems = filterProblems(problems, categoryFilter);

  const handleGenerate = async () => {
    if (targetProblems.length === 0) {
      addToast('シェアする問題がありません');
      return;
    }
    setLoading(true);
    try {
      const code = existingShareCode ?? genShareCode();
      const payload = {
        problems: targetProblems.map(p => ({
          question: p.question, answer: p.answer, category: p.category,
          answerFormat: p.answerFormat, wrongChoices: p.wrongChoices,
          ...(includeMemo && p.memo ? { memo: p.memo } : {}),
        })),
        title: title.trim() || '問題集',
        createdBy: uid,
        createdAt: Date.now(),
      };
      await setDoc(doc(db, firestorePaths.sharedProblem(code)), payload);
      setShareCode(code);
      onShareCodeSaved(code);
    } catch (e) {
      console.error(e);
      addToast('シェアに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareCode).then(() => addToast('コードをコピーしました'));
  };

  return (
    <div className="qz-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qz-modal">
        <div className="qz-modal-title">問題集をシェア</div>

        {!shareCode ? (
          <>
            <div className="qz-modal-field">
              <div className="qz-modal-label">タイトル（任意）</div>
              <input
                className="qz-modal-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例：英単語テスト 第1章"
              />
            </div>

            <div className="qz-modal-field">
              <div className="qz-modal-label">シェアする問題</div>
              <select
                className="qz-filter-select"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="">すべて ({problems.length}件)</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c} ({problems.filter(p => p.category === c).length}件)</option>
                ))}
              </select>
              <div className="qz-modal-hint" style={{ marginTop: 8 }}>
                対象: {targetProblems.length}件の問題
              </div>
            </div>

            <div className="qz-modal-field">
              <label className="qz-modal-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeMemo}
                  onChange={e => setIncludeMemo(e.target.checked)}
                />
                メモを含めてシェアする
              </label>
            </div>

            <div className="qz-modal-btns">
              <button className="qz-btn" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
              <button className="qz-btn qz-btn--primary" style={{ flex: 2 }} onClick={handleGenerate} disabled={loading || targetProblems.length === 0}>
                {loading ? '生成中...' : 'シェアコードを生成'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>シェアコードが生成されました</div>

            <div className="qz-share-code">
              <div className="qz-share-code-value">{shareCode}</div>
              <div className="qz-share-code-hint">{targetProblems.length}件の問題 · このコードを相手に伝えてください</div>
            </div>

            <div className="qz-modal-btns">
              <button className="qz-btn" style={{ flex: 1 }} onClick={onClose}>閉じる</button>
              <button className="qz-btn qz-btn--primary" style={{ flex: 2 }} onClick={handleCopy}>
                コードをコピー
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
