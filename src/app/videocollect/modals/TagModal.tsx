import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DriveFile } from '../constants';

type Props = {
  file: DriveFile;
  currentTags: string[];
  allTags?: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
};

export const TagModal = ({ file, currentTags, allTags = [], onSave, onClose }: Props) => {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags(prev => [...prev, trimmed]);
    }
  };

  const addTags = (raw: string) => {
    raw.split(/[\s,]+/).forEach(t => addTag(t));
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      addTags(input);
    }
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  // existing tags not yet added to current tags
  const availableTags = useMemo(
    () => allTags.filter(t => !tags.includes(t)),
    [allTags, tags],
  );

  // predictive suggestions based on input
  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const lower = input.toLowerCase();
    return availableTags.filter(t => t.toLowerCase().includes(lower));
  }, [input, availableTags]);

  // existing tags shown when input is empty (exclude suggestions overlap)
  const existingChips = input.trim() ? [] : availableTags;

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[420px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>タグを編集</DialogTitle>
        </DialogHeader>

        <p
          style={{ fontSize: 12, color: 'var(--vc-text-secondary)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={file.name}
        >
          {file.name}
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '8px 10px',
            border: '1px solid var(--app-border-input)',
            borderRadius: 8,
            background: 'var(--app-input-bg)',
            minHeight: 44,
            cursor: 'text',
          }}
          onClick={() => inputRef.current?.focus()}
        >
          {tags.map(tag => (
            <span
              key={tag}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 99,
                background: 'rgba(59,130,246,0.15)',
                color: 'var(--vc-accent)',
                border: '1px solid rgba(59,130,246,0.3)',
              }}
            >
              {tag}
              <button
                onClick={e => { e.stopPropagation(); removeTag(tag); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: 14 }}
                aria-label={`${tag}を削除`}
              >×</button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (input.trim()) addTags(input); }}
            placeholder={tags.length === 0 ? 'タグを入力（Enter または スペースで追加）' : ''}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              color: 'var(--app-text)',
              flex: 1,
              minWidth: 120,
            }}
          />
        </div>

        {/* suggestions while typing */}
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {suggestions.map(tag => (
              <button
                key={tag}
                onClick={() => { addTag(tag); setInput(''); inputRef.current?.focus(); }}
                className="vc-tag-suggestion"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* existing tags (when not typing) */}
        {existingChips.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11, color: 'var(--vc-text-secondary)', marginBottom: 6 }}>既存のタグ</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {existingChips.map(tag => (
                <button
                  key={tag}
                  onClick={() => { addTag(tag); inputRef.current?.focus(); }}
                  className="vc-tag-suggestion"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--vc-text-secondary)', marginTop: existingChips.length > 0 || suggestions.length > 0 ? 4 : 0 }}>
          Enter・スペースで追加 / Backspace で末尾のタグを削除
        </p>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
          <Button variant="default" className="flex-[2]" onClick={() => onSave(tags)}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
