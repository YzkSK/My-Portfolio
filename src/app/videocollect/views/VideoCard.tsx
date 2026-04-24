import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DriveFile } from '../constants';
import { formatDuration, formatDate } from '../constants';

const PREVIEW_DURATION_MS = 10_000;

type Props = {
  file: DriveFile;
  tags: string[];
  accessToken: string;
  onTagEdit: (file: DriveFile) => void;
};

export const VideoCard = ({ file, tags, accessToken, onTagEdit }: Props) => {
  const navigate = useNavigate();
  const duration = file.videoMediaMetadata?.durationMillis;
  const [previewing, setPreviewing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!previewing) return;
    timerRef.current = setTimeout(() => setPreviewing(false), PREVIEW_DURATION_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [previewing]);

  const proxyUrl = import.meta.env.VITE_DRIVE_PROXY_URL as string;
  const previewSrc = `${proxyUrl}/stream/${encodeURIComponent(file.id)}?token=${encodeURIComponent(accessToken)}`;

  const handlePlay = () => {
    navigate(`/app/videocollect/play?id=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`);
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewing(prev => !prev);
  };

  return (
    <div className="vc-card" onClick={handleTitleClick}>
      <div className="vc-card-thumb" onClick={e => { e.stopPropagation(); handlePlay(); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') handlePlay(); }}>
        {previewing ? (
          <video
            className="vc-card-preview-video"
            src={previewSrc}
            autoPlay
            muted
            playsInline
            preload="none"
            onEnded={() => setPreviewing(false)}
          />
        ) : file.thumbnailLink ? (
          <img src={file.thumbnailLink} alt={file.name} loading="lazy" />
        ) : (
          <div className="vc-card-thumb-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
        )}
        {!previewing && (
          <div className="vc-card-play-overlay">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
        {duration && (
          <div className="vc-card-duration">{formatDuration(duration)}</div>
        )}
      </div>

      <div className="vc-card-body">
        <p
          className={`vc-card-name${previewing ? ' vc-card-name--previewing' : ''}`}
          title={previewing ? 'クリックしてプレビューを閉じる' : 'クリックしてプレビュー'}
        >
          {file.name}
          <span className="vc-card-preview-hint" aria-hidden="true">
            {previewing ? '▶ プレビュー中' : '▶ プレビュー'}
          </span>
        </p>
        <p className="vc-card-date">{formatDate(file.modifiedTime)}</p>

        <div className="vc-card-tags">
          {tags.map(tag => (
            <span key={tag} className="vc-tag">{tag}</span>
          ))}
          <button
            className="vc-icon-btn vc-tag-edit-btn"
            onClick={e => { e.stopPropagation(); onTagEdit(file); }}
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
    </div>
  );
};
