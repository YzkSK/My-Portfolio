import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date-desc', label: '新しい順' },
  { value: 'date-asc',  label: '古い順' },
  { value: 'name-asc',  label: '名前 A→Z' },
  { value: 'name-desc', label: '名前 Z→A' },
  { value: 'size-desc', label: 'サイズ 大→小' },
  { value: 'size-asc',  label: 'サイズ 小→大' },
];

type Props = {
  allTags: string[];
  activeTags: string[];
  sortKey: SortKey;
  offlineOnly: boolean;
  onApply: (tags: string[], sort: SortKey, offlineOnly: boolean) => void;
  onClose: () => void;
};

export const FilterModal = ({ allTags, activeTags, sortKey, offlineOnly, onApply, onClose }: Props) => {
  const [selectedTags, setSelectedTags] = useState<string[]>(activeTags);
  const [selectedSort, setSelectedSort] = useState<SortKey>(sortKey);
  const [selectedOfflineOnly, setSelectedOfflineOnly] = useState(offlineOnly);

  const toggleTag = (tag: string) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>フィルター・並べ替え</DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 6px' }}>
          <p style={{ fontSize: 11, color: 'var(--vc-text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>並べ替え</p>
          {selectedSort !== 'date-desc' && (
            <button
              style={{ fontSize: 11, color: 'var(--vc-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              onClick={() => setSelectedSort('date-desc')}
            >リセット</button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`vc-tag vc-tag--filter${selectedSort === opt.value ? ' vc-tag--active' : ''}`}
              style={{ fontSize: 13, padding: '5px 12px' }}
              onClick={() => setSelectedSort(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 11, color: 'var(--vc-text-secondary)', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>その他</p>
        <button
          className={`vc-tag vc-tag--filter${selectedOfflineOnly ? ' vc-tag--active' : ''}`}
          style={{ fontSize: 13, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          onClick={() => setSelectedOfflineOnly(v => !v)}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          オフライン保存済み
        </button>

        <p style={{ fontSize: 11, color: 'var(--vc-text-secondary)', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>タグで絞り込み</p>
        {allTags.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--vc-text-secondary)' }}>タグがありません</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`vc-tag vc-tag--filter${selectedTags.includes(tag) ? ' vc-tag--active' : ''}`}
                style={{ fontSize: 13, padding: '5px 12px' }}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <Button variant="outline" size="sm" onClick={() => { setSelectedTags([]); setSelectedOfflineOnly(false); }}>クリア</Button>
          <Button size="sm" onClick={() => { onApply(selectedTags, selectedSort, selectedOfflineOnly); onClose(); }}>適用</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
