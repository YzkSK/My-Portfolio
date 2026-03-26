import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { type Problem, type AnswerFormat, firestorePaths, newProblem } from '../constants';

type SharedData = {
  problems: { question: string; answer: string; category: string; answerFormat?: AnswerFormat; wrongChoices?: string[]; memo?: string }[];
  title: string;
  createdAt: number;
};

type Props = {
  onImport: (problems: Problem[], title: string) => void;
  onClose: () => void;
  addToast: (msg: string) => void;
};

export const ImportModal = ({ onImport, onClose, addToast }: Props) => {
  const [code, setCode]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [preview, setPreview]   = useState<SharedData | null>(null);
  const [error, setError]       = useState('');

  const handleSearch = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('コードを入力してください'); return; }
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const snap = await getDoc(doc(db, firestorePaths.sharedProblem(trimmed)));
      if (!snap.exists()) {
        setError('コードが見つかりませんでした');
        return;
      }
      setPreview(snap.data() as SharedData);
    } catch (e) {
      console.error(e);
      setError('検索に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview) return;
    const imported = preview.problems.map(p => newProblem(p.question, p.answer, p.category, p.answerFormat, p.wrongChoices, p.memo));
    onImport(imported, preview.title);
    addToast(`${imported.length}件の問題をインポートしました`);
    onClose();
  };

  return (
    <div className="qz-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qz-modal">
        <div className="qz-modal-title">問題集をインポート</div>

        <div className="qz-modal-field">
          <div className="qz-modal-label">シェアコード</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="qz-modal-input"
              style={{ flex: 1, fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              value={code}
              onChange={e => { setCode(e.target.value); setError(''); setPreview(null); }}
              placeholder="例：AB3XYZ12"
              maxLength={8}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            />
            <button className="qz-btn qz-btn--primary" onClick={handleSearch} disabled={loading || !code.trim()}>
              {loading ? '…' : '検索'}
            </button>
          </div>
          {error && <div className="qz-modal-error" style={{ marginTop: 6 }}>{error}</div>}
        </div>

        {preview && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a', marginBottom: 6 }}>
              {preview.title}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
              {preview.problems.length}件の問題
            </div>
            <div className="qz-preview-list">
              {preview.problems.slice(0, 3).map((p, i) => (
                <div key={i} className="qz-preview-item">
                  <div className="qz-preview-item-q">Q. {p.question}</div>
                  <div className="qz-preview-item-a">A. {p.answer}</div>
                </div>
              ))}
              {preview.problems.length > 3 && (
                <div className="qz-preview-item" style={{ color: '#aaa', textAlign: 'center' }}>
                  ＋ {preview.problems.length - 3}件
                </div>
              )}
            </div>
          </div>
        )}

        <div className="qz-modal-btns">
          <button className="qz-btn" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
          {preview && (
            <button className="qz-btn qz-btn--primary" style={{ flex: 2 }} onClick={handleImport}>
              {preview.problems.length}件をインポート
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
