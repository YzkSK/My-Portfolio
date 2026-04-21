import { useNavigate } from 'react-router-dom';
import type { DriveFile } from '../constants';
import { formatSize, formatDuration, formatDate } from '../constants';

type Props = {
  file: DriveFile;
  tags: string[];
  onTagEdit: (file: DriveFile) => void;
};

export const VideoCard = ({ file, tags, onTagEdit }: Props) => {
  const navigate = useNavigate();
  const duration = file.videoMediaMetadata?.durationMillis;

  const handlePlay = () => {
    navigate(`/app/videocollect/play?id=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`);
  };

  return (
    <div className="vc-card">
      <div className="vc-card-thumb" onClick={handlePlay} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') handlePlay(); }}>
        {file.thumbnailLink ? (
          <img src={file.thumbnailLink} alt={file.name} loading="lazy" />
        ) : (
          <div className="vc-card-thumb-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
        )}
        <div className="vc-card-play-overlay">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        {duration && (
          <div className="vc-card-duration">{formatDuration(duration)}</div>
        )}
      </div>

      <div className="vc-card-body">
        <p className="vc-card-name" title={file.name}>{file.name}</p>
        <div className="vc-card-meta">
          <span>{formatDate(file.modifiedTime)}</span>
          {file.size && (
            <>
              <span>·</span>
              <span>{formatSize(file.size)}</span>
            </>
          )}
        </div>

        {tags.length > 0 && (
          <div className="vc-card-tags">
            {tags.map(tag => (
              <span key={tag} className="vc-tag">{tag}</span>
            ))}
          </div>
        )}

        <div className="vc-card-actions">
          <button
            className="vc-icon-btn"
            onClick={e => { e.stopPropagation(); onTagEdit(file); }}
            aria-label="タグを編集"
            title="タグを編集"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
