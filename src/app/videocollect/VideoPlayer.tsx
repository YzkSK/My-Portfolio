import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../shared/usePageTitle';
import { useFirestoreSave } from '../shared/useFirestoreSave';
import '../shared/app.css';
import './videocollect.css';
import { type VcAuth, type VcData, VC_INITIAL_DATA, firestorePaths, loadAccessToken, formatTime, parseVcData, VC_ERROR_CODES } from './constants';
import { TagModal } from './modals/TagModal';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const VideoPlayer = () => {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get('id') ?? '';
  const fileName = searchParams.get('name') ?? '動画';
  usePageTitle(fileName);

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<'processing' | 'codec' | 'error' | null>(null);
  const [vcData, setVcData] = useState<VcData>(VC_INITIAL_DATA);
  const [showTagModal, setShowTagModal] = useState(false);

  const fileTags = vcData.tags[fileId] ?? [];
  const allTags = useMemo(
    () => [...new Set(Object.values(vcData.tags).flat())],
    [vcData.tags],
  );

  const saveVcData = useFirestoreSave<VcData>({
    currentUser,
    path: currentUser ? firestorePaths.vcData(currentUser.uid) : '',
  });

  const handleTagSave = (tags: string[]) => {
    const next = { ...vcData, tags: { ...vcData.tags, [fileId]: tags } };
    setVcData(next);
    saveVcData(next);
    setShowTagModal(false);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ side: 'left' | 'right'; time: number } | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doubleTapAccumSideRef = useRef<'left' | 'right' | null>(null);
  const doubleTapAccumTotalRef = useRef(0);
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const [doubleTapTotal, setDoubleTapTotal] = useState(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skipSeconds, setSkipSeconds] = useState(10);
  const [showControls, setShowControls] = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [isBufferReady, setIsBufferReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      getDoc(doc(db, firestorePaths.vcAuth(currentUser.uid))),
      getDoc(doc(db, firestorePaths.vcData(currentUser.uid))),
    ])
      .then(([authSnap, dataSnap]) => {
        if (dataSnap.exists()) {
          setVcData(parseVcData(dataSnap.data() as Record<string, unknown>));
        }
        if (!authSnap.exists()) {
          setLoadError('Google Drive が連携されていません');
          return null;
        }
        const auth = authSnap.data() as VcAuth;
        if (!auth.refreshToken) {
          setLoadError('Google Drive が連携されていません');
          return null;
        }
        return currentUser.getIdToken().then(idToken => loadAccessToken(currentUser.uid, auth, idToken));
      })
      .then(token => {
        if (token === null) return;
        if (!token) {
          setLoadError(`アクセストークンの取得に失敗しました [${VC_ERROR_CODES.TOKEN_REFRESH}]`);
          return;
        }
        setAccessToken(token);
      })
      .catch(e => {
        console.error('VideoPlayer 読み込みエラー:', e);
        setLoadError('読み込みに失敗しました');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      if (previewSeekTimerRef.current) clearTimeout(previewSeekTimerRef.current);
    };
  }, []);

  // ドラッグ中にプレビュー動画を80msデバウンスでシーク
  useEffect(() => {
    if (!isSeeking) return;
    if (previewSeekTimerRef.current) clearTimeout(previewSeekTimerRef.current);
    previewSeekTimerRef.current = setTimeout(() => {
      const pv = previewVideoRef.current;
      if (pv) pv.currentTime = seekPreview;
    }, 80);
  }, [isSeeking, seekPreview]);

  const showControlsTemporary = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          showControlsTemporary();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          showControlsTemporary();
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
          showControlsTemporary();
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case 'm':
        case 'M':
          video.muted = !video.muted;
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControlsTemporary]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) {
      document.exitFullscreen?.() ?? (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
    } else {
      const el = containerRef.current;
      if (!el) return;
      (el.requestFullscreen?.() ?? (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.())
        ?.catch(() => {
          const video = videoRef.current;
          if (video && 'webkitEnterFullscreen' in video) {
            (video as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
          }
        });
    }
  };

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
    showControlsTemporary();
  }, [showControlsTemporary]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    showControlsTemporary();
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const x = e.changedTouches[0].clientX - left;
    const side: 'left' | 'right' = x < width / 2 ? 'left' : 'right';
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.side === side && now - last.time < 300) {
      video.currentTime = side === 'left'
        ? Math.max(0, video.currentTime - skipSeconds)
        : Math.min(video.duration || 0, video.currentTime + skipSeconds);
      lastTapRef.current = null;
      // 同じ側への連続ダブルタップは秒数を加算
      if (doubleTapAccumSideRef.current === side) {
        doubleTapAccumTotalRef.current += skipSeconds;
      } else {
        doubleTapAccumSideRef.current = side;
        doubleTapAccumTotalRef.current = skipSeconds;
      }
      setDoubleTapSide(side);
      setDoubleTapTotal(doubleTapAccumTotalRef.current);
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      doubleTapTimerRef.current = setTimeout(() => {
        setDoubleTapSide(null);
        doubleTapAccumSideRef.current = null;
        doubleTapAccumTotalRef.current = 0;
      }, 800);
    } else {
      lastTapRef.current = { side, time: now };
    }
  }, [showControlsTemporary, skipSeconds]);

  const updateBuffered = (v: HTMLVideoElement) => {
    const buf = v.buffered;
    for (let i = 0; i < buf.length; i++) {
      if (buf.start(i) <= v.currentTime + 0.1 && buf.end(i) > v.currentTime) {
        setBufferedEnd(buf.end(i));
        return;
      }
    }
  };

  const proxyUrl = import.meta.env.VITE_DRIVE_PROXY_URL as string;

  const handleDownload = () => {
    if (!accessToken) return;
    const a = document.createElement('a');
    a.href = `${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken)}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const videoSrc = accessToken
    ? `${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken)}`
    : '';

  if (loadError) {
    return (
      <div className="vc-player-page" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', padding: '0 24px' }}>
          {loadError}
        </p>
        <Link to="/app/videocollect" style={{ color: '#60a5fa', fontSize: 13 }}>
          ← 動画一覧に戻る
        </Link>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="vc-player-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="vc-player-page">
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'var(--vc-bg)',
        flexShrink: 0,
      }}>
        <Link
          to="/app/videocollect"
          style={{ color: 'var(--vc-text-primary)', textDecoration: 'none', fontSize: 20, lineHeight: 1 }}
          aria-label="戻る"
        >
          ←
        </Link>
      </div>

      {/* 動画 */}
      <div
        ref={containerRef}
        className="vc-player-container"
        onMouseMove={showControlsTemporary}
        onPointerDown={handlePointerDown}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={videoRef}
          className="vc-player-video"
          src={videoSrc}
          playsInline
          preload="auto"
          onPlay={() => { setPlaying(true); showControlsTemporary(); }}
          onPause={() => { setPlaying(false); setShowControls(true); }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (!v) return;
            setCurrentTime(v.currentTime);
            updateBuffered(v);
          }}
          onProgress={() => { const v = videoRef.current; if (v) updateBuffered(v); }}
          onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
          onVolumeChange={() => {
            const v = videoRef.current;
            if (!v) return;
            setVolume(v.volume);
            setMuted(v.muted);
          }}
          onRateChange={() => setSpeed(videoRef.current?.playbackRate ?? 1)}
          onSeeked={() => setSeekTarget(null)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => { setWaiting(false); setIsBufferReady(true); }}
          onCanPlay={() => {
            setWaiting(false);
            setIsBufferReady(true);
            // ビデオトラックが描画されない場合（コーデック非対応）を検知
            const v = videoRef.current;
            if (v && v.readyState >= 3 && v.videoWidth === 0 && v.duration > 0) {
              setVideoError('codec');
            }
          }}
          onError={async () => {
            try {
              const res = await fetch(`${proxyUrl}/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(accessToken ?? '')}`, { method: 'HEAD' });
              setVideoError(res.status === 503 ? 'processing' : 'error');
            } catch {
              setVideoError('error');
            }
          }}
        />

        {/* ダブルタップインジケーター */}
        {doubleTapSide && (
          <div className={`vc-doubletap-indicator vc-doubletap-indicator--${doubleTapSide}`}>
            <div className="vc-doubletap-chevrons">
              {[0, 1, 2].map(i =>
                doubleTapSide === 'left' ? (
                  <svg key={i} width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ opacity: 1 - i * 0.25 }}>
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                  </svg>
                ) : (
                  <svg key={i} width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ opacity: 1 - i * 0.25 }}>
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                  </svg>
                )
              )}
            </div>
            <span className="vc-doubletap-label">
              {doubleTapSide === 'left' ? `-${doubleTapTotal}秒` : `+${doubleTapTotal}秒`}
            </span>
          </div>
        )}

        {/* 初回バッファリングオーバーレイ */}
        {videoError && (
          <div className="vc-buffer-overlay">
            {videoError === 'processing' ? (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="vc-buffer-text" style={{ maxWidth: 280, textAlign: 'center' }}>
                  Google Drive が動画を処理中です。しばらく待ってからもう一度お試しください。
                </p>
              </>
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="vc-buffer-text">動画を読み込めませんでした</p>
                <button className="vc-buffer-skip" onClick={() => { setVideoError(null); setIsBufferReady(false); videoRef.current?.load(); }}>
                  再試行
                </button>
              </>
            )}
          </div>
        )}

        {!videoError && !isBufferReady && (
          <div className="vc-buffer-overlay">
            <div className="vc-spinner" />
            <p className="vc-buffer-text">
              バッファリング中
              {duration > 0
                ? `… ${Math.round((Math.min(bufferedEnd, duration) / duration) * 100)}%`
                : '…'}
            </p>
            <button className="vc-buffer-skip" onClick={() => setIsBufferReady(true)}>
              今すぐ再生
            </button>
          </div>
        )}

        {/* バッファリングスピナー */}
        {waiting && isBufferReady && (
          <div className="vc-spinner-overlay">
            <div className="vc-spinner" />
          </div>
        )}

        {/* コントロールオーバーレイ */}
        <div
          className={`vc-player-controls${showControls ? '' : ' vc-player-controls--hidden'}`}
        >
          {/* 上部右: ミュート・設定・ダウンロード・フルスクリーン */}
          <div className="vc-player-controls-top">
            <button
              className="vc-player-btn"
              onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}
              aria-label={muted ? 'ミュート解除' : 'ミュート'}
            >
              {muted || volume === 0 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
              )}
            </button>
            <button
              className="vc-player-btn"
              onClick={() => setShowSettingsMenu(true)}
              aria-label="設定"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.05 7.05 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.477.477 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
            </button>
            <button className="vc-player-btn" onClick={handleDownload} aria-label="ダウンロード">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
            </button>
            <button className="vc-player-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'フルスクリーン解除' : 'フルスクリーン'}>
              {isFullscreen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </div>

          {/* 中央: スキップ戻る・再生/停止・スキップ進む */}
          <div className="vc-player-controls-center">
            <button
              className="vc-player-btn--skip"
              onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - skipSeconds); }}
              aria-label={`${skipSeconds}秒戻る`}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              </svg>
              <span className="vc-player-skip-label">{skipSeconds}</span>
            </button>

            <button
              className="vc-player-btn--play"
              onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
              aria-label={playing ? '一時停止' : '再生'}
            >
              {playing ? (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              className="vc-player-btn--skip"
              onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + skipSeconds); }}
              aria-label={`${skipSeconds}秒進む`}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z" />
              </svg>
              <span className="vc-player-skip-label">{skipSeconds}</span>
            </button>
          </div>

          {/* 下部: シークバー・時間 */}
          <div className="vc-player-controls-bottom">
            {/* シークプレビューバブル */}
            <div className="vc-seek-wrapper">
              {isSeeking && duration > 0 && (
                <div
                  className="vc-seek-preview"
                  style={{ left: `clamp(60px, ${(seekPreview / duration) * 100}%, calc(100% - 60px))` }}
                >
                  <video
                    ref={previewVideoRef}
                    className="vc-seek-preview-video"
                    src={videoSrc}
                    muted
                    playsInline
                    preload="none"
                  />
                  <span className="vc-seek-preview-time">{formatTime(seekPreview)}</span>
                </div>
              )}
            </div>
            <input
              type="range"
              className="vc-seek-bar"
              min={0}
              max={duration || 1}
              step={0.01}
              value={isSeeking ? seekPreview : (seekTarget ?? currentTime)}
              onMouseDown={() => { setIsSeeking(true); setSeekPreview(seekTarget ?? currentTime); }}
              onTouchStart={() => { setIsSeeking(true); setSeekPreview(seekTarget ?? currentTime); }}
              onChange={e => setSeekPreview(Number(e.target.value))}
              onMouseUp={e => {
                const target = Number((e.target as HTMLInputElement).value);
                const v = videoRef.current;
                if (v) v.currentTime = target;
                setSeekTarget(target);
                setIsSeeking(false);
              }}
              onTouchEnd={e => {
                const v = videoRef.current;
                if (v) v.currentTime = seekPreview;
                setSeekTarget(seekPreview);
                setIsSeeking(false);
                e.stopPropagation();
              }}
              style={duration ? {
                background: (() => {
                  const pos = isSeeking ? seekPreview : (seekTarget ?? currentTime);
                  const played = (pos / duration) * 100;
                  const buffered = (Math.max(bufferedEnd, pos) / duration) * 100;
                  return `linear-gradient(to right,
                    rgba(255,255,255,0.9) ${played}%,
                    rgba(255,255,255,0.4) ${played}%,
                    rgba(255,255,255,0.4) ${buffered}%,
                    rgba(255,255,255,0.2) ${buffered}%)`;
                })(),
              } : undefined}
            />
            <span className="vc-player-time">
              {formatTime(isSeeking ? seekPreview : (seekTarget ?? currentTime))} / {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* 設定モーダル（フルスクリーン時も表示されるようコンテナ内に配置） */}
        {showSettingsMenu && (
          <div className="vc-player-settings-overlay" onClick={() => setShowSettingsMenu(false)}>
            <div className="vc-player-settings-panel" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>設定</span>
                <button className="vc-player-btn" onClick={() => setShowSettingsMenu(false)} aria-label="閉じる">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>

              <p className="vc-settings-section-label">再生速度</p>
              <div className="vc-settings-options" style={{ marginBottom: 20 }}>
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    className={`vc-settings-option${s === speed ? ' vc-settings-option--active' : ''}`}
                    onClick={() => { const v = videoRef.current; if (v) v.playbackRate = s; setSpeed(s); }}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <p className="vc-settings-section-label">ダブルタップスキップ</p>
              <div className="vc-settings-options">
                {[5, 10, 15, 30].map(s => (
                  <button
                    key={s}
                    className={`vc-settings-option${s === skipSeconds ? ' vc-settings-option--active' : ''}`}
                    onClick={() => setSkipSeconds(s)}
                  >
                    {s}秒
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* タイトル・タグ */}
      {videoError === 'codec' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(234,179,8,0.15)', borderBottom: '1px solid rgba(234,179,8,0.3)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p style={{ fontSize: 12, color: '#eab308', margin: 0 }}>
            映像が表示されていません（H.265 / HEVC の可能性）。Chrome の設定 → システム →「ハードウェアアクセラレーション」を有効にすると再生できる場合があります。それでも再生できない場合は Edge ブラウザをお試しください。
          </p>
        </div>
      )}

      <div className="vc-player-info">
        <h2 className="vc-player-title">{fileName}</h2>
        <div className="vc-card-tags" style={{ marginTop: 8 }}>
          {fileTags.map(tag => (
            <span key={tag} className="vc-tag">{tag}</span>
          ))}
          <button
            className="vc-icon-btn vc-tag-edit-btn"
            onClick={() => setShowTagModal(true)}
            aria-label="タグを編集"
            title="タグを編集"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </button>
        </div>
      </div>

      {showTagModal && (
        <TagModal
          file={{ id: fileId, name: fileName } as Parameters<typeof TagModal>[0]['file']}
          currentTags={fileTags}
          allTags={allTags}
          onSave={handleTagSave}
          onClose={() => setShowTagModal(false)}
        />
      )}
    </div>
  );
};
