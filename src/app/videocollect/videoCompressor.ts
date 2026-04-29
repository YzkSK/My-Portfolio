import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

export type Quality = 'original' | 'high' | 'medium' | 'low';

export const QUALITY_INFO: Record<Quality, { label: string; description: string }> = {
  original: { label: 'オリジナル', description: '圧縮なし・元のファイルをそのまま保存' },
  high:     { label: '高画質',     description: '元の解像度を維持して再エンコード' },
  medium:   { label: '中画質',     description: '720p に縮小して再エンコード' },
  low:      { label: '低画質',     description: '480p に縮小して再エンコード' },
};

const QUALITY_ARGS: Record<Exclude<Quality, 'original'>, string[]> = {
  high:   ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k'],
  medium: ['-c:v', 'libx264', '-crf', '28', '-preset', 'medium', '-vf', 'scale=-2:720', '-c:a', 'aac', '-b:a', '96k'],
  low:    ['-c:v', 'libx264', '-crf', '33', '-preset', 'medium', '-vf', 'scale=-2:480', '-c:a', 'aac', '-b:a', '64k'],
};

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

const CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.isLoaded()) return ffmpegInstance;
  if (!ffmpegInstance) {
    ffmpegInstance = createFFmpeg({ corePath: CORE_URL, log: false });
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
  quality: Exclude<Quality, 'original'>,
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  onProgress(-1);
  const ff = await getFFmpeg();
  ff.setProgress(({ ratio }) => onProgress(Math.max(0, Math.min(1, ratio))));

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';
  ff.FS('writeFile', inputName, await fetchFile(blob));
  await ff.run('-i', inputName, ...QUALITY_ARGS[quality], '-movflags', '+faststart', outputName);
  const data = ff.FS('readFile', outputName);
  ff.FS('unlink', inputName);
  ff.FS('unlink', outputName);

  return new Blob([data.buffer], { type: 'video/mp4' });
}

export function estimatedSizeRatio(quality: Quality): number {
  return { original: 1, high: 0.7, medium: 0.4, low: 0.2 }[quality];
}
