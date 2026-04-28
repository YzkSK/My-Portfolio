import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DriveFile } from '../constants';

type Props = {
  file: DriveFile;
  onRename: (newName: string) => Promise<void>;
  onClose: () => void;
};

export const RenameModal = ({ file, onRename, onClose }: Props) => {
  const [name, setName] = useState(file.name);
  const [loading, setLoading] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== file.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) { onClose(); return; }
    setLoading(true);
    await onRename(trimmed);
    setLoading(false);
  };

  return (
    <Dialog open={true} onOpenChange={open => { if (!open && !loading) onClose(); }}>
      <DialogContent className="max-w-[480px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>ファイル名を変更</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 16,
              borderRadius: 8,
              border: '1px solid var(--app-border-input)',
              background: 'var(--app-input-bg)',
              color: 'var(--app-text)',
            }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              キャンセル
            </Button>
            <Button type="submit" variant="default" className="flex-[2]" disabled={!canSubmit || loading}>
              {loading ? '変更中…' : '変更'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
