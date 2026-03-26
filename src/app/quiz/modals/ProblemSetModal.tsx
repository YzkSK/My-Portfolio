import { useState, useEffect } from 'react';
import {
  type ProblemSet, type SetCreateModal, type SetEditModal,
  type AnswerFormat, ANSWER_FORMAT_LABELS,
} from '../constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  onReset?: () => void;
  onClose: () => void;
};

export const ProblemSetModal = ({ modal, sets, onSave, onDelete, onReset, onClose }: Props) => {
  const [name, setName]               = useState('');
  const [answerFormat, setAnswerFormat] = useState<AnswerFormat>('written');
  const [error, setError]             = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

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
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[400px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {modal.type === 'set-create' ? '問題集を作成' : '問題集を編集'}
          </DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <div className="mb-4">
          <Label>問題集名 *</Label>
          <Input
            className={error ? 'border-red-400' : ''}
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="例：英単語 第1章"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>

        <div className="mb-4">
          <Label>回答形式 *</Label>
          <div className="qz-mode-btns flex-wrap gap-1.5">
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
          <p className="text-xs text-gray-400 mt-1">{FORMAT_HINTS[answerFormat]}</p>
        </div>

        {onReset && (
          confirmingReset ? (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-semibold text-amber-800 mb-2">回答履歴をリセットしますか？</p>
              <p className="text-xs text-amber-600 mb-3">すべての問題の回答数・正解数・苦手フラグがリセットされます。この操作は元に戻せません。</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmingReset(false)}>キャンセル</Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={() => { onReset(); onClose(); }}>リセットする</Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Button variant="outline" size="sm" className="w-full text-amber-600 border-amber-200 hover:border-amber-400" onClick={() => setConfirmingReset(true)}>
                回答履歴をリセット
              </Button>
            </div>
          )
        )}

        <div className="flex gap-2 items-center mt-4">
          {onDelete && (
            <Button variant="destructive" onClick={onDelete}>削除</Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
          <Button variant="default" className="flex-[2]" onClick={handleSave}>
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
