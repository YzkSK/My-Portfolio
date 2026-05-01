import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/shared/geminiClient', () => ({
  streamGenerate: vi.fn(),
  getGenerativeModel: vi.fn(),
}));

import { generateTranscription } from '@/app/transcribe/transcriptionService';
import { streamGenerate } from '@/app/shared/geminiClient';

describe('transcriptionService.generateTranscription', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses JSON wrapped between markers', async () => {
    const fakeJson = JSON.stringify({ text: 'hello', paragraphs: [], keywords: ['a'], summary: 's', confidence: 0.9 });
    (streamGenerate as any).mockResolvedValue(`some noise <<<JSON>>>${fakeJson}<<<END>>> more`);

    const res = await generateTranscription('file-123', 'ja');
    expect(res).toHaveProperty('text', 'hello');
    expect(res).toHaveProperty('confidence', 0.9);
  });

  it('returns raw text object when parsing fails', async () => {
    (streamGenerate as any).mockResolvedValue('just plain text without json');

    const res = await generateTranscription(null, 'en');
    expect(res).toHaveProperty('text');
    expect(typeof res.text).toBe('string');
    expect(res.paragraphs).toEqual([]);
  });
});
