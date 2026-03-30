import { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { type Problem, type ProblemSet, newProblem } from '../constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type Step = 'upload' | 'extracting' | 'review' | 'verify' | 'fix';
type ImportMode = 'new' | 'existing';

type ExtractedItem = {
  id: string;
  question: string;
  answer: string;
  checked: boolean;
};

type GeminiResult = {
  question: string;
  answer: string;
};

type Props = {
  sets: ProblemSet[];
  onImportNew: (problems: Problem[], title: string) => void;
  onImportExisting: (problems: Problem[], setId: string) => void;
  onClose: () => void;
  addToast: (msg: string) => void;
};

const PROMPT = `あなたはPDFから問題と答えを一字一句正確に抽出する専門ツールです。
創作・推測・補完は厳禁です。PDFに書かれている文字のみを使用してください。

## 出力形式
純粋なJSONのみを返してください（\`\`\`json などのマークダウン記法は使わない）：
{"items":[{"question":"問題文","answer":"答え（不明は空文字）"}],"reason":"問題が見つからなかった場合のみ日本語で理由を記載、それ以外は空文字"}

## 抽出手順（必ずこの順で実行）
1. PDFを最初から最後まで通読し、ページ構成・問題の並び・解答ページの有無を把握する
2. 問題番号・レイアウト・区切り線を手がかりに、各問題の範囲を確定する
3. 各問題の question と answer を、PDFの原文から1文字ずつ丁寧に写し取る
4. すべて写し取ったあと、PDFを再度見て各フィールドを1文字ずつ照合し、誤りがあれば修正する
5. JSONを出力する（JSONは1回だけ出力すること）

## 抽出ルール
- 番号付きの問題（○×・穴埋め・記述など形式問わず）はすべて抽出する
- PDFに書かれていない文字を question・answer に入れてはいけない
- answer が question と同じ内容になってはいけない
- 答えが明記されていない問題は answer を "" にする
- 各問題は独立して扱い、他の問題の文章・答えを混入させてはいけない
- 問題と答えの対応は番号・位置関係から厳密に1対1で判断する

## 別ページ解答の照合ルール
答えが別ページ（巻末解答など）にある場合、以下をすべて満たす場合のみ answer に設定する：
- 問題と解答が同じ章・単元・見出しに属している
- 問題番号と解答番号が完全に一致している
- 文字が明瞭で読み取りに不安がない
上記を1つでも満たさない場合は answer を "" にする

## 書式ルール
- 問題番号・記号は question に含めない（例：「1.」「(1)」「①」は除く）
- ふりがな（ルビ）は除外する（例：「漢字（かんじ）」→「漢字」）
- 図の位置を示す語は削除する（例：「左図のように」→「図のように」）
- それ以外の文言は一切書き換えない
- 問題が見つからない場合は items を [] にして reason に理由を記載する`;

export const normalizeText = (text: string): string =>
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
  const [verifyIndex, setVerifyIndex]   = useState(0);
  const [verifyFlags, setVerifyFlags]   = useState<Set<string>>(new Set());
  const [swipeDelta, setSwipeDelta]     = useState(0);
  const [isAnimating, setIsAnimating]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const dragStartX = useRef<number | null>(null);

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

  const startVerify = () => {
    setVerifyIndex(0);
    setVerifyFlags(new Set());
    setSwipeDelta(0);
    setIsAnimating(false);
    setStep('verify');
  };

  const handleVerifyDecision = (ok: boolean) => {
    if (isAnimating) return;
    const currentItem = items[verifyIndex];
    const exitDelta = ok ? 400 : -400;

    setSwipeDelta(exitDelta);
    setIsAnimating(true);

    setTimeout(() => {
      const newFlags = ok ? verifyFlags : new Set([...verifyFlags, currentItem.id]);

      const nextIndex = verifyIndex + 1;
      setVerifyFlags(newFlags);
      setSwipeDelta(0);
      setIsAnimating(false);

      if (nextIndex >= items.length) {
        if (newFlags.size > 0) {
          setStep('fix');
        } else {
          addToast('すべて確認しました');
          setStep('review');
        }
      } else {
        setVerifyIndex(nextIndex);
      }
    }, 200);
  };

  const handleDragStart = (clientX: number) => {
    if (isAnimating) return;
    dragStartX.current = clientX;
  };

  const handleDragMove = (clientX: number) => {
    if (dragStartX.current === null || isAnimating) return;
    setSwipeDelta(clientX - dragStartX.current);
  };

  const handleDragEnd = (clientX: number) => {
    if (dragStartX.current === null || isAnimating) return;
    const delta = clientX - dragStartX.current;
    dragStartX.current = null;
    if (delta > 80) handleVerifyDecision(true);
    else if (delta < -80) handleVerifyDecision(false);
    else setSwipeDelta(0);
  };

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
              <div className="flex items-center gap-3">
                <button
                  className="text-xs text-[#888] font-bold hover:text-[#555]"
                  onClick={startVerify}
                  disabled={items.length === 0}
                >
                  カードで確認
                </button>
                <button
                  className="text-xs text-blue-500 font-bold"
                  onClick={() => setItems(prev => prev.map(it => ({ ...it, checked: !allChecked })))}
                >
                  {allChecked ? 'すべて解除' : 'すべて選択'}
                </button>
              </div>
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
            <p className="text-[11px] text-[#aaa] text-center mt-2 leading-relaxed">
              AIによる抽出のため、問題文・答えが正確でない場合があります。「カードで確認」から内容をご確認ください。
            </p>
          </>
        )}
        {/* ── Step: verify ── */}
        {step === 'verify' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <button
                className="text-sm text-[#888] hover:text-[#555]"
                onClick={() => { setSwipeDelta(0); dragStartX.current = null; setStep('review'); }}
              >
                ← 戻る
              </button>
              <span className="text-sm font-semibold text-[#888]">
                {verifyIndex + 1} / {items.length}
              </span>
            </div>

            <div className="w-full h-1.5 bg-[#f0f0f0] dark:bg-[#333] rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-[#1a1a1a] dark:bg-[#e0e0e0] rounded-full"
                style={{ width: `${(verifyIndex / items.length) * 100}%`, transition: 'width 0.2s' }}
              />
            </div>

            <div
              className="select-none cursor-grab active:cursor-grabbing"
              onMouseDown={e => handleDragStart(e.clientX)}
              onMouseMove={e => { if (dragStartX.current !== null) handleDragMove(e.clientX); }}
              onMouseUp={e => handleDragEnd(e.clientX)}
              onMouseLeave={() => { if (dragStartX.current !== null) { dragStartX.current = null; setSwipeDelta(0); } }}
              onTouchStart={e => handleDragStart(e.touches[0].clientX)}
              onTouchMove={e => { e.preventDefault(); handleDragMove(e.touches[0].clientX); }}
              onTouchEnd={e => handleDragEnd(e.changedTouches[0].clientX)}
            >
              <div
                className="border border-[#e8e8e8] dark:border-[#333] rounded-[12px] p-5 min-h-[160px] flex flex-col gap-3"
                style={{
                  transform: `translateX(${swipeDelta}px) rotate(${swipeDelta * 0.02}deg)`,
                  opacity: Math.max(0.3, 1 - Math.abs(swipeDelta) / 400),
                  transition: isAnimating ? 'transform 0.2s, opacity 0.2s' : 'none',
                  backgroundColor: swipeDelta > 30
                    ? 'rgba(34,197,94,0.07)'
                    : swipeDelta < -30
                      ? 'rgba(239,68,68,0.07)'
                      : undefined,
                }}
              >
                <div>
                  <p className="text-[11px] text-[#aaa] font-bold mb-1">問題</p>
                  <p className="text-[15px] font-semibold text-[#1a1a1a] dark:text-[#e0e0e0] leading-relaxed">
                    {items[verifyIndex]?.question || '（問題文なし）'}
                  </p>
                </div>
                <div className="border-t border-[#f0f0f0] dark:border-[#333] pt-3">
                  <p className="text-[11px] text-[#aaa] font-bold mb-1">答え</p>
                  <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
                    {items[verifyIndex]?.answer || '（答えなし）'}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-center text-[#bbb] mt-2 mb-3">
              スワイプまたはボタンで操作
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-red-300 text-red-500 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() => handleVerifyDecision(false)}
                disabled={isAnimating}
              >
                ← 要修正
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-green-300 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30"
                onClick={() => handleVerifyDecision(true)}
                disabled={isAnimating}
              >
                OK →
              </Button>
            </div>
          </>
        )}

        {/* ── Step: fix ── */}
        {step === 'fix' && (
          <>
            <p className="text-sm font-semibold text-[#888] mb-3">
              要修正の問題（{verifyFlags.size}件）
            </p>

            <div className="border border-[#e8e8e8] dark:border-[#333] rounded-[10px] overflow-hidden max-h-[45vh] overflow-y-auto mb-4">
              {items
                .filter(item => verifyFlags.has(item.id))
                .map(item => {
                  const originalIdx = items.findIndex(i => i.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className="px-3 py-3 border-b border-[#f0f0f0] dark:border-[#333] last:border-b-0"
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[10px] text-[#aaa] font-bold w-5 flex-shrink-0">{originalIdx + 1}</span>
                        <input
                          className="flex-1 text-[13px] border border-[#e8e8e8] dark:border-[#444] rounded-[6px] px-2 py-1 font-semibold bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e0e0e0] outline-none focus:border-[#999]"
                          value={item.question}
                          onChange={e => updateItem(item.id, { question: e.target.value })}
                          placeholder="問題文"
                        />
                      </div>
                      <div className="ml-[26px]">
                        <input
                          className="w-full text-[13px] border border-[#e8e8e8] dark:border-[#444] rounded-[6px] px-2 py-1 text-[#555] dark:text-[#aaa] bg-white dark:bg-[#1a1a1a] outline-none focus:border-[#999]"
                          value={item.answer}
                          onChange={e => updateItem(item.id, { answer: e.target.value })}
                          placeholder="答えなし"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('verify')}>
                ← 戻る
              </Button>
              <Button variant="default" className="flex-[2]" onClick={() => setStep('review')}>
                確認完了
              </Button>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
};
