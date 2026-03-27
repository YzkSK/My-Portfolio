import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../shared/firebase';
import { type Problem, type AnswerFormat, firestorePaths, newProblem } from '../constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SharedData = {
  problems: { question: string; answer: string; category: string; answerFormat?: AnswerFormat; wrongChoices?: string[]; memo?: string; imageUrl?: string }[];
  title: string;
  createdAt: number;
};

type Props = {
  onImport: (problems: Problem[], title: string) => void;
  onClose: () => void;
  addToast: (msg: string) => void;
  uid: string;
  allProblems: Problem[];
};

export const ImportModal = ({ onImport, onClose, addToast, uid, allProblems }: Props) => {
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

  const resolveImageUrl = async (sourceUrl: string): Promise<string> => {
    // 既存の問題に同じパスの画像があれば URL を再利用
    const sourcePath = (() => { try { return ref(storage, sourceUrl).fullPath; } catch { return null; } })();
    if (sourcePath) {
      const reused = allProblems.find(p => {
        if (!p.imageUrl) return false;
        try { return ref(storage, p.imageUrl).fullPath === sourcePath; } catch { return false; }
      });
      if (reused) return reused.imageUrl;
    }

    // blob を取得して自分の Storage に再アップロード
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ext = blob.type.split('/')[1] ?? 'jpg';
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const path = `quiz-images/${uid}/${hash}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  };

  const handleImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const imported = await Promise.all(preview.problems.map(async p => {
        let imageUrl = '';
        if (p.imageUrl) {
          try { imageUrl = await resolveImageUrl(p.imageUrl); } catch {}
        }
        return newProblem(p.question, p.answer, p.category, p.answerFormat, p.wrongChoices, p.memo, imageUrl);
      }));
      onImport(imported, preview.title);
      addToast(`${imported.length}件の問題をインポートしました`);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[400px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>問題集をインポート</DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <Label>シェアコード</Label>
          <div className="flex gap-2">
            <Input
              className="flex-1 text-base tracking-wider uppercase"
              value={code}
              onChange={e => { setCode(e.target.value); setError(''); setPreview(null); }}
              placeholder="例：AB3XYZ12"
              maxLength={8}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSearch(); }}
            />
            <Button variant="default" onClick={handleSearch} disabled={loading || !code.trim()}>
              {loading ? '…' : '検索'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
        </div>

        {preview && (
          <div>
            <div className="text-sm font-black text-[#1a1a1a] dark:text-[#e0e0e0] mb-1.5">
              {preview.title}
            </div>
            <div className="text-xs text-[#888] mb-2.5">
              {preview.problems.length}件の問題
            </div>
            <div className="border border-[#e8e8e8] dark:border-[#333] rounded-[10px] overflow-hidden my-3">
              {preview.problems.slice(0, 3).map((p, i) => (
                <div key={i} className="px-[14px] py-[10px] border-b border-[#f0f0f0] dark:border-[#333] last:border-b-0 text-[13px]">
                  <div className="font-bold text-[#1a1a1a] dark:text-[#e0e0e0]">Q. {p.question}</div>
                  <div className="text-[#888] mt-[2px]">A. {p.answer}</div>
                </div>
              ))}
              {preview.problems.length > 3 && (
                <div className="px-[14px] py-[10px] border-b border-[#f0f0f0] last:border-b-0 text-[13px] text-[#aaa] text-center">
                  ＋ {preview.problems.length - 3}件
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 items-center mt-5">
          <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
          {preview && (
            <Button variant="default" className="flex-[2]" onClick={handleImport} disabled={loading}>
              {loading ? 'インポート中...' : `${preview.problems.length}件をインポート`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
