import { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { type Problem, type ProblemSet, newProblem } from '../constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type Step = 'upload' | 'extracting' | 'review';
type ImportMode = 'new' | 'existing';

type ExtractedItem = {
  id: string;
  question: string;
  answer: string;
  checked: boolean;
  needsReview: boolean;
};

type GeminiResult = {
  question: string;
  answer: string;
  needsReview?: boolean;
};

type Props = {
  sets: ProblemSet[];
  onImportNew: (problems: Problem[], title: string) => void;
  onImportExisting: (problems: Problem[], setId: string) => void;
  onClose: () => void;
  addToast: (msg: string) => void;
};

const PROMPT = `あなたはPDFから問題と答えを抽出するツールです。抽出のみを行い、問題・答えを一切生成・創作・推測しないでください。

以下のJSONフォーマットのみで返答してください（説明や前置きは不要）：
{
  "items": [
    {
      "question": "問題文",
      "answer": "答え（不明な場合は空文字列）",
      "needsReview": true
    }
  ],
  "reason": "問題が見つからなかった場合のみ、その理由を日本語で記載。見つかった場合は空文字列"
}

【絶対に守るルール】
- PDFに書かれている文字をそのまま抽出する。問題文・答えをどちらも自分で考えて作ってはいけない
- 番号付きの文章・記述は、形式に関わらず問題として出題されているものである（○×問題・穴埋め・記述など）。これらも問題として抽出すること
- PDFに問題として明記されていないテキストを question にしてはいけない
- PDFに答えとして明記されていないテキストを answer にしてはいけない
- answer に question と同じ内容を入れてはいけない
- 問題が見つからなかった場合は items を [] にし、reason に抽出できなかった理由を具体的に日本語で説明する
- 答えが明記されていない問題は answer を "" にする

【問題の識別ルール】
- 各問題は独立したものとして扱い、他の問題の文章・答えと混同・混在させてはいけない
- 問題番号・区切り・改行・レイアウトを手がかりに、どこからどこまでが1つの問題かを正確に判断する
- 複数の問題にまたがる文章を1つの question にまとめてはいけない
- ある問題の文章の一部が次の問題に混入してはいけない
- 問題と答えの対応は番号・位置関係から厳密に1対1で判断し、他の問題の答えを誤って割り当ててはいけない

【問題の識別ルール】
- 各問題は独立したものとして扱い、他の問題の文章・答えと混同・混在させてはいけない
- 問題番号・区切り・改行・レイアウトを手がかりに、どこからどこまでが1つの問題かを正確に判断する
- 複数の問題にまたがる文章を1つの question にまとめてはいけない
- ある問題の文章の一部が次の問題に混入してはいけない
- 問題と答えの対応は番号・位置関係から厳密に1対1で判断し、他の問題の答えを誤って割り当ててはいけない
- 問題の区切りが少しでも曖昧な場合は needsReview を true にする

【別ページの答え合わせルール】
- 答えが問題と別のページ（例：巻末の解答ページ、答え合わせのページ）に記載されている場合、以下の条件を満たす場合のみ answer に設定する：
  1. 問題と答えが同じカテゴリ・セクション・単元に属していることが確認できる（例：同じ章番号、同じ見出し名）
  2. 番号が一致している（問題「3.」の答えは答えページの「3.」のみ対応する）
- 上記の条件を満たしていても、文字が潰れている・滲んでいる・不鮮明・読み取りに不安がある場合は answer を "" にする（不確かな答えは無視する）
- カテゴリが異なる可能性がある、または番号の対応が不明確な場合は answer を "" にする

【出力前の確認ルール】
- JSONを出力する前に、抽出した各 question・answer をPDFの原文と1文字ずつ照合し、誤字・脱字・文字化けがないか確認する
- needsReview はデフォルト true とし、全文字を完全に正確に抽出できたという100%の確信がある場合のみ false にする
- 0.01%でもズレている可能性があると感じた場合は needsReview を true のままにする
- 少しでも不確かな文字・読み取りにくい箇所・かすれ・潰れ・フォントの崩れ・問題の区切りの曖昧さがある場合は needsReview を true のままにする
- JSONを一度出力したあと、出力したJSONをPDFの原文と再度読み直して照合する
- 照合の結果、誤りや不一致があれば修正したJSONを最終出力とする
- needsReview の判定も再確認し、少しでも疑いがあれば true に修正する
- 最終的な確認済みJSONのみを返す

【書式ルール】
- 問題番号・記号は question に含めない
- ふりがな（ルビ）は除外する（例：「漢字（かんじ）」→「漢字」）
- マークダウン記法（\`\`\`json など）は使わず、純粋なJSONのみ返す
- 「左図」「右図」「上図」「下図」「左の図」「右の図」など場所を指定した図の表現は、場所を示す部分を取り除いて文脈に自然な表現に書き換える（例：「左図のように」→「図のように」）。それ以外の文言は一切書き換えない`;

const normalizeText = (text: string): string =>
  text
    .replace(/[（(][ぁ-ん]+[）)]/g, '')
    .replace(/《[ぁ-ん]+》/g, '')
    .replace(/[ \t\u3000]+/g, ' ')
    // ○ / ✗ を CHOICE2_OPTIONS と同じ文字に統一
    .replace(/[◯〇]/g, '○')
    .replace(/[✕×✖☓Xx×]/g, '✗')
    .trim();

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });


export const GeminiPdfModal = ({ sets, onImportNew, onImportExisting, onClose, addToast }: Props) => {
  const [step, setStep]               = useState<Step>('upload');
  const [file, setFile]               = useState<File | null>(null);
  const [error, setError]             = useState('');
  const [items, setItems]             = useState<ExtractedItem[]>([]);
  const [importMode, setImportMode]   = useState<ImportMode>('new');
  const [setName, setSetName]         = useState('');
  const [targetSetId, setTargetSetId] = useState(sets[0]?.id ?? '');
  const [nameError, setNameError]     = useState('');
  const [streamLog, setStreamLog]     = useState('');
  const [failReason, setFailReason]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);

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
    setStreamLog('');
    setFailReason('');
    setStep('extracting');
    try {
      const base64Data = await fileToBase64(file);

      const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY as string;
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

      const stream = await model.generateContentStream([
        { inlineData: { mimeType: 'application/pdf', data: base64Data } },
        { text: PROMPT },
      ]);

      let text = '';
      for await (const chunk of stream.stream) {
        const chunkText = chunk.text();
        text += chunkText;
        setStreamLog(text);
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      }
      text = text.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(text) as { items: GeminiResult[]; reason?: string };
      if (!parsed.items || !Array.isArray(parsed.items)) throw new Error('Unexpected response format');

      const extracted: ExtractedItem[] = parsed.items
        .filter(item => typeof item.question === 'string' && item.question.trim())
        .map(item => {
          const q = normalizeText(item.question);
          const a = normalizeText(typeof item.answer === 'string' ? item.answer : '');
          return {
            id: crypto.randomUUID(),
            question: q,
            answer:   a === q ? '' : a,
            checked: true,
            needsReview: item.needsReview === true,
          };
        });

      if (extracted.length === 0) {
        const reason = parsed.reason?.trim() || '（理由不明）';
        setError(`問題が見つかりませんでした。${reason}`);
        setFailReason(text);
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
      setFailReason(msg);
      setStep('upload');
    }
  };

  const updateItem = (id: string, patch: Partial<ExtractedItem>) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const handleCreate = () => {
    const selected = items.filter(i => i.checked);
    if (selected.length === 0) { setNameError('1件以上の問題を選択してください'); return; }
    const problems = selected.map(i => newProblem(i.question, i.answer, '', 'written', [], ''));

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
            {failReason && (
              <details className="w-full mt-1">
                <summary className="text-xs text-[#aaa] cursor-pointer select-none">詳細を見る</summary>
                <pre className="mt-1 max-h-32 overflow-y-auto text-[10px] text-[#888] bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded-[8px] p-2 font-mono whitespace-pre-wrap break-all">
                  {failReason}
                </pre>
              </details>
            )}

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
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] dark:bg-[#e0e0e0]"
                  style={{ animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }}
                />
              ))}
            </div>
            <p className="text-sm text-[#888] font-semibold">Geminiで解析中...</p>
            <p className="text-xs text-[#aaa]">{file?.name}</p>
            {streamLog && (
              <pre
                ref={logRef}
                className="w-full max-h-40 overflow-y-auto text-[10px] text-[#888] bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded-[8px] p-3 font-mono whitespace-pre-wrap break-all"
              >
                {streamLog}
              </pre>
            )}
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
                  className={`flex items-start gap-2 px-3 py-2.5 border-b border-[#f0f0f0] dark:border-[#333] last:border-b-0 ${item.needsReview ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
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
                      {item.needsReview && (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded flex-shrink-0">要確認</span>
                      )}
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
