const CACHE_NAME = 'quiz-img-v1';

// セッション内の blob URL を再利用（Cache API から毎回 blob 生成しない）
const memoryCache = new Map<string, string>();

export async function getCachedImageUrl(url: string): Promise<string> {
  if (memoryCache.has(url)) return memoryCache.get(url)!;

  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    if (match) {
      const blob = await match.blob();
      const blobUrl = URL.createObjectURL(blob);
      memoryCache.set(url, blobUrl);
      return blobUrl;
    }
    const response = await fetch(url);
    await cache.put(url, response.clone());
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    memoryCache.set(url, blobUrl);
    return blobUrl;
  }

  // Cache API 非対応の場合はそのまま返す
  return url;
}
