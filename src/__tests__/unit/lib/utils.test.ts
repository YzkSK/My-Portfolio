import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('単純なクラス名を結合する', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('falsy な値を除外する', () => {
    const nope = false;
    expect(cn('foo', nope && 'bar', null, undefined, '')).toBe('foo');
  });

  it('条件付きクラスをサポートする', () => {
    const active = true;
    const disabled = false;
    expect(cn('base', active && 'active', disabled && 'disabled')).toBe('base active');
  });

  it('オブジェクト形式をサポートする', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('Tailwind の競合するクラスを後勝ちでマージする', () => {
    // twMerge によりpaddingが後勝ちになる
    expect(cn('p-4', 'p-8')).toBe('p-8');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('競合しないクラスは両方残す', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('引数なしは空文字を返す', () => {
    expect(cn()).toBe('');
  });
});
