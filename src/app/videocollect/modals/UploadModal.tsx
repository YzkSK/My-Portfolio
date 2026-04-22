import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DriveFolder } from '../constants';
import { fetchDriveFolders, VC_ERROR_CODES } from '../constants';

type FileStatus = {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
};

const UploadFileItem = ({ fs, uploading, onRemove }: { fs: FileStatus; uploading: boolean; onRemove: () => void }) => {
  const [open, setOpen] = useState(false);
  const hasProgress = fs.status === 'uploading' || fs.status === 'done';

  return (
    <div className="vc-upload-item">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--vc-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fs.file.name}
        </span>
        {fs.status === 'done' && <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }}>完了</span>}
        {fs.status === 'error' && <span style={{ fontSize: 11, color: '#ef4444', flexShrink: 0 }}>失敗</span>}
        {fs.status === 'uploading' && <span style={{ fontSize: 11, color: 'var(--vc-text-secondary)', flexShrink: 0 }}>{fs.progress}%</span>}
        {(fs.status === 'pending' || fs.status === 'error') && !uploading && (
          <button
            onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vc-text-secondary)', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
            aria-label="削除"
          >×</button>
        )}
        {hasProgress && (
          <button
            onClick={() => setOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vc-text-secondary)', padding: '0 2px', flexShrink: 0, fontSize: 10, lineHeight: 1, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-label={open ? '折りたたむ' : '展開する'}
          >▼</button>
        )}
      </div>
      {hasProgress && open && (
        <div className="vc-progress-bar" style={{ marginTop: 6 }}>
          <div
            className="vc-progress-fill"
            style={{ width: `${fs.progress}%`, background: fs.status === 'done' ? '#22c55e' : undefined }}
          />
        </div>
      )}
    </div>
  );
};

type Props = {
  accessToken: string;
  defaultFolders: DriveFolder[];
  onUploaded: () => void;
  onClose: () => void;
  onError: (msg: string) => void;
};

export const UploadModal = ({ accessToken, defaultFolders, onUploaded, onClose, onError }: Props) => {
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(defaultFolders[0]?.id ?? '');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const abortedRef = useRef(false);

  useEffect(() => {
    fetchDriveFolders(accessToken)
      .then(result => {
        setFolders(result);
        if (!selectedFolderId && result.length > 0) setSelectedFolderId(result[0].id);
      })
      .catch(() => { /* フォルダ取得失敗は警告のみ */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f => f.type.startsWith('video/'));
    if (arr.length === 0) return;
    setFileStatuses(prev => [
      ...prev,
      ...arr.map(f => ({ file: f, status: 'pending' as const, progress: 0 })),
    ]);
  };

  const removeFile = (index: number) => {
    setFileStatuses(prev => prev.filter((_, i) => i !== index));
  };

  const updateStatus = (index: number, patch: Partial<FileStatus>) => {
    setFileStatuses(prev => prev.map((fs, i) => i === index ? { ...fs, ...patch } : fs));
  };

  const uploadOne = async (fs: FileStatus, index: number): Promise<boolean> => {
    if (abortedRef.current) return false;

    updateStatus(index, { status: 'uploading', progress: 0 });

    const metadata: Record<string, unknown> = {
      name: fs.file.name,
      mimeType: fs.file.type || 'video/mp4',
    };
    if (selectedFolderId) metadata['parents'] = [selectedFolderId];

    try {
      const initResp = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': fs.file.type || 'video/mp4',
            'X-Upload-Content-Length': String(fs.file.size),
          },
          body: JSON.stringify(metadata),
        },
      );
      if (!initResp.ok) throw new Error(`Init failed: ${initResp.status}`);
      const uploadUrl = initResp.headers.get('Location');
      if (!uploadUrl) throw new Error('No upload URL');

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', fs.file.type || 'video/mp4');
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) updateStatus(index, { progress: Math.round((e.loaded / e.total) * 100) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.onabort = () => reject(new Error('Aborted'));
        xhr.send(fs.file);
      });

      updateStatus(index, { status: 'done', progress: 100 });
      return true;
    } catch (e) {
      if (abortedRef.current) return false;
      console.error('Upload error:', e);
      updateStatus(index, { status: 'error' });
      return false;
    }
  };

  const handleUpload = async () => {
    const pending = fileStatuses.map((fs, i) => ({ fs, i })).filter(({ fs }) => fs.status === 'pending' || fs.status === 'error');
    if (pending.length === 0) return;

    setUploading(true);
    abortedRef.current = false;
    let anySuccess = false;
    let anyError = false;

    for (const { fs, i } of pending) {
      if (abortedRef.current) break;
      const ok = await uploadOne(fs, i);
      if (ok) anySuccess = true;
      else anyError = true;
    }

    setUploading(false);
    xhrRef.current = null;

    if (anySuccess) onUploaded();
    if (anyError && !abortedRef.current) onError(`一部のアップロードに失敗しました [${VC_ERROR_CODES.UPLOAD_FAILED}]`);

    // 全部完了したら自動クローズ
    if (!anyError && !abortedRef.current) onClose();
  };

  const handleClose = () => {
    abortedRef.current = true;
    if (xhrRef.current) xhrRef.current.abort();
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const pendingCount = fileStatuses.filter(fs => fs.status === 'pending' || fs.status === 'error').length;
  const canUpload = !uploading && pendingCount > 0;

  const totalCount = fileStatuses.length;
  const doneCount = fileStatuses.filter(fs => fs.status === 'done').length;
  const overallPct = totalCount === 0 ? 0 : Math.round(fileStatuses.reduce((sum, fs) => sum + fs.progress, 0) / totalCount);
  const showOverall = uploading || doneCount > 0;

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-[480px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>動画をアップロード</DialogTitle>
        </DialogHeader>

        <p style={{ fontSize: 11, color: 'var(--vc-text-secondary)', margin: 0 }}>
          推奨形式: <strong style={{ color: 'var(--vc-text-primary)' }}>H.264 (MP4)</strong>。H.265 / HEVC は Chrome では映像が再生されません。
        </p>

        {/* Drop zone */}
        <div
          className={`vc-dropzone${dragOver ? ' vc-dropzone--over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--vc-text-secondary)' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p style={{ fontSize: 13, color: 'var(--vc-text-secondary)', margin: '6px 0 2px', textAlign: 'center' }}>
            ここにドロップ
          </p>
          <p style={{ fontSize: 12, color: 'var(--vc-text-secondary)', opacity: 0.7 }}>
            またはクリックして選択
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
            disabled={uploading}
          />
        </div>

        {/* Overall progress */}
        {showOverall && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--vc-text-secondary)' }}>
                {doneCount} / {totalCount} 完了
              </span>
              <span style={{ fontSize: 12, color: 'var(--vc-text-secondary)' }}>{overallPct}%</span>
            </div>
            <div className="vc-progress-bar">
              <div
                className="vc-progress-fill"
                style={{ width: `${overallPct}%`, background: doneCount === totalCount ? '#22c55e' : undefined }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        {fileStatuses.length > 0 && (
          <div className="vc-upload-list">
            {fileStatuses.map((fs, i) => (
              <UploadFileItem
                key={i}
                fs={fs}
                uploading={uploading}
                onRemove={() => removeFile(i)}
              />
            ))}
          </div>
        )}

        {/* Folder select */}
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--app-text-secondary)' }}>
            保存先フォルダ
          </label>
          <select
            value={selectedFolderId}
            onChange={e => setSelectedFolderId(e.target.value)}
            disabled={uploading}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 16,
              borderRadius: 8,
              border: '1px solid var(--app-border-input)',
              background: 'var(--app-input-bg)',
              color: 'var(--app-text)',
            }}
          >
            <option value="">マイドライブ（ルート）</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>
            キャンセル
          </Button>
          <Button
            variant="default"
            className="flex-[2]"
            onClick={handleUpload}
            disabled={!canUpload}
          >
            {uploading ? 'アップロード中…' : `アップロード${pendingCount > 1 ? `（${pendingCount}件）` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
