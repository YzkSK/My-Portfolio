import { describe, it, expect, vi, afterEach } from 'vitest';
import { isWebCodecsSupported, compressVideo } from '@/app/videocollect/videoCompressor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isWebCodecsSupported', () => {
  it('VideoEncoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('VideoDecoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', {});
    vi.stubGlobal('VideoDecoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('AudioEncoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', {});
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('AudioDecoder が undefined の場合 false を返す', async () => {
    vi.stubGlobal('VideoEncoder', {});
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', {});
    vi.stubGlobal('AudioDecoder', undefined);
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('isConfigSupported が supported: false を返す場合 false', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: false }),
    });
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', {});
    vi.stubGlobal('AudioDecoder', {});
    expect(await isWebCodecsSupported()).toBe(false);
  });

  it('isConfigSupported が supported: true を返す場合 true', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
    });
    vi.stubGlobal('VideoDecoder', {});
    vi.stubGlobal('AudioEncoder', {});
    vi.stubGlobal('AudioDecoder', {});
    expect(await isWebCodecsSupported()).toBe(true);
  });
});

describe('compressVideo — original quality', () => {
  it('quality が original のとき blob をそのまま返す', async () => {
    const blob = new Blob(['dummy'], { type: 'video/mp4' });
    const onProgress = vi.fn();
    const result = await compressVideo(blob, 'original', onProgress);
    expect(result).toBe(blob);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('quality が original のとき Worker を生成しない', async () => {
    const MockWorker = vi.fn();
    vi.stubGlobal('Worker', MockWorker);
    const blob = new Blob(['dummy'], { type: 'video/mp4' });
    await compressVideo(blob, 'original', vi.fn());
    expect(MockWorker).not.toHaveBeenCalled();
  });
});
