import { compressVideo, type Quality } from './videoCompressor';
import { acquireWakeLock, releaseWakeLock, isWakeLockActive, isConstrainedDevice } from './wakeLock';
import { saveOfflineVideo, loadRawVideo, deleteRawVideo, listPendingRaws, writeRawChunk, finalizeRawFromChunks, deleteRawChunks } from './offlineStorage';
import { VC_ERROR_CODES } from './constants';

export type DownloadPhase =
  | 'fetching'
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
  logs?: string[];
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
      bgFetchRegs.delete(fileId);
      if (tasks.has(fileId)) {
        abortControllers.delete(fileId);
        patch(fileId, { phase: 'done', progress: 1 });
        setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
      }
    } else if (data.type === 'vc-bgfetch-raw-done') {
      bgFetchRegs.delete(fileId);
      if (!tasks.has(fileId)) {
        tasks.set(fileId, { fileId, fileName, phase: 'compressing', progress: 0 });
        notify();
      } else {
        patch(fileId, { phase: 'compressing', progress: 0 });
      }
      runCompressionFromRaw({ fileId, fileName, quality }).catch(() => {});
    } else if (data.type === 'vc-bgfetch-fail') {
      bgFetchRegs.delete(fileId);
      if (tasks.has(fileId)) {
        abortControllers.delete(fileId);
        // No auto-remove: user must dismiss
        patch(fileId, { phase: 'error', progress: 0, errorCode: VC_ERROR_CODES.OFFLINE_SAVE });
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
  console.info('[downloadQueue] startDownload', {
    fileId: opts.fileId,
    fileName: opts.fileName,
    quality: opts.quality,
    fileSizeBytes: opts.fileSizeBytes ?? 0,
    hasAccessToken: Boolean(opts.accessToken),
  });
  tasks.set(opts.fileId, { fileId: opts.fileId, fileName: opts.fileName, phase: 'fetching', progress: 0 });
  notify();

  // Wake Lock を試行（ブラウザが対応していれば画面が暗くなるのを防ぐ）
  acquireWakeLock().catch(() => {});

  // モバイルかつ低メモリ環境では in-page の圧縮でクラッシュしやすいため
  // 自動的にオリジナル（圧縮なし）へフォールバックする
  const constrained = isConstrainedDevice();
  if (constrained && opts.quality !== 'original') {
    console.warn('[downloadQueue] constrained device detected — forcing original (no-compress)', { fileId: opts.fileId });
    opts = { ...opts, quality: 'original' };
  }

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

/** Dismiss a stuck error card and clean up any pending raw blob */
export function dismissError(fileId: string): void {
  const t = tasks.get(fileId);
  if (t?.phase === 'error') {
    tasks.delete(fileId);
    notify();
    deleteRawVideo(fileId).catch(() => {});
  }
}

/** Called on mount to resume any compressions interrupted by a browser close */
export async function resumePendingCompressions(): Promise<void> {
  const pending = await listPendingRaws().catch(() => [] as Array<{ fileId: string; fileName: string; quality: string }>);
  for (const entry of pending) {
    if (tasks.has(entry.fileId)) continue;
    tasks.set(entry.fileId, { fileId: entry.fileId, fileName: entry.fileName, phase: 'compressing', progress: 0 });
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
  // タスクが残っていなければ Wake Lock を解放
  const hasActive = Array.from(tasks.values()).some(t => t.phase === 'fetching' || t.phase === 'compressing' || t.phase === 'saving');
  if (!hasActive && isWakeLockActive()) {
    releaseWakeLock().catch(() => {});
  }
}

function setError(fileId: string, errorCode: string, logs?: string[]): void {
  abortControllers.delete(fileId);
  console.error('[downloadQueue] setError', {
    fileId,
    errorCode,
    logLines: logs?.length ?? 0,
  });
  // No auto-remove timeout: user must dismiss the card explicitly
  patch(fileId, { phase: 'error', progress: 0, errorCode, ...(logs ? { logs } : {}) });
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
    const constrained = isConstrainedDevice();
    console.info('[downloadQueue] launchWithBgFetch', {
      fileId: opts.fileId,
      quality: opts.quality,
      fileSizeBytes: opts.fileSizeBytes ?? 0,
      constrained,
    });
    if ('serviceWorker' in navigator) {
      const started = await tryStartBgFetch(opts).catch(() => false);
      if (started) return;
    }
    if (constrained) {
      console.warn('[downloadQueue] constrained device has no BG Fetch support; stopping to avoid crash', {
        fileId: opts.fileId,
      });
      if (tasks.has(opts.fileId)) {
        setError(opts.fileId, VC_ERROR_CODES.OFFLINE_SAVE);
      }
      return;
    }
    console.warn('[downloadQueue] BG Fetch unavailable/failed, fallback to in-page original download', {
      fileId: opts.fileId,
    });
    const controller = new AbortController();
    abortControllers.set(opts.fileId, controller);
    await runOriginalInPage({ ...opts, signal: controller.signal });
  })().catch(e => {
    console.error('[downloadQueue] original launch error', e);
    if (tasks.has(opts.fileId)) setError(opts.fileId, VC_ERROR_CODES.OFFLINE_SAVE);
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
    const constrained = isConstrainedDevice();
    console.info('[downloadQueue] launchCompressed', {
      fileId: opts.fileId,
      quality: opts.quality,
      fileSizeBytes: opts.fileSizeBytes ?? 0,
      constrained,
    });
    if ('serviceWorker' in navigator) {
      const started = await tryStartBgFetch(opts).catch(() => false);
      if (started) return;
    }
    if (constrained) {
      console.warn('[downloadQueue] constrained device has no BG Fetch support; stopping to avoid crash', {
        fileId: opts.fileId,
      });
      if (tasks.has(opts.fileId)) {
        setError(opts.fileId, VC_ERROR_CODES.OFFLINE_SAVE);
      }
      return;
    }
    console.warn('[downloadQueue] BG Fetch unavailable/failed, fallback to in-page fetch+compress', {
      fileId: opts.fileId,
      quality: opts.quality,
    });
    const controller = new AbortController();
    abortControllers.set(opts.fileId, controller);
    await runInPageFetchAndCompress({ ...opts, signal: controller.signal });
  })().catch(e => {
    console.error('[downloadQueue] compressed launch error', e);
    if (tasks.has(opts.fileId)) setError(opts.fileId, VC_ERROR_CODES.OFFLINE_SAVE);
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
  if (!('backgroundFetch' in sw)) {
    console.warn('[downloadQueue] backgroundFetch API not supported', { fileId, quality });
    return false;
  }

  const bgFetchApi = (sw as unknown as { backgroundFetch: BgFetchManager }).backgroundFetch;
  const bgFetchId  = `vc-bg-${fileId}`;
  const streamUrl  = `${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken)}`;

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
    { title: fileName, ...(fileSizeBytes > 0 ? { downloadTotal: fileSizeBytes } : {}) },
  );

  console.info('[downloadQueue] BG Fetch started', {
    bgFetchId,
    fileId,
    quality,
    fileSizeBytes,
    streamUrl,
  });

  bgFetchRegs.set(fileId, bgFetch);

  bgFetch.addEventListener('progress', () => {
    console.info('[downloadQueue] BG Fetch progress', {
      fileId,
      quality,
      result: bgFetch.result,
      downloaded: bgFetch.downloaded,
      downloadTotal: bgFetch.downloadTotal,
    });
    if (bgFetch.result === 'success') {
      bgFetchRegs.delete(fileId);
      if (quality !== 'original') {
        patch(fileId, { phase: 'compressing', progress: 0 });
      } else {
        patch(fileId, { phase: 'done', progress: 1 });
        setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
      }
    } else if (bgFetch.result === 'failure') {
      bgFetchRegs.delete(fileId);
      if (tasks.has(fileId)) setError(fileId, VC_ERROR_CODES.OFFLINE_SAVE);
    } else if (bgFetch.downloadTotal > 0) {
      patch(fileId, { phase: 'fetching', progress: bgFetch.downloaded / bgFetch.downloadTotal });
    } else {
      // size不明ケースはUI上0%に見えるためログを出す
      console.warn('[downloadQueue] BG Fetch total size unknown; progress UI may stay at 0%', {
        fileId,
        quality,
      });
    }
  });

  return true;
}

// ─── Compression from raw blob (after BG Fetch or on resume) ────────────────

async function runCompressionFromRaw(opts: { fileId: string; fileName: string; quality: string }): Promise<void> {
  const { fileId, fileName, quality } = opts;
  const logs: string[] = [];
  try {
    const raw = await loadRawVideo(fileId);
    if (!raw) throw new Error('raw blob not found');

    patch(fileId, { phase: 'compressing', progress: 0 });
    const compressed = await compressVideo(
      raw.rawBlob,
      quality as Quality,
      (ratio) => {
        patch(fileId, { phase: 'compressing', progress: Math.max(0, Math.min(1, ratio)) });
      },
      (line) => { logs.push(line); },
    );

    patch(fileId, { phase: 'saving', progress: 1 });
    await saveOfflineVideo(fileId, fileName, compressed);
    await deleteRawVideo(fileId);

    abortControllers.delete(fileId);
    patch(fileId, { phase: 'done', progress: 1 });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
  } catch (e) {
    console.error('[downloadQueue] compression from raw error', e);
    setError(fileId, VC_ERROR_CODES.COMPRESS, logs);
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
    console.info('[downloadQueue] runOriginalInPage response', {
      fileId,
      status: resp.status,
      contentType: resp.headers.get('Content-Type'),
      contentLength: resp.headers.get('Content-Length'),
      contentRange: resp.headers.get('Content-Range'),
      acceptRanges: resp.headers.get('Accept-Ranges'),
    });
    if (!resp.ok && resp.status !== 206) throw new Error(`fetch: ${resp.status}`);

    let total = parseInt(resp.headers.get('Content-Length') ?? '0', 10);
    if (total === 0) {
      const m = resp.headers.get('Content-Range')?.match(/\/(\d+)$/);
      if (m) total = parseInt(m[1], 10);
    }
    const hasContentLength = total > 0;

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('no body');
    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastLoggedPct = -1;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (hasContentLength && total > 0) {
        const ratio = received / total;
        patch(fileId, { phase: 'fetching', progress: ratio });
        const pct = Math.floor(ratio * 100);
        if (pct >= lastLoggedPct + 10) {
          lastLoggedPct = pct;
          console.info('[downloadQueue] runOriginalInPage progress', { fileId, received, total, pct });
        }
      } else if (!hasContentLength) {
        // Content-Length がない場合はログのみで進捗UI更新せず（至少 0% からは動く）
        const logEvery = 10 * 1024 * 1024; // 10MB ごと
        if (received % logEvery === 0 || Math.floor(received / logEvery) > Math.floor((received - value.length) / logEvery)) {
          console.info('[downloadQueue] runOriginalInPage progress (no Content-Length)', { fileId, received });
        }
      }
    }

    if (signal.aborted) { cleanup(fileId); return; }

    // Content-Length がなかった場合、最終的に blob.size から進捗を確定させる
    if (!hasContentLength) {
      console.warn('[downloadQueue] runOriginalInPage completed without Content-Length', { fileId, received });
      // ここで progress を 1 に設定することで「完了」状態に移す
      patch(fileId, { phase: 'saving', progress: 1 });
    } else {
      patch(fileId, { phase: 'saving', progress: 1 });
    }

    await saveOfflineVideo(fileId, fileName, new Blob(chunks, { type: resp.headers.get('Content-Type') ?? 'video/mp4' }));

    abortControllers.delete(fileId);
    patch(fileId, { phase: 'done', progress: 1 });
    setTimeout(() => { tasks.delete(fileId); notify(); }, 4000);
  } catch (e) {
    if (signal.aborted) { cleanup(fileId); return; }
    console.error('[downloadQueue] original in-page error', e);
    setError(fileId, VC_ERROR_CODES.OFFLINE_SAVE);
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
  const logs: string[] = [];

  try {
    const resp = await fetch(
      `${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken)}`,
      { headers: { Range: 'bytes=0-' }, signal },
    );
    console.info('[downloadQueue] runInPageFetchAndCompress response', {
      fileId,
      quality,
      status: resp.status,
      contentType: resp.headers.get('Content-Type'),
      contentLength: resp.headers.get('Content-Length'),
      contentRange: resp.headers.get('Content-Range'),
      acceptRanges: resp.headers.get('Accept-Ranges'),
    });
    if (!resp.ok && resp.status !== 206) throw new Error(`fetch: ${resp.status}`);

    let total = parseInt(resp.headers.get('Content-Length') ?? '0', 10);
    if (total === 0) {
      const m = resp.headers.get('Content-Range')?.match(/\/(\d+)$/);
      if (m) total = parseInt(m[1], 10);
    }
    const hasContentLength = total > 0;

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('no body');
    let received = 0;
    let lastLoggedPct = -1;
    let seq = 0;
    // Stream chunks to IndexedDB to avoid OOM on constrained devices
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new Blob([value]);
        await writeRawChunk(fileId, seq++, chunk);
        received += value.length;
        if (hasContentLength && total > 0) {
          const ratio = received / total;
          patch(fileId, { phase: 'fetching', progress: ratio });
          const pct = Math.floor(ratio * 100);
          if (pct >= lastLoggedPct + 10) {
            lastLoggedPct = pct;
            console.info('[downloadQueue] runInPageFetchAndCompress progress', { fileId, quality, received, total, pct });
          }
        } else {
          const logEvery = 10 * 1024 * 1024; // 10MB
          if (received % logEvery === 0 || Math.floor(received / logEvery) > Math.floor((received - value.length) / logEvery)) {
            console.info('[downloadQueue] runInPageFetchAndCompress progress (no Content-Length)', { fileId, quality, received });
          }
        }
        if (signal.aborted) {
          await deleteRawChunks(fileId).catch(() => {});
          return cleanup(fileId);
        }
      }
    } catch (e) {
      await deleteRawChunks(fileId).catch(() => {});
      throw e;
    }

    if (signal.aborted) return cleanup(fileId);

    if (!hasContentLength) {
      console.warn('[downloadQueue] runInPageFetchAndCompress completed fetch without Content-Length', { fileId, quality, received });
    }

    // Finalize raw from chunks and then compress from raw store
    await finalizeRawFromChunks(fileId, fileName, quality);
    errorCode = VC_ERROR_CODES.COMPRESS;
    patch(fileId, { phase: 'compressing', progress: 0 });
    await runCompressionFromRaw({ fileId, fileName, quality });
  } catch (e) {
    if (signal.aborted) return cleanup(fileId);
    console.error('[downloadQueue] in-page fetch+compress error', e);
    setError(fileId, errorCode, errorCode === VC_ERROR_CODES.COMPRESS ? logs : undefined);
  }
}
