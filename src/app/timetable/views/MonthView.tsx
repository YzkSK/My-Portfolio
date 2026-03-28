import { DAY_LABELS, COLORS, toKey, type Events, type Period } from '../constants';

type Props = {
  cursor: Date;
  events: Events;
  periods: Period[];
  todayKey: string;
  onDayClick: (date: Date) => void;
};

export const MonthView = ({ cursor, events, periods, todayKey, onDayClick }: Props) => {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 420 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {DAY_LABELS.map((l, i) => (
            <div key={l} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0', color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : 'var(--tt-text-muted)' }}>{l}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} style={{ height: 72 }} />;
            const key = toKey(date);
            const dayEvents = events[key] || [];
            const isTod = key === todayKey;
            const isSun = date.getDay() === 0;
            const isSat = date.getDay() === 6;
            return (
              <div key={key}
                onClick={() => onDayClick(date)}
                style={{ height: 72, overflow: 'hidden', background: isTod ? 'var(--tt-tab-active-bg)' : 'var(--tt-bg-card)', border: '1px solid var(--tt-border)', borderRadius: 8, padding: '5px 6px', cursor: 'pointer', transition: 'background 0.1s', boxSizing: 'border-box' }}
                onMouseEnter={e => { if (!isTod) (e.currentTarget as HTMLDivElement).style.background = 'var(--tt-bg-subtle)'; }}
                onMouseLeave={e => { if (!isTod) (e.currentTarget as HTMLDivElement).style.background = 'var(--tt-bg-card)'; }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: isTod ? 'var(--tt-tab-active-text)' : isSun ? '#ef4444' : isSat ? '#3b82f6' : 'var(--tt-text)', marginBottom: 3 }}>{date.getDate()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                  {dayEvents.slice(0, 3).map((ev, idx) => {
                    const c = COLORS[ev.colorIdx ?? 0];
                    return (
                      <div key={idx} style={{ background: `var(--tt-event-${ev.colorIdx ?? 0}-bg)`, color: c.text, borderRadius: 3, fontSize: 9, fontWeight: 700, padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {periods[ev.periodIndex]?.label} {ev.name}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && <div style={{ fontSize: 9, color: 'var(--tt-text-muted)' }}>+{dayEvents.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
