import { compressVideo, type Quality } from './videoCompressor';
import { saveOfflineVideo } from './offlineStorage';
import { VC_ERROR_CODES } from './constants';

export type DownloadPhase =
  | 'fetching'
  | 'loading-ffmpeg'
  | 'compressing'
  | 'saving'
  | 'done'
  | 'error';

export type DownloadTask = {
  fileId: string;
  fileName: string;
  phase: DownloadPhase;
  progress: number;
  errorCode?: string;
};

const tasks = new Map<string, DownloadTask>();
const abortControllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(fn => fn());
}

export function subscribeTasks(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTasks(): ReadonlyMap<string, DownloadTask> {
  return tasks;
}

export function isDownloading(fileId: string): boolean {
  const t = tasks.get(fileId);
  return !!t && t.phase !== 'done' && t.phase !== 'error';
}

export function startDownload(opts: {
  fileId: string;
  fileName: string;
  proxyUrl: string;
  accessToken: string;
  quality: Quality;
}): void {
  if (tasks.has(opts.fileId)) return;
  const controller = new AbortController();
  abortControllers.set(opts.fileId, controller);
  tasks.set(opts.fileId, { fileId: opts.fileId, fileName: opts.fileName, phase: 'fetching', progress: 0 });
  notify();
  run({ ...opts, signal: controller.signal }).catch(() => {/* handled inside */});
}

export function cancelDownload(fileId: string): void {
  abortControllers.get(fileId)?.abort();
  abortControllers.delete(fileId);
  tasks.delete(fileId);
  notify();
}

function patch(fileId: string, changes: Partial<DownloadTask>): void {
  const t = tasks.get(fileId);
  if (!t) return;
  tasks.set(fileId, { ...t, ...changes });
  notify();
}

function cleanup(fileId: string): void {
  abortControllers.delete(fileId);
  tasks.delete(fileId);
  notify();
}

async function run(opts: {
  fileId: string;
  fileName: string;
  proxyUrl: string;
  accessToken: string;
  quality: Quality;
  signal: AbortSignal;
}): Promise<void> {
  const { fileId, fileName, proxyUrl, accessToken, quality, signal } = opts;
  let errorCode: string = VC_ERROR_CODES.OFFLINE_SAVE;

  try {
    // ── フェッチ ────────────────────────────────────────────────────────
    const resp = await fetch(
      `${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken)}`,
      { headers: { Range: 'bytes=0-' }, signal },
    );
    if (!resp.ok && resp.status !== 206) throw new Error(`fetch: ${resp.status}`);

    let total = parseInt(resp.headers.get('Content-Length') ?? '0', 10);
    if (total === 0) {
      const m = resp.headers.get('Content-Range')?.match(/\/(\d+)$/);
      if (m) total = parseInt(m[1], 10);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('no body');
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) patch(fileId, { phase: 'fetching', progress: received / total });
    }
    const rawBlob = new Blob(chunks, { type: resp.headers.get('Content-Type') ?? 'video/mp4' });

    if (signal.aborted) return cleanup(fileId);

    // ── 圧縮 ────────────────────────────────────────────────────────────
    let compressed: Blob;
    if (quality === 'original') {
      compressed = rawBlob;
    } else {
      errorCode = VC_ERROR_CODES.COMPRESS;
      patch(fileId, { phase: 'loading-ffmpeg', progress: 0 });
      compressed = await compressVideo(rawBlob, quality, (ratio) => {
        if (signal.aborted) return;
        patch(fileId, ratio < 0
          ? { phase: 'loading-ffmpeg', progress: 0 }
          : { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) },
        );
      });
    }

    if (signal.aborted) return cleanup(fileId);

    // ── 保存 ────────────────────────────────────────────────────────────
    errorCode = VC_ERROR_CODES.OFFLINE_SAVE;
    patch(fileId, { phase: 'saving', progress: 1 });
    await saveOfflineVideo(fileId, fileName, compressed);

    abortControllers.delete(fileId);
    patch(fileId, { phase: 'done', progress: 1 });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);

  } catch (e) {
    if (signal.aborted) return cleanup(fileId);
    console.error('[downloadQueue] error', e);
    abortControllers.delete(fileId);
    patch(fileId, { phase: 'error', progress: 0, errorCode });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 6000);
  }
}
