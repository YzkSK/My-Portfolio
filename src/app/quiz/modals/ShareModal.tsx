import { useState } from 'react';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { type Problem, type AnswerFormat, getCategories, filterProblems, genShareCode, firestorePaths } from '../constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  problems: Problem[];
  uid: string;
  answerFormat: AnswerFormat;
  defaultTitle?: string;
  existingShareCode?: string;
  onShareCodeSaved: (code: string) => void;
  onClose: () => void;
  addToast: (msg: string) => void;
};

export const ShareModal = ({ problems, uid, answerFormat, defaultTitle = '', existingShareCode, onShareCodeSaved, onClose, addToast }: Props) => {
  const [title, setTitle]             = useState(defaultTitle);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [includeMemo, setIncludeMemo]   = useState(false);
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
          ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
        })),
        title: title.trim() || '問題集',
        setAnswerFormat: answerFormat,
        createdBy: uid,
        createdAt: Date.now(),
        expireAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
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
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[400px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>問題集をシェア</DialogTitle>
        </DialogHeader>

        {!shareCode ? (
          <>
            <div className="mb-4">
              <Label>タイトル（任意）</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例：英単語テスト 第1章"
              />
            </div>

            <div className="mb-4">
              <Label>シェアする問題</Label>
              <select
                name="share-category"
                className="w-full px-3 py-[9px] border-[1.5px] border-[#e0e0e0] dark:border-[#444] rounded-[9px] bg-white dark:bg-[#222] text-[13px] text-[#1a1a1a] dark:text-[#e0e0e0] font-semibold cursor-pointer appearance-none outline-none focus:border-[#1a1a1a] dark:focus:border-[#888]"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="">すべて ({problems.length}件)</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c} ({problems.filter(p => p.category === c).length}件)</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-2">対象: {targetProblems.length}件の問題</p>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 text-[13px] text-[#444] dark:text-[#aaa] cursor-pointer">
                <input
                  name="include-memo"
                  type="checkbox"
                  checked={includeMemo}
                  onChange={e => setIncludeMemo(e.target.checked)}
                />
                メモを含めてシェアする
              </label>
            </div>

            <div className="flex gap-2 items-center mt-5">
              <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
              <Button variant="default" className="flex-[2]" onClick={handleGenerate} disabled={loading || targetProblems.length === 0}>
                {loading ? '生成中...' : 'シェアコードを生成'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-1">シェアコードが生成されました</p>

            <div className="bg-[#f8f9fa] dark:bg-[#222] border-2 border-dashed border-[#e0e0e0] dark:border-[#444] rounded-[12px] p-5 text-center my-4">
              <div className="text-[28px] font-black text-[#1a1a1a] dark:text-[#e0e0e0] tracking-[0.15em] tabular-nums">{shareCode}</div>
              <div className="text-[12px] text-[#888] mt-[6px]">{targetProblems.length}件の問題 · 有効期限7日間</div>
            </div>

            <div className="flex gap-2 items-center mt-5">
              <Button variant="outline" className="flex-1" onClick={onClose}>閉じる</Button>
              <Button variant="default" className="flex-[2]" onClick={handleCopy}>
                コードをコピー
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
