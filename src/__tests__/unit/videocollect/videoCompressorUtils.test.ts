import { describe, it, expect } from 'vitest';
import { scaleOutput } from '@/app/videocollect/videoCompressorUtils';

describe('scaleOutput', () => {
  it('1920×1080 を medium (1280×720 上限) に縮小', () => {
    const result = scaleOutput(1920, 1080, 1280, 720);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  it('1280×720 は medium 上限と同じなので変化しない', () => {
    const result = scaleOutput(1280, 720, 1280, 720);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  it('640×360 は medium 上限より小さいので変化しない（スケールアップしない）', () => {
    const result = scaleOutput(640, 360, 1280, 720);
    expect(result).toEqual({ width: 640, height: 360 });
  });

  it('縦動画 1080×1920 を medium (1280×720 上限) に縮小 — 高さが制限', () => {
    // scale = min(1280/1080, 720/1920, 1.0) = min(1.185, 0.375, 1.0) = 0.375
    // w = round(1080 * 0.375 / 2) * 2 = round(202.5) * 2 = 203 * 2 = 406
    // h = round(1920 * 0.375 / 2) * 2 = round(360) * 2 = 360 * 2 = 720
    const result = scaleOutput(1080, 1920, 1280, 720);
    expect(result.height).toBe(720);
    expect(result.width % 2).toBe(0); // 偶数
  });

  it('出力は常に偶数 — 奇数解像度の入力', () => {
    // 1281×721 を medium 上限へ
    const result = scaleOutput(1281, 721, 1280, 720);
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
  });

  it('high (maxWidth=Infinity, maxHeight=Infinity) は変化しない', () => {
    const result = scaleOutput(3840, 2160, Infinity, Infinity);
    expect(result).toEqual({ width: 3840, height: 2160 });
  });
});
