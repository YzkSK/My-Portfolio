import { compressVideo, type Quality } from './videoCompressor';
import { saveOfflineVideo, loadRawVideo, deleteRawVideo, listPendingRaws } from './offlineStorage';
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

// Minimal inline types for Background Fetch API (not in standard TS lib)
interface BgFetchRegistration {
  id: string;
  downloaded: number;
  downloadTotal: number;
  result: '' | 'success' | 'failure';
  addEventListener(event: 'progress', fn: () => void): void;
  abort?(): Promise<boolean>;
  updateUI?(opts: { title?: string }): Promise<void>;
}
interface BgFetchManager {
  fetch(id: string, requests: RequestInfo[], options?: {
    title?: string;
    downloadTotal?: number;
    icons?: Array<{ src: string; sizes?: string; type?: string }>;
  }): Promise<BgFetchRegistration>;
  get(id: string): Promise<BgFetchRegistration | undefined>;
}

const tasks            = new Map<string, DownloadTask>();
const abortControllers = new Map<string, AbortController>();
const bgFetchRegs      = new Map<string, BgFetchRegistration>();
const listeners        = new Set<() => void>();

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

// SW message listener — handles BG fetch completion for all qualities
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; fileId?: string; fileName?: string; quality?: string } | null;
    if (!data?.type || !data?.fileId) return;
    const { fileId, fileName = '', quality = 'original' } = data;

    if (data.type === 'vc-bgfetch-done') {
      // 'original': raw == final, already saved by SW
      bgFetchRegs.delete(fileId);
      if (tasks.has(fileId)) {
        abortControllers.delete(fileId);
        patch(fileId, { phase: 'done', progress: 1 });
        setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
      }
    } else if (data.type === 'vc-bgfetch-raw-done') {
      // compressed quality: raw blob saved by SW → start in-page compression
      bgFetchRegs.delete(fileId);
      if (!tasks.has(fileId)) {
        tasks.set(fileId, { fileId, fileName, phase: 'loading-ffmpeg', progress: 0 });
        notify();
      } else {
        patch(fileId, { phase: 'loading-ffmpeg', progress: 0 });
      }
      runCompressionFromRaw({ fileId, fileName, quality }).catch(() => {});
    } else if (data.type === 'vc-bgfetch-fail') {
      bgFetchRegs.delete(fileId);
      if (tasks.has(fileId)) {
        abortControllers.delete(fileId);
        patch(fileId, { phase: 'error', progress: 0, errorCode: VC_ERROR_CODES.OFFLINE_SAVE });
        setTimeout(() => { tasks.delete(fileId); notify(); }, 6000);
      }
    }
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startDownload(opts: {
  fileId: string;
  fileName: string;
  proxyUrl: string;
  accessToken: string;
  quality: Quality;
  fileSizeBytes?: number;
}): void {
  if (tasks.has(opts.fileId)) return;
  tasks.set(opts.fileId, { fileId: opts.fileId, fileName: opts.fileName, phase: 'fetching', progress: 0 });
  notify();

  if (opts.quality === 'original') {
    launchWithBgFetch(opts);
  } else {
    launchCompressed(opts);
  }
}

export function cancelDownload(fileId: string): void {
  const bgReg = bgFetchRegs.get(fileId);
  if (bgReg) {
    bgReg.abort?.();
    bgFetchRegs.delete(fileId);
  }
  abortControllers.get(fileId)?.abort();
  abortControllers.delete(fileId);
  tasks.delete(fileId);
  notify();
  deleteRawVideo(fileId).catch(() => {});
}

/** Called on mount to resume any compressions interrupted by a browser close */
export async function resumePendingCompressions(): Promise<void> {
  const pending = await listPendingRaws().catch(() => [] as Array<{ fileId: string; fileName: string; quality: string }>);
  for (const entry of pending) {
    if (tasks.has(entry.fileId)) continue;
    tasks.set(entry.fileId, { fileId: entry.fileId, fileName: entry.fileName, phase: 'loading-ffmpeg', progress: 0 });
    notify();
    runCompressionFromRaw(entry).catch(() => {});
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function patch(fileId: string, changes: Partial<DownloadTask>): void {
  const t = tasks.get(fileId);
  if (!t) return;
  tasks.set(fileId, { ...t, ...changes });
  notify();
}

function cleanup(fileId: string): void {
  abortControllers.delete(fileId);
  bgFetchRegs.delete(fileId);
  tasks.delete(fileId);
  notify();
}

// ─── 'original' quality: BG Fetch or in-page fallback ───────────────────────

function launchWithBgFetch(opts: {
  fileId: string;
  fileName: string;
  proxyUrl: string;
  accessToken: string;
  quality: Quality;
  fileSizeBytes?: number;
}): void {
  (async () => {
    if ('serviceWorker' in navigator) {
      const started = await tryStartBgFetch(opts).catch(() => false);
      if (started) return;
    }
    // Fallback: in-page fetch, no compression
    const controller = new AbortController();
    abortControllers.set(opts.fileId, controller);
    await runOriginalInPage({ ...opts, signal: controller.signal });
  })().catch(e => {
    console.error('[downloadQueue] original launch error', e);
    if (tasks.has(opts.fileId)) {
      abortControllers.delete(opts.fileId);
      patch(opts.fileId, { phase: 'error', progress: 0, errorCode: VC_ERROR_CODES.OFFLINE_SAVE });
      setTimeout(() => { tasks.delete(opts.fileId); notify(); }, 6000);
    }
  });
}

// ─── compressed qualities: BG Fetch (download) + in-page (compress) ─────────

function launchCompressed(opts: {
  fileId: string;
  fileName: string;
  proxyUrl: string;
  accessToken: string;
  quality: Quality;
  fileSizeBytes?: number;
}): void {
  (async () => {
    if ('serviceWorker' in navigator) {
      const started = await tryStartBgFetch(opts).catch(() => false);
      if (started) return; // SW will save raw blob and notify us to compress
    }
    // Fallback: in-page fetch + compress
    const controller = new AbortController();
    abortControllers.set(opts.fileId, controller);
    await runInPageFetchAndCompress({ ...opts, signal: controller.signal });
  })().catch(e => {
    console.error('[downloadQueue] compressed launch error', e);
    if (tasks.has(opts.fileId)) {
      abortControllers.delete(opts.fileId);
      patch(opts.fileId, { phase: 'error', progress: 0, errorCode: VC_ERROR_CODES.OFFLINE_SAVE });
      setTimeout(() => { tasks.delete(opts.fileId); notify(); }, 6000);
    }
  });
}

// ─── Background Fetch (shared by all qualities) ──────────────────────────────

async function tryStartBgFetch(opts: {
  fileId: string;
  fileName: string;
  proxyUrl: string;
  accessToken: string;
  quality: Quality;
  fileSizeBytes?: number;
}): Promise<boolean> {
  const { fileId, fileName, proxyUrl, accessToken, quality, fileSizeBytes = 0 } = opts;
  const sw = await navigator.serviceWorker.ready;
  if (!('backgroundFetch' in sw)) return false;

  const bgFetchApi = (sw as unknown as { backgroundFetch: BgFetchManager }).backgroundFetch;
  const bgFetchId  = `vc-bg-${fileId}`;
  const streamUrl  = `${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken)}`;

  // Store metadata (including quality) in Cache API for the SW to read on completion
  const cache = await caches.open('vc-bgfetch-meta');
  await cache.put(
    `/${bgFetchId}`,
    new Response(JSON.stringify({ fileId, fileName, quality }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  const bgFetch = await bgFetchApi.fetch(
    bgFetchId,
    [new Request(streamUrl, { headers: { Range: 'bytes=0-' } })],
    {
      title: fileName,
      ...(fileSizeBytes > 0 ? { downloadTotal: fileSizeBytes } : {}),
    },
  );

  bgFetchRegs.set(fileId, bgFetch);

  bgFetch.addEventListener('progress', () => {
    if (bgFetch.result === 'success') {
      // SW will handle saving and send postMessage; just reflect fetching=done here
      bgFetchRegs.delete(fileId);
      if (quality !== 'original') {
        // compression will be triggered via SW message
        patch(fileId, { phase: 'loading-ffmpeg', progress: 0 });
      } else {
        patch(fileId, { phase: 'done', progress: 1 });
        setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
      }
    } else if (bgFetch.result === 'failure') {
      bgFetchRegs.delete(fileId);
      patch(fileId, { phase: 'error', progress: 0, errorCode: VC_ERROR_CODES.OFFLINE_SAVE });
      setTimeout(() => { tasks.delete(fileId); notify(); }, 6000);
    } else if (bgFetch.downloadTotal > 0) {
      patch(fileId, { phase: 'fetching', progress: bgFetch.downloaded / bgFetch.downloadTotal });
    }
  });

  return true;
}

// ─── Compression from raw blob (after BG Fetch or on resume) ────────────────

async function runCompressionFromRaw(opts: { fileId: string; fileName: string; quality: string }): Promise<void> {
  const { fileId, fileName, quality } = opts;
  try {
    const raw = await loadRawVideo(fileId);
    if (!raw) throw new Error('raw blob not found');

    patch(fileId, { phase: 'loading-ffmpeg', progress: 0 });
    const compressed = await compressVideo(raw.rawBlob, quality as Quality, (ratio) => {
      patch(fileId, ratio < 0
        ? { phase: 'loading-ffmpeg', progress: 0 }
        : { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) },
      );
    });

    patch(fileId, { phase: 'saving', progress: 1 });
    await saveOfflineVideo(fileId, fileName, compressed);
    await deleteRawVideo(fileId);

    abortControllers.delete(fileId);
    patch(fileId, { phase: 'done', progress: 1 });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
  } catch (e) {
    console.error('[downloadQueue] compression from raw error', e);
    abortControllers.delete(fileId);
    patch(fileId, { phase: 'error', progress: 0, errorCode: VC_ERROR_CODES.COMPRESS });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 6000);
  }
}

// ─── In-page fallback: original (no compression) ────────────────────────────

async function runOriginalInPage(opts: {
  fileId: string;
  fileName: string;
  proxyUrl: string;
  accessToken: string;
  signal: AbortSignal;
}): Promise<void> {
  const { fileId, fileName, proxyUrl, accessToken, signal } = opts;
  try {
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

    if (signal.aborted) { cleanup(fileId); return; }

    const blob = new Blob(chunks, { type: resp.headers.get('Content-Type') ?? 'video/mp4' });
    patch(fileId, { phase: 'saving', progress: 1 });
    await saveOfflineVideo(fileId, fileName, blob);

    abortControllers.delete(fileId);
    patch(fileId, { phase: 'done', progress: 1 });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
  } catch (e) {
    if (signal.aborted) { cleanup(fileId); return; }
    console.error('[downloadQueue] original in-page error', e);
    abortControllers.delete(fileId);
    patch(fileId, { phase: 'error', progress: 0, errorCode: VC_ERROR_CODES.OFFLINE_SAVE });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 6000);
  }
}

// ─── In-page fallback: fetch + compress (BG Fetch unavailable) ──────────────

async function runInPageFetchAndCompress(opts: {
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

    errorCode = VC_ERROR_CODES.COMPRESS;
    patch(fileId, { phase: 'loading-ffmpeg', progress: 0 });
    const compressed = await compressVideo(rawBlob, quality, (ratio) => {
      if (signal.aborted) return;
      patch(fileId, ratio < 0
        ? { phase: 'loading-ffmpeg', progress: 0 }
        : { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) },
      );
    });

    if (signal.aborted) return cleanup(fileId);

    errorCode = VC_ERROR_CODES.OFFLINE_SAVE;
    patch(fileId, { phase: 'saving', progress: 1 });
    await saveOfflineVideo(fileId, fileName, compressed);

    abortControllers.delete(fileId);
    patch(fileId, { phase: 'done', progress: 1 });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
  } catch (e) {
    if (signal.aborted) return cleanup(fileId);
    console.error('[downloadQueue] in-page fetch+compress error', e);
    abortControllers.delete(fileId);
    patch(fileId, { phase: 'error', progress: 0, errorCode });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 6000);
  }
}
