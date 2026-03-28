const CACHE_NAME = 'quiz-img-v1';

// セッション内の blob URL を再利用
const memoryCache = new Map<string, string>();
// セッション内で失敗した URL（次回呼び出し時に再取得を試みる）
const failedUrls = new Set<string>();

function storeBlobUrl(url: string, blob: Blob): string {
  const existing = memoryCache.get(url);
  if (existing) URL.revokeObjectURL(existing);
  const blobUrl = URL.createObjectURL(blob);
  memoryCache.set(url, blobUrl);
  return blobUrl;
}

export async function getCachedImageUrl(url: string): Promise<string> {
  // 失敗済みでなければメモリキャッシュを返す
  if (!failedUrls.has(url) && memoryCache.has(url)) return memoryCache.get(url)!;

  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);

    // 失敗済みでなければ Cache API を確認
    if (!failedUrls.has(url)) {
      const match = await cache.match(url);
      if (match) {
        return storeBlobUrl(url, await match.blob());
      }
    }

    // フェッチ（再取得）
    let response: Response;
    try {
      response = await fetch(url);
    } catch (e) {
      failedUrls.add(url);
      await cache.delete(url);
      throw e;
    }

    if (!response.ok) {
      failedUrls.add(url);
      await cache.delete(url);
      throw new Error(`HTTP ${response.status}`);
    }

    // 成功: キャッシュして返す
    failedUrls.delete(url);
    await cache.put(url, response.clone());
    return storeBlobUrl(url, await response.blob());
  }

  // Cache API 非対応の場合はそのまま返す
  return url;
}

export function clearImageCache(): void {
  for (const blobUrl of memoryCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  memoryCache.clear();
  failedUrls.clear();
}
