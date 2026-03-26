import { Fragment } from 'react';
import { DAY_LABELS, COLORS, toKey, addDays, startOfWeek, type Events, type Period } from '../constants';

type Props = {
  cursor: Date;
  events: Events;
  periods: Period[];
  todayKey: string;
  onDayClick: (date: Date) => void;
  onAdd: (dateKey: string, periodIndex: number) => void;
  onEdit: (dateKey: string, periodIndex: number, eventId: number) => void;
};

export const WeekView = ({ cursor, events, periods, todayKey, onDayClick, onAdd, onEdit }: Props) => {
  const ws = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', gap: 3, minWidth: 480 }}>
        <div />
        {weekDays.map((date, i) => {
          const isTod = toKey(date) === todayKey;
          return (
            <div key={i} onClick={() => onDayClick(date)}
              style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, cursor: 'pointer', background: isTod ? 'var(--tt-tab-active-bg)' : 'var(--tt-bg-subtle)' }}>
              <div style={{ fontSize: 10, color: isTod ? 'var(--tt-text-muted)' : i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : 'var(--tt-text-muted)' }}>{DAY_LABELS[date.getDay()]}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: isTod ? 'var(--tt-tab-active-text)' : 'var(--tt-text)' }}>{date.getDate()}</div>
            </div>
          );
        })}

        {periods.map((period, periodIndex) => (
          <Fragment key={periodIndex}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--tt-bg-subtle)', borderRadius: 8, minHeight: 60, padding: 3, gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tt-text)' }}>{period.label}</span>
              <span style={{ fontSize: 8, color: 'var(--tt-text-muted)', textAlign: 'center', lineHeight: 1.4 }}>{period.start}<br />〜{period.end}</span>
            </div>
            {weekDays.map((date, di) => {
              const key = toKey(date);
              const ev = (events[key] || []).find(e => e.periodIndex === periodIndex);
              const isTod = key === todayKey;
              const c = ev ? COLORS[ev.colorIdx ?? 0] : null;
              return (
                <div key={`${key}-${periodIndex}-${di}`}
                  onClick={() => ev ? onEdit(key, periodIndex, ev.eventId) : onAdd(key, periodIndex)}
                  style={{ minHeight: 60, borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 3px', textAlign: 'center', background: ev ? `var(--tt-event-${ev.colorIdx ?? 0}-bg)` : isTod ? 'var(--tt-today-bg)' : 'var(--tt-bg-card)', border: ev ? 'none' : `1.5px dashed ${isTod ? 'var(--tt-text-muted)' : 'var(--tt-border)'}`, transition: 'opacity 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.8'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                >
                  {ev ? (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 800, color: c!.text, lineHeight: 1.3, wordBreak: 'break-all' }}>{ev.name}</div>
                      {ev.room && <div style={{ fontSize: 8, color: c!.text, opacity: 0.75, marginTop: 1 }}>{ev.room}</div>}
                    </>
                  ) : <div style={{ fontSize: 14, color: isTod ? 'var(--tt-text-muted)' : 'var(--tt-border)' }}>+</div>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
};
