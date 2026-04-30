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

describe('compressVideo — worker quality', () => {
  it('worker から error メッセージ受信時に reject し onLog を呼ぶ', async () => {
    class MockWorker {
      onmessage: ((event: MessageEvent<{ type: 'error'; message: string; logs: string[] }>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn(() => {
        this.onmessage?.({
          data: {
            type: 'error',
            message: 'worker failed',
            logs: ['line1', 'line2'],
          },
        } as MessageEvent<{ type: 'error'; message: string; logs: string[] }>);
      });
    }

    vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);

    const onLog = vi.fn();
    const blob = new Blob(['dummy'], { type: 'video/mp4' });
    await expect(compressVideo(blob, 'high', vi.fn(), onLog)).rejects.toThrow('worker failed');
    expect(onLog).toHaveBeenCalledWith('line1');
    expect(onLog).toHaveBeenCalledWith('line2');
  });

  it('worker onerror 発火時に reject する', async () => {
    class MockWorker {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn(() => {
        this.onerror?.(new Event('error'));
      });
    }

    vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);

    const blob = new Blob(['dummy'], { type: 'video/mp4' });
    await expect(compressVideo(blob, 'medium', vi.fn())).rejects.toBeInstanceOf(Event);
  });
});
