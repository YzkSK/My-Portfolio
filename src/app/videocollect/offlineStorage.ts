const DB_NAME = 'vc-offline-v1';
const STORE_NAME = 'videos';
const STORAGE_LIMIT_KEY = 'vc-offline-limit-gb';
const DEFAULT_LIMIT_GB = 5;

// Separate DB for raw (uncompressed) blobs pending in-app compression
const RAW_DB_NAME  = 'vc-offline-raw-v1';
const RAW_STORE    = 'raws';
const RAW_CHUNKS_STORE = 'rawChunks';

type OfflineEntry = {
  fileId: string;
  fileName: string;
  blob: Blob;
  savedAt: number;
  size: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function saveOfflineVideo(
  fileId: string,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const entry: OfflineEntry = { fileId, fileName, blob, savedAt: Date.now(), size: blob.size };
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadOfflineVideo(fileId: string): Promise<Blob | null> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(fileId);
    req.onsuccess = () => resolve((req.result as OfflineEntry | undefined)?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflineVideo(fileId: string): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(fileId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listOfflineSavedIds(): Promise<string[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

export async function isOfflineSaved(fileId: string): Promise<boolean> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getKey(fileId);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineStorageUsage(): Promise<{ count: number; totalBytes: number }> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const entries = req.result as OfflineEntry[];
      resolve({
        count: entries.length,
        totalBytes: entries.reduce((sum, e) => sum + e.size, 0),
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export function getStorageLimitGb(): number {
  const v = localStorage.getItem(STORAGE_LIMIT_KEY);
  const n = v !== null ? Number(v) : NaN;
  return isNaN(n) || n < 1 ? DEFAULT_LIMIT_GB : n;
}

export function setStorageLimitGb(gb: number): void {
  localStorage.setItem(STORAGE_LIMIT_KEY, String(Math.max(1, Math.round(gb))));
}

export async function checkQuota(newBytes: number): Promise<'ok' | 'over-limit'> {
  const { totalBytes } = await getOfflineStorageUsage();
  const limitBytes = getStorageLimitGb() * 1024 * 1024 * 1024;
  return totalBytes + newBytes <= limitBytes ? 'ok' : 'over-limit';
}

// ─── Raw (pending compression) store ────────────────────────────────────────

type RawEntry = {
  fileId:  string;
  fileName: string;
  rawBlob: Blob;
  quality: string;
  savedAt: number;
};

let rawDbPromise: Promise<IDBDatabase> | null = null;

function openRawDb(): Promise<IDBDatabase> {
  if (rawDbPromise) return rawDbPromise;
  rawDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(RAW_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(RAW_STORE, { keyPath: 'fileId' });
      // rawChunks stores individual chunks while streaming; key is `${fileId}:${seq}`
      if (!req.result.objectStoreNames.contains(RAW_CHUNKS_STORE)) {
        req.result.createObjectStore(RAW_CHUNKS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      rawDbPromise = null;
      reject(req.error);
    };
  });
  return rawDbPromise;
}

export async function writeRawChunk(fileId: string, seq: number, chunk: Blob): Promise<void> {
  const db = await openRawDb();
  return new Promise((resolve, reject) => {
    const id = `${fileId}:${seq}`;
    const entry = { id, fileId, seq, data: chunk };
    const tx = db.transaction(RAW_CHUNKS_STORE, 'readwrite');
    const req = tx.objectStore(RAW_CHUNKS_STORE).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function finalizeRawFromChunks(fileId: string, fileName: string, quality: string): Promise<void> {
  const db = await openRawDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([RAW_CHUNKS_STORE], 'readwrite');
    const store = tx.objectStore(RAW_CHUNKS_STORE);
    const req = store.getAll();
    req.onsuccess = async () => {
      try {
        const all = req.result as Array<{ id: string; fileId: string; seq: number; data: Blob }>;
        const parts = all
          .filter(e => e.fileId === fileId)
          .sort((a, b) => a.seq - b.seq)
          .map(e => e.data);
        if (parts.length === 0) return resolve();
        const rawBlob = new Blob(parts, { type: 'video/mp4' });
        await saveRawVideo(fileId, fileName, rawBlob, quality);
        // delete chunk entries
        for (const e of all.filter(x => x.fileId === fileId)) {
          try { store.delete(e.id); } catch { /* ignore */ }
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRawChunks(fileId: string): Promise<void> {
  const db = await openRawDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RAW_CHUNKS_STORE, 'readwrite');
    const store = tx.objectStore(RAW_CHUNKS_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as Array<{ id: string; fileId: string }>;
      for (const e of all.filter(x => x.fileId === fileId)) {
        try { store.delete(e.id); } catch { /* ignore */ }
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveRawVideo(fileId: string, fileName: string, rawBlob: Blob, quality: string): Promise<void> {
  const db = await openRawDb();
  return new Promise((resolve, reject) => {
    const entry: RawEntry = { fileId, fileName, rawBlob, quality, savedAt: Date.now() };
    const tx  = db.transaction(RAW_STORE, 'readwrite');
    const req = tx.objectStore(RAW_STORE).put(entry);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function loadRawVideo(fileId: string): Promise<{ rawBlob: Blob; quality: string; fileName: string } | null> {
  const db = await openRawDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(RAW_STORE, 'readonly').objectStore(RAW_STORE).get(fileId);
    req.onsuccess = () => {
      const e = req.result as RawEntry | undefined;
      resolve(e ? { rawBlob: e.rawBlob, quality: e.quality, fileName: e.fileName } : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRawVideo(fileId: string): Promise<void> {
  const db = await openRawDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(RAW_STORE, 'readwrite').objectStore(RAW_STORE).delete(fileId);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function listPendingRaws(): Promise<Array<{ fileId: string; fileName: string; quality: string }>> {
  const db = await openRawDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(RAW_STORE, 'readonly').objectStore(RAW_STORE).getAll();
    req.onsuccess = () => {
      resolve((req.result as RawEntry[]).map(e => ({ fileId: e.fileId, fileName: e.fileName, quality: e.quality })));
    };
    req.onerror = () => reject(req.error);
  });
}
