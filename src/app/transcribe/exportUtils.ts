import type { Transcription } from './constants';

export type TranscriptionExportData = {
  exportVersion: 1;
  exportedAt: number;
  transcription: Transcription;
  text: string;
};

export const buildTranscriptionExportData = (
  transcription: Transcription,
  text: string,
): TranscriptionExportData => ({
  exportVersion: 1,
  exportedAt: Date.now(),
  transcription,
  text,
});
