import { describe, it, expect } from 'vitest';
import { EMAIL_REGEX } from '@/app/shared/validators';

describe('EMAIL_REGEX', () => {
  it('有効なメールアドレスにマッチする', () => {
    expect(EMAIL_REGEX.test('user@example.com')).toBe(true);
    expect(EMAIL_REGEX.test('user.name+tag@sub.example.co.jp')).toBe(true);
    expect(EMAIL_REGEX.test('a@b.c')).toBe(true);
  });

  it('無効なメールアドレスにはマッチしない', () => {
    expect(EMAIL_REGEX.test('')).toBe(false);
    expect(EMAIL_REGEX.test('notanemail')).toBe(false);
    expect(EMAIL_REGEX.test('@example.com')).toBe(false);
    expect(EMAIL_REGEX.test('user@')).toBe(false);
    expect(EMAIL_REGEX.test('user @example.com')).toBe(false);
    expect(EMAIL_REGEX.test('user@example')).toBe(false);
  });
});
