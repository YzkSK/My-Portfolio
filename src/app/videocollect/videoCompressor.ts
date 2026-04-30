// src/app/videocollect/videoCompressor.ts

export type Quality = 'original' | 'high' | 'medium' | 'low';

const QUALITY_PRESETS: Record<Quality, { label: string; description: string }> = {
  original: { label: 'オリジナル', description: '圧縮なし・最大サイズ（バックグラウンド保存対応）' },
  high:     { label: '高画質',    description: '元の解像度を維持' },
  medium:   { label: '中画質',    description: '720p に縮小' },
  low:      { label: '低画質',    description: '480p に縮小' },
};

export const QUALITY_INFO = QUALITY_PRESETS;

export function estimatedSizeRatio(quality: Quality): number {
  return { original: 1.0, high: 0.7, medium: 0.4, low: 0.2 }[quality];
}

// ─── Support check ────────────────────────────────────────────────────────────

export async function isWebCodecsSupported(): Promise<boolean> {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoDecoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof AudioDecoder === 'undefined'
  ) return false;

  const result = await VideoEncoder.isConfigSupported({
    codec: 'avc1.42001f',
    width: 1280,
    height: 720,
    bitrate: 2_000_000,
    framerate: 30,
  });
  return result.supported ?? false;
}

// ─── Worker message types (shared with Worker) ───────────────────────────────

type WorkerOutMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string; logs: string[] };

// ─── Compress ─────────────────────────────────────────────────────────────────

export async function compressVideo(
  blob: Blob,
  quality: Quality,
  onProgress: (ratio: number) => void,
  onLog?: (line: string) => void,
): Promise<Blob> {
  if (quality === 'original') {
    onProgress(1);
    return blob;
  }

  onProgress(0);

  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(
      new URL('./videoCompressorWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress(Math.max(0, Math.min(1, msg.ratio)));
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.blob);
      } else if (msg.type === 'error') {
        worker.terminate();
        msg.logs.forEach(line => onLog?.(line));
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };

    worker.postMessage({ blob, quality });
  });
}
