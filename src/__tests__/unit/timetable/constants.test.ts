import { describe, it, expect } from 'vitest';
import { toKey, addDays, startOfWeek, timeToMin, isEventModal } from '@/app/timetable/constants';

// ── toKey ─────────────────────────────────────────────────────
describe('toKey', () => {
  it('YYYY-MM-DD 形式に変換する', () => {
    expect(toKey(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(toKey(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('月と日を2桁にゼロパディングする', () => {
    expect(toKey(new Date(2024, 2, 1))).toBe('2024-03-01');
  });
});

// ── addDays ───────────────────────────────────────────────────
describe('addDays', () => {
  it('指定した日数を加算する', () => {
    const base = new Date(2024, 0, 1);
    expect(toKey(addDays(base, 1))).toBe('2024-01-02');
    expect(toKey(addDays(base, 30))).toBe('2024-01-31');
  });

  it('負の値で日数を減算する', () => {
    const base = new Date(2024, 0, 10);
    expect(toKey(addDays(base, -1))).toBe('2024-01-09');
  });

  it('元の Date オブジェクトを変更しない（immutable）', () => {
    const base = new Date(2024, 0, 1);
    addDays(base, 5);
    expect(toKey(base)).toBe('2024-01-01');
  });

  it('月をまたいで正しく計算する', () => {
    const base = new Date(2024, 0, 31);
    expect(toKey(addDays(base, 1))).toBe('2024-02-01');
  });
});

// ── startOfWeek ───────────────────────────────────────────────
describe('startOfWeek', () => {
  it('日曜始まりで週の最初の日（日曜）を返す', () => {
    // 2024-01-03 は水曜日 → その週の日曜は 2023-12-31
    expect(toKey(startOfWeek(new Date(2024, 0, 3)))).toBe('2023-12-31');
  });

  it('日曜日を渡すとその日を返す', () => {
    // 2024-01-07 は日曜日
    expect(toKey(startOfWeek(new Date(2024, 0, 7)))).toBe('2024-01-07');
  });

  it('元の Date オブジェクトを変更しない（immutable）', () => {
    const base = new Date(2024, 0, 3);
    startOfWeek(base);
    expect(toKey(base)).toBe('2024-01-03');
  });
});

// ── timeToMin ─────────────────────────────────────────────────
describe('timeToMin', () => {
  it('HH:MM を分に変換する', () => {
    expect(timeToMin('00:00')).toBe(0);
    expect(timeToMin('01:00')).toBe(60);
    expect(timeToMin('09:30')).toBe(570);
    expect(timeToMin('23:59')).toBe(1439);
  });
});

// ── isEventModal ──────────────────────────────────────────────
describe('isEventModal', () => {
  it("type が 'event' なら true", () => {
    expect(isEventModal({ type: 'event', dateKey: '2024-01-01', periodIndex: 0 })).toBe(true);
  });

  it("type が 'settings' なら false", () => {
    expect(isEventModal({ type: 'settings' })).toBe(false);
  });

  it('null なら false', () => {
    expect(isEventModal(null)).toBe(false);
  });
});
