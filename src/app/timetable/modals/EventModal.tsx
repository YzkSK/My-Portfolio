import { COLORS, type EventModal as EventModalType, type Form, type Period } from '../constants';

const underlineInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'transparent', border: 'none',
  borderBottom: '2px solid #1a1a1a',
  padding: '8px 2px', color: '#1a1a1a', fontSize: 14, outline: 'none',
};

type Props = {
  modal: EventModalType;
  periods: Period[];
  form: Form;
  formError: string;
  isEditing: boolean;
  onFormChange: (f: Form) => void;
  onFormErrorChange: (e: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export const EventModal = ({
  modal, periods, form, formError, isEditing,
  onFormChange, onFormErrorChange, onSave, onDelete, onClose,
}: Props) => {
  const period = periods[modal.periodIndex];

  return (
    <div className="tt-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tt-modal tt-modal-event">
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2, color: '#1a1a1a' }}>
          {modal.dateKey} {period?.label}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
          {period?.start} 〜 {period?.end}
        </div>

        {formError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10, fontWeight: 600 }}>{formError}</div>}

        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>科目名 / 授業名</div>
        <input
          value={form.name}
          onChange={e => { onFormChange({ ...form, name: e.target.value }); onFormErrorChange(''); }}
          placeholder="例：微分積分、第一段階"
          autoFocus
          style={{ ...underlineInput, marginBottom: 18, borderBottomColor: formError && !form.name.trim() ? '#ef4444' : undefined }}
        />

        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>教室 / 場所（任意）</div>
        <input
          value={form.room}
          onChange={e => onFormChange({ ...form, room: e.target.value })}
          placeholder="例：201講義室"
          style={{ ...underlineInput, marginBottom: 20 }}
        />

        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>備考（任意）</div>
        <input
          value={form.note}
          onChange={e => onFormChange({ ...form, note: e.target.value })}
          placeholder="例：教科書持参"
          style={{ ...underlineInput, marginBottom: 20 }}
        />

        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 8 }}>色</div>
        <div style={{ display: 'flex', gap: 7, marginBottom: 24 }}>
          {COLORS.map((c, i) => (
            <div key={i} onClick={() => onFormChange({ ...form, colorIdx: i })}
              style={{ width: 24, height: 24, borderRadius: '50%', background: c.bg, cursor: 'pointer', border: form.colorIdx === i ? '2.5px solid #1a1a1a' : '2.5px solid transparent', outline: form.colorIdx === i ? '2px solid #fff' : 'none', outlineOffset: 1, transform: form.colorIdx === i ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.1s', boxSizing: 'border-box' }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isEditing && (
            <button onClick={onDelete} style={{ padding: '10px 12px', background: '#fff', border: '1px solid #ffcccc', borderRadius: 8, color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>削除</button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: '#f0f0f0', border: 'none', borderRadius: 8, color: '#666', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>キャンセル</button>
          <button onClick={onSave} style={{ flex: 2, padding: 10, background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>保存</button>
        </div>
      </div>
    </div>
  );
};
