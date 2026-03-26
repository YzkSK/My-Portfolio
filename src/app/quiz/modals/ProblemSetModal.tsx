import { useState, useEffect } from 'react';
import {
  type ProblemSet, type SetCreateModal, type SetEditModal,
  type AnswerFormat, ANSWER_FORMAT_LABELS,
} from '../constants';

const FORMATS: AnswerFormat[] = ['flashcard', 'written', 'choice2', 'choice4'];
const FORMAT_HINTS: Record<AnswerFormat, string> = {
  flashcard: '問題と答えを見て自己採点',
  written:   'テキストを入力して回答',
  choice2:   '○ か ✗ で回答',
  choice4:   '正解 + 不正解3件の4択',
};

type Props = {
  modal: SetCreateModal | SetEditModal;
  sets: ProblemSet[];
  onSave: (name: string, answerFormat: AnswerFormat) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export const ProblemSetModal = ({ modal, sets, onSave, onDelete, onClose }: Props) => {
  const [name, setName]               = useState('');
  const [answerFormat, setAnswerFormat] = useState<AnswerFormat>('written');
  const [error, setError]             = useState('');

  useEffect(() => {
    if (modal.type === 'set-edit') {
      const s = sets.find(s => s.id === modal.setId);
      if (s) { setName(s.name); setAnswerFormat(s.answerFormat); }
    }
  }, []);

  const handleSave = () => {
    if (!name.trim()) { setError('問題集名を入力してください'); return; }
    onSave(name.trim(), answerFormat);
  };

  return (
    <div className="qz-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qz-modal">
        <div className="qz-modal-title">
          {modal.type === 'set-create' ? '問題集を作成' : '問題集を編集'}
        </div>

        {error && <div className="qz-modal-error">{error}</div>}

        <div className="qz-modal-field">
          <div className="qz-modal-label">問題集名 *</div>
          <input
            className={`qz-modal-input${error ? ' qz-modal-input--error' : ''}`}
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="例：英単語 第1章"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>

        <div className="qz-modal-field">
          <div className="qz-modal-label">回答形式 *</div>
          <div className="qz-mode-btns" style={{ flexWrap: 'wrap', gap: 6 }}>
            {FORMATS.map(fmt => (
              <button
                key={fmt}
                type="button"
                className={`qz-mode-btn${answerFormat === fmt ? ' qz-mode-btn--active' : ''}`}
                style={{ flex: 'none', minWidth: 'calc(25% - 5px)', fontSize: 12, padding: '7px 4px' }}
                onClick={() => setAnswerFormat(fmt)}
              >
                {ANSWER_FORMAT_LABELS[fmt]}
              </button>
            ))}
          </div>
          <div className="qz-modal-hint" style={{ marginTop: 6 }}>
            {FORMAT_HINTS[answerFormat]}
          </div>
        </div>

        <div className="qz-modal-btns">
          {onDelete && (
            <button className="qz-btn qz-btn--danger" onClick={onDelete}>削除</button>
          )}
          <button className="qz-btn" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
          <button className="qz-btn qz-btn--primary" style={{ flex: 2 }} onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
