import { describe, it, expect } from 'vitest';
import { PASSWORD_RULES, getStrength } from '@/app/auth/passwordRules';

describe('PASSWORD_RULES', () => {
  it('8文字以上のルール', () => {
    expect(PASSWORD_RULES[0].test('1234567')).toBe(false);
    expect(PASSWORD_RULES[0].test('12345678')).toBe(true);
  });

  it('大文字を含むルール', () => {
    expect(PASSWORD_RULES[1].test('password')).toBe(false);
    expect(PASSWORD_RULES[1].test('Password')).toBe(true);
  });

  it('小文字を含むルール', () => {
    expect(PASSWORD_RULES[2].test('PASSWORD')).toBe(false);
    expect(PASSWORD_RULES[2].test('Password')).toBe(true);
  });

  it('数字を含むルール', () => {
    expect(PASSWORD_RULES[3].test('Password')).toBe(false);
    expect(PASSWORD_RULES[3].test('Password1')).toBe(true);
  });
});

describe('getStrength', () => {
  it('ルールを0〜1つしか満たさない → 弱い', () => {
    expect(getStrength('abc').label).toBe('弱い');
    expect(getStrength('').label).toBe('弱い');
  });

  it('ルールを2つ満たす → 普通', () => {
    // 8文字以上 + 大文字
    expect(getStrength('ABCDEFGH').label).toBe('普通');
  });

  it('ルールを3つ満たす → 強い', () => {
    // 8文字以上 + 大文字 + 小文字
    expect(getStrength('Abcdefgh').label).toBe('強い');
  });

  it('ルールを4つすべて満たす → とても強い', () => {
    expect(getStrength('Abcdefg1').label).toBe('とても強い');
  });

  it('スコアが score フィールドに反映される', () => {
    expect(getStrength('Abcdefg1').score).toBe(4);
    expect(getStrength('abc').score).toBe(1);
  });
});
