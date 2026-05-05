export type TranscriptionParagraph = {
  id: string;
  text: string;
  startTime?: number; // seconds
  endTime?: number; // seconds
  speaker?: string | null;
};

export type Transcription = {
  transcriptionId: string;
  fileId?: string;
  fileName: string;
  language?: string;
  text?: string;
  paragraphs?: TranscriptionParagraph[];
  keywords?: string[];
  summary?: string;
  confidence?: number;
  createdAt?: number;
  updatedAt?: number;
  processedAt?: number;
};

export const firestorePaths = {
  transcribeData: (uid: string) => `users/${uid}/transcribe/data`,
} as const;

export function parseTranscription(raw: any): Transcription {
  return {
    transcriptionId: raw?.transcriptionId ?? raw?.id ?? String(Date.now()),
    fileId: raw?.fileId,
    fileName: raw?.fileName ?? raw?.name ?? 'unknown',
    language: raw?.language,
    text: raw?.text ?? '',
    paragraphs: Array.isArray(raw?.paragraphs) ? raw.paragraphs : [],
    keywords: Array.isArray(raw?.keywords) ? raw.keywords : [],
    summary: raw?.summary,
    confidence: typeof raw?.confidence === 'number' ? raw.confidence : undefined,
    createdAt: raw?.createdAt ?? Date.now(),
    updatedAt: raw?.updatedAt ?? Date.now(),
    processedAt: raw?.processedAt,
  };
}

export const TRANSCRIBE_ERROR_CODES = {
  NO_API_KEY: 'E101',
  INVALID_FILE_TYPE: 'E102',
  TOO_LARGE: 'E103',
  API_ERROR: 'E104',
  BAD_RESPONSE: 'E105',
} as const;

export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',       // mp3
  'audio/mp4',        // m4a
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/webm',
];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

export type TranscribeSettingsData = {
  defaultLanguage: 'auto' | 'ja' | 'en' | 'zh';
  autoDeleteDays: number | null; // null = disabled
};

export const DEFAULT_TRANSCRIBE_SETTINGS: TranscribeSettingsData = {
  defaultLanguage: 'auto',
  autoDeleteDays: null,
};

export const parseTranscribeSettings = (raw: any): TranscribeSettingsData => {
  const defaultLanguage = ['ja', 'en', 'zh'].includes(raw?.defaultLanguage) ? raw.defaultLanguage : 'auto';
  const autoDeleteDays = typeof raw?.autoDeleteDays === 'number' ? raw.autoDeleteDays : null;
  return { defaultLanguage, autoDeleteDays };
};
