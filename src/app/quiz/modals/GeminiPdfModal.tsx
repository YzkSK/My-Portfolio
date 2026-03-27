import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../shared/firebase';
import { type Problem, type ProblemSet, newProblem } from '../constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type Step = 'upload' | 'extracting' | 'review';
type ImportMode = 'new' | 'existing';

type ExtractedItem = {
  id: string;
  question: string;
  answer: string;
  imageUrl: string;
  checked: boolean;
};

type GeminiResult = {
  question: string;
  answer: string;
  figure: { page: number; x1: number; y1: number; x2: number; y2: number } | null;
};

type Props = {
  sets: ProblemSet[];
  uid: string;
  onImportNew: (problems: Problem[], title: string) => void;
  onImportExisting: (problems: Problem[], setId: string) => void;
  onClose: () => void;
  addToast: (msg: string) => void;
};

const PROMPT = `このPDFから問題と答えをすべて抽出してください。

以下のJSONフォーマットのみで返答してください（説明や前置きは不要）：
[
  {
    "question": "問題文",
    "answer": "答え（不明な場合は空文字列）",
    "figure": { "page": 1, "x1": 0.05, "y1": 0.30, "x2": 0.95, "y2": 0.65 }
  }
]

ルール：
- 問題が見当たらない場合は空配列 [] を返す
- 答えが明記されていない問題は answer を "" (空文字列) にする（問題文をコピーして answer に入れないこと）
- answer には必ず「答え・解答」のみを入れる。問題文・問題番号・選択肢などを answer に含めない
- 問題番号・記号は question に含めない
- ふりがな（ルビ）は除外してください（例：「漢字（かんじ）」→「漢字」）
- マークダウン記法（\`\`\`json など）は使わず、純粋なJSONのみ返す
- 問題に図・グラフ・表・画像が含まれる場合は figure フィールドにページ番号（1始まり）と正規化座標（0〜1）を返す
- 図がない場合は "figure": null にする
- x1,y1 は図の左上、x2,y2 は右下（ページ左上が原点）`;

const normalizeText = (text: string): string =>
  text
    .replace(/[（(][ぁ-ん]+[）)]/g, '')
    .replace(/《[ぁ-ん]+》/g, '')
    .replace(/[ \t　]+/g, ' ')
    .trim();

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const arrayBufferFromFile = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

const uploadFigure = async (
  pdfArrayBuffer: ArrayBuffer,
  figure: { page: number; x1: number; y1: number; x2: number; y2: number },
  uid: string,
): Promise<string> => {
  const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer.slice(0) }).promise;
  const page = await pdf.getPage(figure.page);
  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const px1 = Math.floor(figure.x1 * viewport.width);
  const py1 = Math.floor(figure.y1 * viewport.height);
  const pw  = Math.ceil((figure.x2 - figure.x1) * viewport.width);
  const ph  = Math.ceil((figure.y2 - figure.y1) * viewport.height);

  const crop = document.createElement('canvas');
  crop.width  = pw;
  crop.height = ph;
  crop.getContext('2d')!.drawImage(canvas, px1, py1, pw, ph, 0, 0, pw, ph);

  const blob = await new Promise<Blob>(res => crop.toBlob(b => res(b!), 'image/png'));
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  const storageRef = ref(storage, `quiz-images/${uid}/${hash}.png`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const GeminiPdfModal = ({ sets, uid, onImportNew, onImportExisting, onClose, addToast }: Props) => {
  const [step, setStep]               = useState<Step>('upload');
  const [file, setFile]               = useState<File | null>(null);
  const [error, setError]             = useState('');
  const [items, setItems]             = useState<ExtractedItem[]>([]);
  const [importMode, setImportMode]   = useState<ImportMode>('new');
  const [setName, setSetName]         = useState('');
  const [targetSetId, setTargetSetId] = useState(sets[0]?.id ?? '');
  const [nameError, setNameError]     = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { setError('PDFファイルを選択してください'); return; }
    if (f.size > 20 * 1024 * 1024) { setError('ファイルサイズは20MB以下にしてください'); return; }
    setError('');
    setFile(f);
  };

  const handleExtract = async () => {
    if (!file) return;
    setError('');
    setStep('extracting');
    try {
      const [base64Data, arrayBuffer] = await Promise.all([
        fileToBase64(file),
        arrayBufferFromFile(file),
      ]);

      const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY as string;
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent([
        { inlineData: { mimeType: 'application/pdf', data: base64Data } },
        { text: PROMPT },
      ]);

      let text = result.response.text().trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed: GeminiResult[] = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Unexpected response format');

      const extracted: ExtractedItem[] = await Promise.all(
        parsed
          .filter(item => typeof item.question === 'string' && item.question.trim())
          .map(async item => {
            let imageUrl = '';
            if (item.figure) {
              try {
                imageUrl = await uploadFigure(arrayBuffer, item.figure, uid);
              } catch (e) {
                console.warn('図のアップロードに失敗しました', e);
              }
            }
            return {
              id: crypto.randomUUID(),
              question: normalizeText(item.question),
              answer:   normalizeText(typeof item.answer === 'string' ? item.answer : ''),
              imageUrl,
              checked: true,
            };
          })
      );

      if (extracted.length === 0) {
        setError('問題が見つかりませんでした。別のPDFをお試しください。');
        setStep('upload');
        return;
      }

      setSetName(file.name.replace(/\.pdf$/i, ''));
      setItems(extracted);
      setStep('review');
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('429') || msg.toLowerCase().includes('spending cap') || msg.toLowerCase().includes('quota')) {
        setError('APIの利用上限に達しました。しばらく待つか、Google AI Studioでスペンディングキャップを確認してください。');
      } else {
        setError('抽出に失敗しました。APIキーや接続を確認してください。');
      }
      setStep('upload');
    }
  };

  const updateItem = (id: string, patch: Partial<ExtractedItem>) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const handleCreate = () => {
    const selected = items.filter(i => i.checked);
    if (selected.length === 0) { setNameError('1件以上の問題を選択してください'); return; }
    const problems = selected.map(i => newProblem(i.question, i.answer, '', 'written', [], '', i.imageUrl));

    if (importMode === 'new') {
      if (!setName.trim()) { setNameError('問題集名を入力してください'); return; }
      onImportNew(problems, setName.trim());
    } else {
      if (!targetSetId) { setNameError('問題集を選択してください'); return; }
      onImportExisting(problems, targetSetId);
    }
    addToast(`${problems.length}件の問題を追加しました`);
    onClose();
  };

  const allChecked   = items.length > 0 && items.every(i => i.checked);
  const checkedCount = items.filter(i => i.checked).length;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[500px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>PDFから問題を抽出</DialogTitle>
        </DialogHeader>

        {/* ── Step: upload ── */}
        {step === 'upload' && (
          <>
            <button
              className="w-full border-2 border-dashed border-[#ddd] dark:border-[#444] rounded-[10px] py-8 flex flex-col items-center gap-2 text-[#888] hover:border-[#aaa] transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-3xl">📄</span>
              <span className="text-sm font-semibold">
                {file ? file.name : 'PDFを選択（最大20MB）'}
              </span>
              {file && (
                <span className="text-xs text-[#aaa]">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}

            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
              <Button variant="default" className="flex-[2]" onClick={handleExtract} disabled={!file}>
                抽出する
              </Button>
            </div>
          </>
        )}

        {/* ── Step: extracting ── */}
        {step === 'extracting' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-10 h-10 border-4 border-[#e0e0e0] border-t-[#1a1a1a] dark:border-t-[#e0e0e0] rounded-full animate-spin" />
            <p className="text-sm text-[#888] font-semibold">Geminiで解析中...</p>
            <p className="text-xs text-[#aaa]">{file?.name}</p>
          </div>
        )}

        {/* ── Step: review ── */}
        {step === 'review' && (
          <>
            {/* インポート先トグル */}
            <div className="flex gap-1 p-1 bg-[#f0f0f0] dark:bg-[#222] rounded-[8px] mb-3">
              {(['new', 'existing'] as const).map(mode => (
                <button
                  key={mode}
                  className={`flex-1 text-[13px] font-semibold py-1.5 rounded-[6px] transition-colors ${
                    importMode === mode
                      ? 'bg-white dark:bg-[#333] shadow text-[#1a1a1a] dark:text-[#e0e0e0]'
                      : 'text-[#888]'
                  }`}
                  onClick={() => { setImportMode(mode); setNameError(''); }}
                >
                  {mode === 'new' ? '新しい問題集を作成' : '既存の問題集に追加'}
                </button>
              ))}
            </div>

            {/* 問題集名 or セレクト */}
            <div className="mb-3">
              {importMode === 'new' ? (
                <>
                  <Label>問題集名 *</Label>
                  <input
                    className="w-full border border-[#e0e0e0] dark:border-[#444] rounded-[8px] px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e0e0e0] outline-none focus:border-[#999] mt-1"
                    value={setName}
                    onChange={e => { setSetName(e.target.value); setNameError(''); }}
                    placeholder="例：英語テスト第1章"
                  />
                </>
              ) : (
                <>
                  <Label>追加先の問題集 *</Label>
                  <select
                    className="w-full border border-[#e0e0e0] dark:border-[#444] rounded-[8px] px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e0e0e0] outline-none focus:border-[#999] mt-1"
                    value={targetSetId}
                    onChange={e => { setTargetSetId(e.target.value); setNameError(''); }}
                  >
                    {sets.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </>
              )}
              {nameError && <p className="text-sm text-red-500 mt-1">{nameError}</p>}
            </div>

            {/* 全選択トグル */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#888] font-semibold">
                {checkedCount} / {items.length} 件を選択
              </span>
              <button
                className="text-xs text-blue-500 font-bold"
                onClick={() => setItems(prev => prev.map(it => ({ ...it, checked: !allChecked })))}
              >
                {allChecked ? 'すべて解除' : 'すべて選択'}
              </button>
            </div>

            {/* 問題リスト */}
            <div className="border border-[#e8e8e8] dark:border-[#333] rounded-[10px] overflow-hidden max-h-[38vh] overflow-y-auto mb-3">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 px-3 py-2.5 border-b border-[#f0f0f0] dark:border-[#333] last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={e => updateItem(item.id, { checked: e.target.checked })}
                    className="mt-1 flex-shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#aaa] font-bold w-5 flex-shrink-0">{idx + 1}</span>
                      <input
                        className="flex-1 text-[13px] border border-[#e8e8e8] dark:border-[#444] rounded-[6px] px-2 py-0.5 font-semibold bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e0e0e0] outline-none"
                        value={item.question}
                        onChange={e => updateItem(item.id, { question: e.target.value })}
                        placeholder="問題文"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 ml-[26px]">
                      <input
                        className="flex-1 text-[13px] border border-[#e8e8e8] dark:border-[#444] rounded-[6px] px-2 py-0.5 text-[#888] bg-white dark:bg-[#1a1a1a] outline-none"
                        value={item.answer}
                        onChange={e => updateItem(item.id, { answer: e.target.value })}
                        placeholder="答えなし"
                      />
                      {item.imageUrl && (
                        <span className="text-xs text-green-500 flex-shrink-0" title="図あり">🖼</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
              <Button
                variant="default"
                className="flex-[2]"
                onClick={handleCreate}
                disabled={checkedCount === 0}
              >
                {importMode === 'new'
                  ? `問題集を作成（${checkedCount}件）`
                  : `追加（${checkedCount}件）`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
