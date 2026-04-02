// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCachedImageUrl, clearImageCache } from '@/app/quiz/imageCache';

// Cache API のモック
const mockCacheMatch = vi.fn();
const mockCachePut = vi.fn();
const mockCacheDelete = vi.fn();
const mockCachesOpen = vi.fn(() =>
  Promise.resolve({
    match: mockCacheMatch,
    put: mockCachePut,
    delete: mockCacheDelete,
  }),
);

// URL.createObjectURL / revokeObjectURL のモック
const mockCreateObjectURL = vi.fn((blob: Blob) => `blob:mock/${(blob as unknown as { name?: string }).name ?? 'data'}`);
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  clearImageCache();
  vi.clearAllMocks();

  Object.defineProperty(window, 'caches', {
    value: { open: mockCachesOpen },
    writable: true,
    configurable: true,
  });

  URL.createObjectURL = mockCreateObjectURL;
  URL.revokeObjectURL = mockRevokeObjectURL;
});

const makeBlob = () => new Blob(['data'], { type: 'image/png' });
const makeResponse = (ok = true, status = 200) => ({
  ok,
  status,
  clone: vi.fn(function (this: unknown) { return this; }),
  blob: vi.fn(() => Promise.resolve(makeBlob())),
});

describe('getCachedImageUrl (ユニットテスト)', () => {
  it('メモリキャッシュヒット → fetch せずに blob URL を返す', async () => {
    const blob = makeBlob();
    const response = { ...makeResponse(), blob: () => Promise.resolve(blob) };
    mockCacheMatch.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue(response);

    const first = await getCachedImageUrl('https://example.com/img.png');
    const second = await getCachedImageUrl('https://example.com/img.png');

    expect(first).toBe(second);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('Cache API ヒット → fetch せずに blob URL を返す', async () => {
    const blob = makeBlob();
    mockCacheMatch.mockResolvedValue({ blob: () => Promise.resolve(blob) });
    global.fetch = vi.fn();

    await getCachedImageUrl('https://example.com/cache-hit.png');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
  });

  it('キャッシュミス → fetch して blob URL を返す', async () => {
    const blob = makeBlob();
    const response = { ...makeResponse(), blob: () => Promise.resolve(blob) };
    mockCacheMatch.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await getCachedImageUrl('https://example.com/miss.png');

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/miss.png');
    expect(result).toBeTruthy();
    expect(mockCachePut).toHaveBeenCalled();
  });

  it('fetch 失敗した URL は failedUrls に追加され再取得をスキップしない（再試行する）', async () => {
    mockCacheMatch.mockResolvedValue(null);
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(getCachedImageUrl('https://example.com/fail.png')).rejects.toThrow();

    // 再度呼ぶと fetch が再試行される（失敗URLでも再試行する）
    await expect(getCachedImageUrl('https://example.com/fail.png')).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('並列呼び出しは同一 Promise を共有し fetch は1回だけ呼ばれる', async () => {
    const blob = makeBlob();
    const response = { ...makeResponse(), blob: () => Promise.resolve(blob) };
    mockCacheMatch.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue(response);

    const [r1, r2, r3] = await Promise.all([
      getCachedImageUrl('https://example.com/parallel.png'),
      getCachedImageUrl('https://example.com/parallel.png'),
      getCachedImageUrl('https://example.com/parallel.png'),
    ]);

    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('clearImageCache (ユニットテスト)', () => {
  it('blob URL を revoke してメモリキャッシュをクリアする', async () => {
    const blob = makeBlob();
    const response = { ...makeResponse(), blob: () => Promise.resolve(blob) };
    mockCacheMatch.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue(response);

    await getCachedImageUrl('https://example.com/clear.png');
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);

    clearImageCache();
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);

    // クリア後は再び fetch が走る
    const response2 = { ...makeResponse(), blob: () => Promise.resolve(blob) };
    global.fetch = vi.fn().mockResolvedValue(response2);
    await getCachedImageUrl('https://example.com/clear.png');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
