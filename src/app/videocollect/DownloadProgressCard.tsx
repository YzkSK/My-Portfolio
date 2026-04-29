import { useState, useEffect } from 'react';
import { subscribeTasks, getTasks, cancelDownload, type DownloadTask } from './downloadQueue';

const PHASE_LABEL: Record<string, string> = {
  'fetching':      '取得中',
  'loading-ffmpeg':'圧縮エンジン読み込み中',
  'compressing':   '圧縮中',
  'saving':        '保存中',
  'done':          '保存完了',
  'error':         'エラー',
};

export const DownloadProgressCard = () => {
  const [items, setItems] = useState<DownloadTask[]>(() => [...getTasks().values()]);

  useEffect(() => {
    return subscribeTasks(() => setItems([...getTasks().values()]));
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 80, left: 16, zIndex: 9000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {items.map(task => <TaskCard key={task.fileId} task={task} />)}
    </div>
  );
};

const TaskCard = ({ task }: { task: DownloadTask }) => {
  const { fileId, fileName, phase, progress, errorCode } = task;
  const isActive  = phase !== 'done' && phase !== 'error';
  const isDone    = phase === 'done';
  const isError   = phase === 'error';
  const showBar   = phase === 'fetching' || phase === 'compressing';
  const pct       = Math.round(progress * 100);

  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'rgba(18,18,18,0.96)',
      border: `1px solid ${isDone ? 'rgba(34,197,94,0.35)' : isError ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.12)'}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 240,
      maxWidth: 300,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
          {fileName}
        </span>
        {isActive && (
          <button
            onClick={() => cancelDownload(fileId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 11, padding: '0 0 0 8px', flexShrink: 0 }}
          >
            キャンセル
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isDone ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#22c55e"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        ) : isError ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        ) : (
          <div className="vc-spinner" style={{ width: 13, height: 13, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 11, color: isDone ? '#22c55e' : isError ? '#ef4444' : 'rgba(255,255,255,0.55)' }}>
          {PHASE_LABEL[phase] ?? phase}
          {showBar && pct > 0 ? ` ${pct}%` : ''}
          {isError && errorCode ? ` [${errorCode}]` : ''}
        </span>
      </div>

      {showBar && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 7, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#3b82f6', borderRadius: 2, width: `${pct}%`, transition: 'width 0.3s' }} />
        </div>
      )}
    </div>
  );
};
