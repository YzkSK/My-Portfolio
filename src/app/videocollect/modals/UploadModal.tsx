import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DriveFolder } from '../constants';
import { fetchDriveFolders, VC_ERROR_CODES } from '../constants';

type Props = {
  accessToken: string;
  defaultFolders: DriveFolder[];
  onUploaded: () => void;
  onClose: () => void;
  onError: (msg: string) => void;
};

export const UploadModal = ({ accessToken, defaultFolders, onUploaded, onClose, onError }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(defaultFolders[0]?.id ?? '');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    fetchDriveFolders(accessToken)
      .then(result => {
        setFolders(result);
        if (!selectedFolderId && result.length > 0) setSelectedFolderId(result[0].id);
      })
      .catch(() => { /* フォルダ取得失敗は警告のみ */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    try {
      // Step 1: resumable upload セッション開始
      const metadata: Record<string, unknown> = {
        name: file.name,
        mimeType: file.type || 'video/mp4',
      };
      if (selectedFolderId) metadata['parents'] = [selectedFolderId];

      const initResp = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': file.type || 'video/mp4',
            'X-Upload-Content-Length': String(file.size),
          },
          body: JSON.stringify(metadata),
        },
      );

      if (!initResp.ok) throw new Error(`Init failed: ${initResp.status}`);
      const uploadUrl = initResp.headers.get('Location');
      if (!uploadUrl) throw new Error('No upload URL');

      // Step 2: ファイルをアップロード（進捗付き）
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });

      onUploaded();
      onClose();
    } catch (e) {
      console.error('Upload error:', e);
      onError(`アップロードに失敗しました [${VC_ERROR_CODES.UPLOAD_FAILED}]`);
    } finally {
      setUploading(false);
      xhrRef.current = null;
    }
  };

  const handleClose = () => {
    if (uploading && xhrRef.current) xhrRef.current.abort();
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-[420px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>動画をアップロード</DialogTitle>
        </DialogHeader>

        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--app-text-secondary)' }}>
            ファイル
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
            style={{ fontSize: 13, width: '100%' }}
          />
          {file && (
            <p style={{ fontSize: 12, color: 'var(--vc-text-secondary)', marginTop: 4 }}>
              {file.name}
            </p>
          )}
        </div>

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
              fontSize: 13,
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

        {uploading && (
          <div>
            <div className="vc-progress-bar">
              <div className="vc-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--vc-text-secondary)', textAlign: 'center', marginTop: 4 }}>
              {progress}%
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={handleClose} disabled={false}>
            キャンセル
          </Button>
          <Button
            variant="default"
            className="flex-[2]"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? 'アップロード中…' : 'アップロード'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
