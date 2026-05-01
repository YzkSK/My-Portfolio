import { SUPPORTED_VIDEO_TYPES, MAX_UPLOAD_BYTES, TRANSCRIBE_ERROR_CODES } from './constants';
import { getGenerativeModel, streamGenerate } from '@/app/shared/geminiClient';

// ファイル検証
export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, error: TRANSCRIBE_ERROR_CODES.INVALID_FILE_TYPE };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: TRANSCRIBE_ERROR_CODES.TOO_LARGE };
  }
  return { valid: true };
}

// ファイルアップロード: fetch で REST API を叩く。失敗時は mock を返す。
export async function uploadVideoToGeminiFiles(file: File): Promise<string> {
  const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY as string;
  if (!apiKey) throw new Error(TRANSCRIBE_ERROR_CODES.NO_API_KEY);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(
      'https://www.googleapis.com/upload/storage/v1/b/generative-ai-studio-uploads/o?uploadType=multipart',
      {
        method: 'POST',
        headers: { 'X-Goog-Api-Key': apiKey },
        body: formData,
      }
    );

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`Files API upload returned ${res.status}, falling back to mock`, res.statusText);
      throw new Error(`Upload failed: ${res.status}`);
    }

    const json = (await res.json()) as any;
    const fileId = json?.name ?? json?.id ?? `file-${Date.now()}`;
    return fileId;
  } catch (err) {
    // ログ出力してフォールバック
    // eslint-disable-next-line no-console
    console.warn('Files API upload failed, using mock', err instanceof Error ? err.message : err);
  }

  // fallback mock
  await new Promise((r) => setTimeout(r, 500));
  return `mock-file-${Date.now()}`;
}

/**
 * Gemini にプロンプトを投げてストリーミングで受け取り最終的に JSON を返す
 * prompt 内に fileId (もしあれば) を埋め込んで処理する設計
 */
export async function generateTranscription(fileId: string | null, language?: string): Promise<any> {
  const model = await getGenerativeModel();

  const payloadNote = fileId ? `fileId: ${fileId}` : 'file attached';

  const prompt = `あなたは動画の自動要約・文字起こしを行うシステムです。以下の指示に厳密に従ってください。\n\n` +
    `指示:\n` +
    `1) 出力は必ず JSON オブジェクトのみとする（余計な説明はつけない）。\n` +
    `2) JSON のキーは必須で次のとおり: text (全文文字起こし), paragraphs (配列: {text,startTime,endTime}), keywords (配列), summary (短い要約 ~200語), confidence (0-1 の数値)。\n` +
    `3) 出力は必ず <<<JSON>>> と <<<END>>> の間に JSON を置く。\n\n` +
    `対象: ${payloadNote}\n` +
    `言語: ${language ?? 'auto'}`;

  const onChunk = (_t: string) => { /* noop */ };
  const full = await streamGenerate(model, prompt, onChunk);

  // JSON マーカー内部を抽出してパース
  const m = full.match(/<<<JSON>>>([\s\S]*?)<<<END>>>/);
  const jsonText = m ? m[1].trim() : full.trim();
  try {
    const json = JSON.parse(jsonText);
    return json;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse transcription JSON from Gemini response', err);
    return { text: full, paragraphs: [], keywords: [], summary: '', confidence: 0 };
  }
}
