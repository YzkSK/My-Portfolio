// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '@/app/shared/useToast';

describe('useToast (結合テスト)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('addToast でトーストが追加される', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.addToast('Hello'));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].msg).toBe('Hello');
    expect(result.current.toasts[0].type).toBe('normal');
  });

  it('type を指定してトーストを追加できる', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.addToast('エラー発生', 'error');
      result.current.addToast('警告', 'warning');
    });
    expect(result.current.toasts[0].type).toBe('error');
    expect(result.current.toasts[1].type).toBe('warning');
  });

  it('duration 経過後にトーストが自動削除される', () => {
    const { result } = renderHook(() => useToast(100));
    act(() => result.current.addToast('消えるよ'));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('duration 未満ではトーストが残る', () => {
    const { result } = renderHook(() => useToast(500));
    act(() => result.current.addToast('まだいる'));
    act(() => vi.advanceTimersByTime(499));
    expect(result.current.toasts).toHaveLength(1);
  });

  it('複数トーストは追加した順番で並ぶ', () => {
    const { result } = renderHook(() => useToast(500));
    act(() => {
      result.current.addToast('First');
      result.current.addToast('Second');
      result.current.addToast('Third');
    });
    expect(result.current.toasts.map(t => t.msg)).toEqual(['First', 'Second', 'Third']);
  });

  it('タイミングがずれた複数トーストが個別に削除される', () => {
    const { result } = renderHook(() => useToast(200));
    act(() => result.current.addToast('A'));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.addToast('B'));

    expect(result.current.toasts).toHaveLength(2);

    // A だけ duration 経過 → A が削除される
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].msg).toBe('B');

    // B も duration 経過 → B が削除される
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.toasts).toHaveLength(0);
  });
});
