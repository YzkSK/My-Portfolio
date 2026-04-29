import { useState, useRef, useEffect } from 'react';
import { type Quality, QUALITY_INFO, compressVideo, estimatedSizeRatio } from '../videoCompressor';
import { saveOfflineVideo, getOfflineStorageUsage, getStorageLimitGb, checkQuota } from '../offlineStorage';
import { formatSize, VC_ERROR_CODES } from '../constants';

type Phase =
  | { type: 'select' }
  | { type: 'fetching'; progress: number }
  | { type: 'loading-ffmpeg' }
  | { type: 'compressing'; progress: number }
  | { type: 'saving' }
  | { type: 'done' };

type Props = {
  fileId: string;
  fileName: string;
  fileSize: string;
  proxyUrl: string;
  accessToken: string;
  onSaved: () => void;
  onClose: () => void;
  addToast: (msg: string, type: 'normal' | 'error' | 'warning') => void;
};

const QUALITIES: Quality[] = ['high', 'medium', 'low'];

export const OfflineSaveModal = ({
  fileId,
  fileName,
  fileSize,
  proxyUrl,
  accessToken,
  onSaved,
  onClose,
  addToast,
}: Props) => {
  const [quality, setQuality] = useState<Quality>('medium');
  const [phase, setPhase] = useState<Phase>({ type: 'select' });
  const [usage, setUsage] = useState<{ count: number; totalBytes: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    getOfflineStorageUsage().then(setUsage).catch(() => null);
  }, []);

  const originalBytes = parseInt(fileSize, 10) || 0;
  const estimatedBytes = Math.round(originalBytes * estimatedSizeRatio(quality));
  const limitGb = getStorageLimitGb();
  const limitBytes = limitGb * 1024 * 1024 * 1024;
  const usedBytes = usage?.totalBytes ?? 0;
  const wouldExceed = usedBytes + estimatedBytes > limitBytes;

  const handleSave = async () => {
    cancelledRef.current = false;

    const quotaResult = await checkQuota(estimatedBytes).catch(() => 'ok' as const);
    if (quotaResult === 'over-limit') {
      addToast(`保存上限（${limitGb} GB）を超えます。上限を増やすか既存の動画を削除してください。`, 'warning');
      return;
    }

    // フェッチフェーズ
    abortRef.current = new AbortController();
    setPhase({ type: 'fetching', progress: 0 });

    let rawBlob: Blob;
    try {
      const resp = await fetch(
        `${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken)}`,
        { signal: abortRef.current.signal },
      );
      if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);

      const total = parseInt(resp.headers.get('Content-Length') ?? '0', 10);
      const reader = resp.body!.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cancelledRef.current) return;
        chunks.push(value);
        received += value.length;
        if (total > 0) setPhase({ type: 'fetching', progress: received / total });
      }

      rawBlob = new Blob(chunks, { type: 'video/mp4' });
    } catch (e) {
      if (cancelledRef.current) return;
      console.error('オフライン保存: 取得エラー', e);
      addToast(`動画の取得に失敗しました [${VC_ERROR_CODES.OFFLINE_SAVE}]`, 'error');
      setPhase({ type: 'select' });
      return;
    }

    if (cancelledRef.current) return;

    // 圧縮フェーズ
    setPhase({ type: 'loading-ffmpeg' });
    let compressed: Blob;
    try {
      compressed = await compressVideo(rawBlob, quality, (ratio) => {
        if (cancelledRef.current) return;
        if (ratio < 0) {
          setPhase({ type: 'loading-ffmpeg' });
        } else {
          setPhase({ type: 'compressing', progress: ratio });
        }
      });
    } catch (e) {
      if (cancelledRef.current) return;
      console.error('オフライン保存: 圧縮エラー', e);
      addToast(`動画の圧縮に失敗しました [${VC_ERROR_CODES.COMPRESS}]`, 'error');
      setPhase({ type: 'select' });
      return;
    }

    if (cancelledRef.current) return;

    // 保存フェーズ
    setPhase({ type: 'saving' });
    try {
      await saveOfflineVideo(fileId, fileName, compressed);
    } catch (e) {
      console.error('オフライン保存: IndexedDB エラー', e);
      addToast(`オフライン保存に失敗しました [${VC_ERROR_CODES.OFFLINE_SAVE}]`, 'error');
      setPhase({ type: 'select' });
      return;
    }

    setPhase({ type: 'done' });
    addToast('オフライン保存しました', 'normal');
    onSaved();
    setTimeout(onClose, 800);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setPhase({ type: 'select' });
  };

  const isProcessing = phase.type !== 'select' && phase.type !== 'done';

  return (
    <div className="vc-player-settings-overlay" onClick={isProcessing ? undefined : onClose}>
      <div className="vc-player-settings-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, width: '90%' }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>オフライン保存</span>
          {!isProcessing && (
            <button className="vc-player-btn" onClick={onClose} aria-label="閉じる">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
        </div>

        {/* ストレージ使用量 */}
        {usage !== null && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>ストレージ使用量</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#fff' }}>
                {formatSize(String(usedBytes))} / {limitGb} GB
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                {usage.count} 件保存済み
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: usedBytes / limitBytes > 0.9 ? '#ef4444' : '#60a5fa', borderRadius: 2, width: `${Math.min(100, (usedBytes / limitBytes) * 100)}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* 品質選択（処理中は非表示） */}
        {!isProcessing && (
          <>
            <p className="vc-settings-section-label">圧縮品質</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {QUALITIES.map(q => {
                const info = QUALITY_INFO[q];
                const est = Math.round(originalBytes * estimatedSizeRatio(q));
                return (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: quality === q ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                      outline: quality === q ? '1px solid rgba(96,165,250,0.6)' : 'none',
                    }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', display: 'block' }}>{info.label}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{info.description}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
                      約 {est > 0 ? formatSize(String(est)) : '—'}
                    </span>
                  </button>
                );
              })}
            </div>

            {wouldExceed && (
              <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 12 }}>
                保存上限（{limitGb} GB）を超える可能性があります
              </p>
            )}

            <button
              onClick={handleSave}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              保存する
            </button>
          </>
        )}

        {/* 進捗表示 */}
        {isProcessing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '8px 0' }}>
            <PhaseIndicator phase={phase} />
            <button
              onClick={handleCancel}
              style={{
                padding: '7px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
                background: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const PhaseIndicator = ({ phase }: { phase: Phase }) => {
  const bar = (ratio: number) => (
    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', background: '#3b82f6', borderRadius: 3, width: `${Math.round(ratio * 100)}%`, transition: 'width 0.2s' }} />
    </div>
  );

  if (phase.type === 'fetching') return (
    <div style={{ width: '100%' }}>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 8px', textAlign: 'center' }}>
        動画を取得中… {Math.round(phase.progress * 100)}%
      </p>
      {bar(phase.progress)}
    </div>
  );

  if (phase.type === 'loading-ffmpeg') return (
    <div style={{ textAlign: 'center' }}>
      <div className="vc-spinner" style={{ margin: '0 auto 10px' }} />
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>圧縮エンジンを読み込み中…</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>初回のみ時間がかかります</p>
    </div>
  );

  if (phase.type === 'compressing') return (
    <div style={{ width: '100%' }}>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 8px', textAlign: 'center' }}>
        圧縮中… {Math.round(phase.progress * 100)}%
      </p>
      {bar(phase.progress)}
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, textAlign: 'center' }}>
        動画の長さによっては数分かかることがあります
      </p>
    </div>
  );

  if (phase.type === 'saving') return (
    <div style={{ textAlign: 'center' }}>
      <div className="vc-spinner" style={{ margin: '0 auto 10px' }} />
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>保存中…</p>
    </div>
  );

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="#22c55e" style={{ marginBottom: 8 }}>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
      <p style={{ fontSize: 13, color: '#22c55e', margin: 0 }}>保存しました</p>
    </div>
  );
};
