import { COLORS, toKey, type Events, type Period } from '../constants';

type Props = {
  cursor: Date;
  events: Events;
  periods: Period[];
  todayKey: string;
  onAdd: (dateKey: string, periodIndex: number) => void;
  onEdit: (dateKey: string, periodIndex: number, eventId: number) => void;
};

export const DayView = ({ cursor, events, periods, todayKey, onAdd, onEdit }: Props) => {
  const key = toKey(cursor);
  const dayEvs = events[key] || [];
  const isTod = key === todayKey;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      {periods.map((period, periodIndex) => {
        const ev = dayEvs.find(e => e.periodIndex === periodIndex);
        const c = ev ? COLORS[ev.colorIdx ?? 0] : null;
        return (
          <div key={periodIndex}
            onClick={() => ev ? onEdit(key, periodIndex, ev.eventId) : onAdd(key, periodIndex)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 6, borderRadius: 10, cursor: 'pointer', background: ev ? `var(--tt-event-${ev.colorIdx ?? 0}-bg)` : isTod ? 'var(--tt-today-bg)' : 'var(--tt-bg-card)', border: ev ? 'none' : `1.5px dashed ${isTod ? 'var(--tt-text-muted)' : 'var(--tt-border)'}`, transition: 'opacity 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
          >
            <div style={{ minWidth: 52, textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: ev ? c!.text : 'var(--tt-text)' }}>{period.label}</div>
              <div style={{ fontSize: 9, color: ev ? c!.text : 'var(--tt-text-muted)', opacity: ev ? 0.8 : 1, lineHeight: 1.4 }}>{period.start}<br />〜{period.end}</div>
            </div>
            <div style={{ flex: 1 }}>
              {ev ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c!.text }}>{ev.name}</div>
                  {ev.room && <div style={{ fontSize: 11, color: c!.text, opacity: 0.75 }}>{ev.room}</div>}
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--tt-text-muted)' }}>タップして追加</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
