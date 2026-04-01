import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateMemoExplanation } from '@/app/quiz/memoGenerator';
import { MemoGenError } from '@/app/quiz/constants';

const { mockGenerateContentStream, mockGetGenerativeModel, MockGoogleGenerativeAI } = vi.hoisted(() => {
  const mockGenerateContentStream = vi.fn();
  const mockGetGenerativeModel = vi.fn(() => ({ generateContentStream: mockGenerateContentStream }));
  class MockGoogleGenerativeAI {
    getGenerativeModel = mockGetGenerativeModel;
  }
  return { mockGenerateContentStream, mockGetGenerativeModel, MockGoogleGenerativeAI };
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: MockGoogleGenerativeAI,
}));

afterEach(() => vi.clearAllMocks());

describe('generateMemoExplanation (結合テスト)', () => {
  it('API キーがない場合は MemoGenError(no_api_key) をスローする', async () => {
    // VITE_GOOGLE_GEMINI_API_KEY を未設定にする
    vi.stubEnv('VITE_GOOGLE_GEMINI_API_KEY', '');
    await expect(generateMemoExplanation('問題', '答え', () => {})).rejects.toBeInstanceOf(MemoGenError);
    const err = await generateMemoExplanation('問題', '答え', () => {}).catch(e => e);
    expect((err as MemoGenError).reason).toBe('no_api_key');
    vi.unstubAllEnvs();
  });

  it('ストリーミング成功時に onChunk へ累積テキストが渡される', async () => {
    vi.stubEnv('VITE_GOOGLE_GEMINI_API_KEY', 'test-key');

    async function* makeStream() {
      yield { text: () => 'こんにちは' };
      yield { text: () => '、世界！' };
    }
    mockGenerateContentStream.mockResolvedValue({ stream: makeStream() });

    const chunks: string[] = [];
    await generateMemoExplanation('問題', '答え', (text) => chunks.push(text));

    expect(chunks).toEqual(['こんにちは', 'こんにちは、世界！']);
    vi.unstubAllEnvs();
  });

  it('ストリーミング成功時に getGenerativeModel が呼ばれる', async () => {
    vi.stubEnv('VITE_GOOGLE_GEMINI_API_KEY', 'test-key');

    async function* makeStream() {
      yield { text: () => 'テスト' };
    }
    mockGenerateContentStream.mockResolvedValue({ stream: makeStream() });

    await generateMemoExplanation('Q', 'A', () => {});
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
