import { useAuth } from '../auth/AuthContext';
import { useFirestoreData } from '../shared/useFirestoreData';
import { useFirestoreSave } from '../shared/useFirestoreSave';
import type { SettingsSectionProps } from '../platform/registry';
import {
  DEFAULT_PERIODS,
  NOTIFY_OPTIONS,
  firestorePaths,
  type Period,
  type Events,
} from './constants';

type TimetableSettingsData = {
  events: Events;
  periods: Period[];
  notifyBefore: number;
};

const parse = (raw: Record<string, unknown>): TimetableSettingsData => {
  const periods: Period[] = Array.isArray(raw.periods)
    ? (raw.periods as Record<string, unknown>[]).map(p => ({
        label: String(p.label ?? ''),
        start: String(p.start ?? ''),
        end: String(p.end ?? ''),
      }))
    : DEFAULT_PERIODS;
  const notifyBefore = typeof raw.notifyBefore === 'number' ? raw.notifyBefore : 10;
  return { events: {}, periods, notifyBefore };
};

// addToast は将来の通知フィードバック用に受け取るが現時点では未使用
export const TimetableSettings = ({ addToast: _addToast }: SettingsSectionProps) => {
  const { currentUser } = useAuth();

  const { data, setData, loading } = useFirestoreData({
    currentUser,
    path: currentUser ? firestorePaths.timetableData(currentUser.uid) : '',
    parse,
    loadingKey: 'tt-settings',
    initialData: { events: {}, periods: DEFAULT_PERIODS, notifyBefore: 10 },
  });

  const save = useFirestoreSave<Pick<TimetableSettingsData, 'notifyBefore'>>({
    currentUser,
    path: currentUser ? firestorePaths.timetableData(currentUser.uid) : '',
  });

  if (loading) return <p style={{ fontSize: 13, color: 'var(--app-text-secondary)' }}>読み込み中...</p>;

  const handleNotifyBefore = (value: number) => {
    const next = { ...data, notifyBefore: value };
    setData(next);
    save({ notifyBefore: value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 通知タイミング */}
      <div>
        <div className="app-settings-row">
          <span className="app-settings-row-label">通知タイミング</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {NOTIFY_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => handleNotifyBefore(o.value)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--app-border-input)',
                  background: data.notifyBefore === o.value
                    ? 'var(--app-text-primary)'
                    : 'transparent',
                  color: data.notifyBefore === o.value
                    ? 'var(--app-bg)'
                    : 'var(--app-text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginTop: 6 }}>
          授業開始の何分前に通知するかを設定します。通知のON/OFFは時間割ページから変更できます。
        </p>
      </div>

      {/* 時限設定（表示のみ） */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text-secondary)', marginBottom: 8 }}>
          時限設定
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.periods.map((p, i) => (
            <div
              key={i}
              className="app-settings-profile-row"
              style={{ fontSize: 13 }}
            >
              <span className="app-settings-profile-label">{p.label}</span>
              <span style={{ color: 'var(--app-text-secondary)' }}>
                {p.start} 〜 {p.end}
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginTop: 6 }}>
          時限の時間変更は時間割ページの「⚙️ 時間設定」から行えます。
        </p>
      </div>
    </div>
  );
};
