/**
 * アスペクト比を維持しながら maxWidth/maxHeight に収まる出力サイズを計算する。
 * スケールアップはしない（scale は 1.0 を上限）。
 * 出力は VideoEncoder の要件に合わせ偶数に丸める。
 *
 * @param origWidth 元の動画幅
 * @param origHeight 元の動画高さ
 * @param maxWidth 最大幅
 * @param maxHeight 最大高さ
 * @returns スケール後の幅と高さ（常に偶数）
 */
export function scaleOutput(
  origWidth: number,
  origHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / origWidth, maxHeight / origHeight, 1.0);
  return {
    width: Math.round((origWidth * scale) / 2) * 2,
    height: Math.round((origHeight * scale) / 2) * 2,
  };
}
