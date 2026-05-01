import { describe, it, expect, vi } from 'vitest';
import { buildTranscriptionExportData } from '@/app/transcribe/exportUtils';
import { type Transcription } from '@/app/transcribe/constants';

describe('buildTranscriptionExportData', () => {
  it('wraps transcription and text with export metadata', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));

    const transcription: Transcription = {
      transcriptionId: 't-1',
      fileName: 'sample.mp4',
      text: 'hello',
    };

    const result = buildTranscriptionExportData(transcription, 'hello world');

    expect(result).toEqual({
      exportVersion: 1,
      exportedAt: new Date('2026-05-01T00:00:00.000Z').getTime(),
      transcription,
      text: 'hello world',
    });

    vi.useRealTimers();
  });
});
