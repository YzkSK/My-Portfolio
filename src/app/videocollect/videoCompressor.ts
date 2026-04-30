import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

export type Quality = 'original' | 'high' | 'medium' | 'low';

const QUALITY_PRESETS: Record<Quality, { label: string; args: string[]; description: string }> = {
  original: { label: 'オリジナル', args: [], description: '圧縮なし・最大サイズ（バックグラウンド保存対応）' },
  high:     { label: '高画質',    args: ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k'], description: '元の解像度を維持' },
  medium:   { label: '中画質',    args: ['-c:v', 'libx264', '-crf', '28', '-preset', 'medium', '-vf', 'scale=-2:720', '-c:a', 'aac', '-b:a', '96k'], description: '720p に縮小' },
  low:      { label: '低画質',    args: ['-c:v', 'libx264', '-crf', '33', '-preset', 'medium', '-vf', 'scale=-2:480', '-c:a', 'aac', '-b:a', '64k'], description: '480p に縮小' },
};

export const QUALITY_INFO = QUALITY_PRESETS;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

const CORE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.isLoaded()) return ffmpegInstance;

  if (!ffmpegInstance) {
    ffmpegInstance = createFFmpeg({ corePath: CORE_URL, log: true });
  }

  if (!loadPromise) {
    loadPromise = ffmpegInstance.load().catch(e => {
      loadPromise = null;
      ffmpegInstance = null;
      throw e;
    });
  }

  await loadPromise;
  return ffmpegInstance!;
}

export async function compressVideo(
  blob: Blob,
  quality: Quality,
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  if (quality === 'original') {
    onProgress(1);
    return blob;
  }

  // -1 = ffmpeg ロード中
  onProgress(-1);
  const ff = await getFFmpeg();

  ff.setProgress(({ ratio }) => {
    onProgress(Math.max(0, Math.min(1, ratio)));
  });

  const inputName  = 'input.mp4';
  const outputName = 'output.mp4';

  ff.FS('writeFile', inputName, await fetchFile(blob));

  const args = QUALITY_PRESETS[quality].args;
  await ff.run('-i', inputName, ...args, '-movflags', '+faststart', outputName);

  const data = ff.FS('readFile', outputName);

  ff.FS('unlink', inputName);
  ff.FS('unlink', outputName);

  return new Blob([data.buffer], { type: 'video/mp4' });
}

export function estimatedSizeRatio(quality: Quality): number {
  return { original: 1.0, high: 0.7, medium: 0.4, low: 0.2 }[quality];
}
