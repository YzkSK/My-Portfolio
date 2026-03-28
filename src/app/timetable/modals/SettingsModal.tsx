import { type Period } from '../constants';
import { Button } from '@/components/ui/button';

type Props = {
  settingsPeriods: Period[];
  settingsError: string;
  onPeriodsChange: (periods: Period[]) => void;
  onSave: () => void;
  onClose: () => void;
};

const addMin = (t: string, m: number): string => {
  const [h, mi] = t.split(':').map(Number);
  const total = h * 60 + mi + m;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const SettingsModal = ({ settingsPeriods, settingsError, onPeriodsChange, onSave, onClose }: Props) => {
  const updatePeriod = (i: number, patch: Partial<Period>) => {
    onPeriodsChange(settingsPeriods.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  };

  const addPeriod = () => {
    const last = settingsPeriods[settingsPeriods.length - 1];
    const start = last ? addMin(last.end, 0) : '09:00';
    const end = last ? addMin(last.end, 60) : '10:30';
    onPeriodsChange([...settingsPeriods, { label: `${settingsPeriods.length + 1}限`, start, end }]);
  };

  const removePeriod = (i: number) => {
    onPeriodsChange(settingsPeriods.filter((_, idx) => idx !== i));
  };

  return (
    <div className="tt-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tt-modal tt-modal-settings">
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, color: 'var(--tt-text)' }}>時限・時間の設定</div>
        <div style={{ fontSize: 12, color: 'var(--tt-text-muted)', marginBottom: 18 }}>時限名と開始・終了時刻を自由に編集できます</div>
        {settingsError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10, fontWeight: 600 }}>{settingsError}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {settingsPeriods.map((p, i) => (
            <div key={i} style={{ background: 'var(--tt-bg-subtle)', border: '1px solid var(--tt-border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--tt-text-muted)', fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
                <input value={p.label} onChange={e => updatePeriod(i, { label: e.target.value })}
                  placeholder="例: 1限" style={{ flex: 1, background: 'var(--tt-bg-card)', border: '1px solid var(--tt-border)', borderRadius: 7, padding: '7px 10px', fontSize: 13, fontWeight: 700, outline: 'none', color: 'var(--tt-text)' }} />
                <Button variant="destructive" size="sm" onClick={() => removePeriod(i)}>削除</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--tt-text-muted)' }}>開始</span>
                <input type="time" value={p.start} onChange={e => updatePeriod(i, { start: e.target.value })}
                  style={{ flex: 1, background: 'var(--tt-bg-card)', border: '1px solid var(--tt-border)', borderRadius: 7, padding: '7px 8px', fontSize: 13, outline: 'none', color: 'var(--tt-text)' }} />
                <span style={{ fontSize: 11, color: 'var(--tt-text-muted)' }}>〜</span>
                <span style={{ fontSize: 11, color: 'var(--tt-text-muted)' }}>終了</span>
                <input type="time" value={p.end} onChange={e => updatePeriod(i, { end: e.target.value })}
                  style={{ flex: 1, background: 'var(--tt-bg-card)', border: '1px solid var(--tt-border)', borderRadius: 7, padding: '7px 8px', fontSize: 13, outline: 'none', color: 'var(--tt-text)' }} />
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" className="w-full border-dashed mb-4" onClick={addPeriod}>
          ＋ 時限を追加
        </Button>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
          <Button variant="default" className="flex-[2]" onClick={onSave}>保存</Button>
        </div>
      </div>
    </div>
  );
};
