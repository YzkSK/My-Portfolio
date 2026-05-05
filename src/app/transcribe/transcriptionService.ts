import { SUPPORTED_VIDEO_TYPES, MAX_UPLOAD_BYTES, TRANSCRIBE_ERROR_CODES } from './constants';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const TRANSCRIBE_MODEL = 'gemini-3.1-flash-lite-preview';

export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, error: TRANSCRIBE_ERROR_CODES.INVALID_FILE_TYPE };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: TRANSCRIBE_ERROR_CODES.TOO_LARGE };
  }
  return { valid: true };
}

type FileRef = { uri: string; name: string; mimeType: string };

/** Gemini Files API（resumable upload）で動画をアップロードし、ファイル参照を返す */
export async function uploadVideoToGeminiFiles(file: File): Promise<string> {
  const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY as string;
  if (!apiKey) throw new Error(TRANSCRIBE_ERROR_CODES.NO_API_KEY);

  // Step 1: セッション開始
  const startRes = await fetch(
    `${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Type': file.type,
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
    }
  );

  if (!startRes.ok) {
    const text = await startRes.text();
    console.error('[Transcribe] Files API upload start failed', startRes.status, text);
    throw new Error(TRANSCRIBE_ERROR_CODES.API_ERROR);
  }

  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error(TRANSCRIBE_ERROR_CODES.BAD_RESPONSE);

  // Step 2: ファイル送信
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    console.error('[Transcribe] Files API upload failed', uploadRes.status, text);
    throw new Error(TRANSCRIBE_ERROR_CODES.API_ERROR);
  }

  const json = await uploadRes.json();
  const uri: string | undefined = json?.file?.uri;
  const name: string | undefined = json?.file?.name;
  if (!uri || !name) throw new Error(TRANSCRIBE_ERROR_CODES.BAD_RESPONSE);

  return JSON.stringify({ uri, name, mimeType: file.type } satisfies FileRef);
}

/** ファイルが ACTIVE になるまでポーリング（最大60秒） */
async function waitForFileActive(apiKey: string, fileName: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!res.ok) return; // エラーでもそのまま続行
    const json = await res.json();
    const state: string = json?.file?.state ?? '';
    if (state === 'ACTIVE') return;
    if (state === 'FAILED') throw new Error(TRANSCRIBE_ERROR_CODES.API_ERROR);
    await new Promise(r => setTimeout(r, 2_000));
  }
}

/** Gemini で動画を文字起こしし、結果オブジェクトを返す */
export async function generateTranscription(fileRefJson: string, language?: string): Promise<{
  text: string;
  paragraphs: { id: string; text: string; startTime?: number; endTime?: number }[];
  keywords: string[];
  summary: string;
  confidence: number;
  language: string;
}> {
  const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY as string;
  if (!apiKey) throw new Error(TRANSCRIBE_ERROR_CODES.NO_API_KEY);

  const { uri, name, mimeType }: FileRef = JSON.parse(fileRefJson);

  await waitForFileActive(apiKey, name);

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: TRANSCRIBE_MODEL });

  const langNote = language ? `言語: ${language}` : '言語は動画の音声から自動検出してください。';

  const prompt =
    `以下の動画を文字起こしし、必ず次のJSON形式のみで出力してください（前後に説明文は不要）:\n\n` +
    `{\n` +
    `  "text": "全文テキスト",\n` +
    `  "paragraphs": [{"id":"1","text":"段落テキスト","startTime":0.0,"endTime":10.0}],\n` +
    `  "keywords": ["キーワード1","キーワード2"],\n` +
    `  "summary": "200語程度の要約",\n` +
    `  "confidence": 0.95,\n` +
    `  "language": "ja"\n` +
    `}\n\n` +
    langNote;

  const result = await model.generateContent([
    { text: prompt },
    { fileData: { mimeType, fileUri: uri } },
  ]);

  const raw = result.response.text().trim();

  // コードブロックまたは生JSONを抽出
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : raw;

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    console.error('[Transcribe] JSON parse failed', err, raw);
    return {
      text: raw,
      paragraphs: [],
      keywords: [],
      summary: '',
      confidence: 0,
      language: language ?? 'ja',
    };
  }
}
