import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DriveFolder } from '../constants';
import { fetchDriveFolders, VC_ERROR_CODES } from '../constants';

type BreadcrumbEntry = { id: string | null; name: string };

type Props = {
  accessToken: string;
  selectedFolder: DriveFolder | null;
  onSelect: (folder: DriveFolder | null) => void;
  onClose: () => void;
  onError: (msg: string) => void;
};

export const FolderPickerModal = ({ accessToken, selectedFolder, onSelect, onClose, onError }: Props) => {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [pending, setPending] = useState<DriveFolder | null>(selectedFolder);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([{ id: null, name: 'マイドライブ' }]);
  const [loading, setLoading] = useState(true);

  const currentParentId = breadcrumb[breadcrumb.length - 1]?.id ?? undefined;

  useEffect(() => {
    setLoading(true);
    fetchDriveFolders(accessToken, currentParentId)
      .then(setFolders)
      .catch(() => onError(`フォルダの取得に失敗しました [${VC_ERROR_CODES.FOLDERS_FETCH}]`))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breadcrumb]);

  const navigateTo = (folder: DriveFolder) => {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateToCrumb = (index: number) => {
    setBreadcrumb(prev => prev.slice(0, index + 1));
  };

  const isRootSelected = pending === null;

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[480px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>保存先フォルダを選択</DialogTitle>
        </DialogHeader>

        <div className="vc-breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--vc-text-secondary)' }}>›</span>}
              {i === breadcrumb.length - 1 ? (
                <span className="vc-breadcrumb-current">{crumb.name}</span>
              ) : (
                <button className="vc-breadcrumb-btn" onClick={() => navigateToCrumb(i)}>
                  {crumb.name}
                </button>
              )}
            </span>
          ))}
        </div>

        <div className="vc-folder-list">
          {loading && (
            <p style={{ textAlign: 'center', color: 'var(--vc-text-secondary)', padding: '20px 0', fontSize: 13 }}>
              読み込み中…
            </p>
          )}

          {/* ルートオプション（トップ階層のみ） */}
          {!loading && breadcrumb.length === 1 && (
            <div
              className="vc-folder-item"
              style={{ background: isRootSelected ? 'rgba(59,130,246,0.12)' : undefined }}
              onClick={() => setPending(null)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, color: '#6366f1' }}>
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
              <span style={{ flex: 1, fontSize: 13 }}>マイドライブ（ルート）</span>
              {isRootSelected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--vc-accent)', flexShrink: 0 }}>
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
              )}
            </div>
          )}

          {!loading && folders.length === 0 && breadcrumb.length > 1 && (
            <p style={{ textAlign: 'center', color: 'var(--vc-text-secondary)', padding: '20px 0', fontSize: 13 }}>
              サブフォルダがありません
            </p>
          )}

          {!loading && folders.map(folder => {
            const isSelected = pending?.id === folder.id;
            return (
              <div
                key={folder.id}
                className="vc-folder-item"
                style={{ background: isSelected ? 'rgba(59,130,246,0.12)' : undefined }}
                onClick={() => setPending(folder)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, color: '#f59e0b' }}>
                  <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                </svg>
                <span style={{ flex: 1, fontSize: 13 }}>{folder.name}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--vc-accent)', flexShrink: 0, marginRight: 4 }}>
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                )}
                <button
                  className="vc-folder-navigate"
                  onClick={e => { e.stopPropagation(); navigateTo(folder); }}
                  title="サブフォルダを表示"
                >›</button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
          <Button variant="default" className="flex-[2]" onClick={() => onSelect(pending)}>選択</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
