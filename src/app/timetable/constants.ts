// ── 型定義 ──────────────────────────────────────────────────
export type TimetableEvent = {
  periodIndex: number;
  name: string;
  room: string;
  note: string;
  colorIdx: number;
  eventId: number;
};

export type Period = {
  label: string;
  start: string;
  end: string;
};

export type Events = Record<string, TimetableEvent[]>;

export type EventModal = { type: 'event'; dateKey: string; periodIndex: number; eventId?: number };
export type SettingsModal = { type: 'settings' };
export type Modal = EventModal | SettingsModal | null;

export type Form = { name: string; room: string; note: string; colorIdx: number };

// ── 定数 ────────────────────────────────────────────────────
export const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const COLORS = [
  { bg: '#64748b', text: '#fff' },
  { bg: '#ef4444', text: '#fff' },
  { bg: '#f97316', text: '#fff' },
  { bg: '#22c55e', text: '#fff' },
  { bg: '#3b82f6', text: '#fff' },
  { bg: '#8b5cf6', text: '#fff' },
  { bg: '#ec4899', text: '#fff' },
  { bg: '#f59e0b', text: '#fff' },
] as const;

export const NOTIFY_OPTIONS = [
  { label: '5分前',  value: 5 },
  { label: '10分前', value: 10 },
  { label: '15分前', value: 15 },
  { label: '30分前', value: 30 },
] as const;

export const DEFAULT_PERIODS: Period[] = [
  { label: '1限', start: '09:00', end: '10:30' },
  { label: '2限', start: '10:45', end: '12:15' },
  { label: '3限', start: '13:00', end: '14:30' },
  { label: '4限', start: '14:45', end: '16:15' },
  { label: '5限', start: '16:30', end: '18:00' },
];

export const SAVE_DEBOUNCE_MS = 800;
export const MS_PER_MINUTE = 60_000;
export const TOAST_DURATION_MS = 3500;

export const firestorePaths = {
  timetableData: (uid: string) => `users/${uid}/timetable/data`,
  pushToken: (uid: string) => `users/${uid}/push/token`,
};

// ── ユーティリティ ──────────────────────────────────────────
export const toKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDays = (date: Date, n: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

export const startOfWeek = (date: Date): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

export const timeToMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// ── 型ガード ─────────────────────────────────────────────────
export function isEventModal(m: Modal): m is EventModal {
  return m?.type === 'event';
}
