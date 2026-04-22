import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../shared/usePageTitle';
import '../shared/app.css';
import './videocollect.css';
import { type VcAuth, firestorePaths, loadAccessToken, formatTime, VC_ERROR_CODES } from './constants';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const VideoPlayer = () => {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get('id') ?? '';
  const fileName = searchParams.get('name') ?? '動画';
  usePageTitle(fileName);

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ side: 'left' | 'right'; time: number } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    getDoc(doc(db, firestorePaths.vcAuth(currentUser.uid)))
      .then(snap => {
        if (!snap.exists()) {
          setLoadError('Google Drive が連携されていません');
          return null;
        }
        const auth = snap.data() as VcAuth;
        if (!auth.refreshToken) {
          setLoadError('Google Drive が連携されていません');
          return null;
        }
        return loadAccessToken(currentUser.uid, auth);
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
        console.error('VideoPlayer トークン取得エラー:', e);
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
        ? Math.max(0, video.currentTime - 10)
        : Math.min(video.duration || 0, video.currentTime + 10);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { side, time: now };
    }
  }, [showControlsTemporary]);

  const updateBuffered = (v: HTMLVideoElement) => {
    const buf = v.buffered;
    for (let i = 0; i < buf.length; i++) {
      if (buf.start(i) <= v.currentTime + 0.1 && buf.end(i) > v.currentTime) {
        setBufferedEnd(buf.end(i));
        return;
      }
    }
  };

  const handleDownload = () => {
    if (!accessToken) return;
    const proxyUrl = import.meta.env.VITE_DRIVE_PROXY_URL as string;
    const a = document.createElement('a');
    a.href = `${proxyUrl}/stream/${fileId}?token=${encodeURIComponent(accessToken)}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const proxyUrl = import.meta.env.VITE_DRIVE_PROXY_URL as string;
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
        gap: 12,
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.7)',
        flexShrink: 0,
      }}>
        <Link
          to="/app/videocollect"
          style={{ color: '#fff', textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}
          aria-label="戻る"
        >
          ←
        </Link>
        <span style={{
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {fileName}
        </span>
      </div>

      {/* プレイヤー */}
      <div
        ref={containerRef}
        className="vc-player-container"
        style={{ minHeight: 0 }}
        onMouseMove={showControlsTemporary}
        onPointerDown={handlePointerDown}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={videoRef}
          className="vc-player-video"
          src={videoSrc}
          playsInline
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
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
        />

        {/* バッファリングスピナー */}
        {waiting && (
          <div className="vc-spinner-overlay">
            <div className="vc-spinner" />
          </div>
        )}

        {/* コントロールオーバーレイ */}
        <div
          className={`vc-player-controls${showControls ? '' : ' vc-player-controls--hidden'}`}
        >
          <div
            className="vc-player-controls-inner"
            onPointerDown={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
          >
            {/* シークバー */}
            <input
              type="range"
              className="vc-seek-bar"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={e => {
                const v = videoRef.current;
                if (v) v.currentTime = Number(e.target.value);
              }}
              style={duration ? {
                background: (() => {
                  const played = (currentTime / duration) * 100;
                  const buffered = (Math.max(bufferedEnd, currentTime) / duration) * 100;
                  return `linear-gradient(to right,
                    rgba(255,255,255,0.9) ${played}%,
                    rgba(255,255,255,0.4) ${played}%,
                    rgba(255,255,255,0.4) ${buffered}%,
                    rgba(255,255,255,0.2) ${buffered}%)`;
                })(),
              } : undefined}
            />

            {/* ボタン行 */}
            <div className="vc-player-row">
              {/* 再生/停止 */}
              <button
                className="vc-player-btn"
                onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
                aria-label={playing ? '一時停止' : '再生'}
              >
                {playing ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* -10秒 */}
              <button
                className="vc-player-btn"
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.5px' }}
                onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10); }}
                aria-label="-10秒"
              >
                -10s
              </button>

              {/* +10秒 */}
              <button
                className="vc-player-btn"
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.5px' }}
                onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); }}
                aria-label="+10秒"
              >
                +10s
              </button>

              {/* 時間 */}
              <span className="vc-player-time">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div style={{ flex: 1 }} />

              {/* 音量 */}
              <button
                className="vc-player-btn"
                onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}
                aria-label={muted ? 'ミュート解除' : 'ミュート'}
              >
                {muted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                  </svg>
                )}
              </button>

              {/* 速度 */}
              <div style={{ position: 'relative' }}>
                <button
                  className="vc-player-btn"
                  onClick={() => setShowSpeedMenu(p => !p)}
                  style={{ fontSize: 12, padding: '6px 8px', minWidth: 38, fontWeight: 700 }}
                  aria-label="再生速度"
                >
                  {speed}x
                </button>
                {showSpeedMenu && (
                  <div className="vc-speed-menu">
                    {SPEEDS.map(s => (
                      <button
                        key={s}
                        className={`vc-speed-option${s === speed ? ' vc-speed-option--active' : ''}`}
                        onClick={() => {
                          const v = videoRef.current;
                          if (v) v.playbackRate = s;
                          setSpeed(s);
                          setShowSpeedMenu(false);
                        }}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ダウンロード */}
              <button className="vc-player-btn" onClick={handleDownload} aria-label="ダウンロード">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
              </button>

              {/* フルスクリーン */}
              <button className="vc-player-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'フルスクリーン解除' : 'フルスクリーン'}>
                {isFullscreen ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
