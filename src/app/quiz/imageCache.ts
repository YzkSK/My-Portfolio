const CACHE_NAME = 'quiz-img-v1';

// セッション内の blob URL を再利用
const memoryCache = new Map<string, string>();
// セッション内で失敗した URL（次回呼び出し時に再取得を試みる）
const failedUrls = new Set<string>();

export async function getCachedImageUrl(url: string): Promise<string> {
  // 失敗済みでなければメモリキャッシュを返す
  if (!failedUrls.has(url) && memoryCache.has(url)) return memoryCache.get(url)!;

  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);

    // 失敗済みでなければ Cache API を確認
    if (!failedUrls.has(url)) {
      const match = await cache.match(url);
      if (match) {
        const blob = await match.blob();
        const blobUrl = URL.createObjectURL(blob);
        memoryCache.set(url, blobUrl);
        return blobUrl;
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
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    memoryCache.set(url, blobUrl);
    return blobUrl;
  }

  // Cache API 非対応の場合はそのまま返す
  return url;
}
