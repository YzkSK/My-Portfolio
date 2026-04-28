import { describe, it, expect } from 'vitest';
import { getErrorCode, errorMsg } from '@/app/platform/errors';

describe('getErrorCode', () => {
  it('Firebase エラー（code プロパティ）を取得する', () => {
    expect(getErrorCode({ code: 'auth/wrong-password' })).toBe('auth/wrong-password');
  });

  it('Error インスタンスからメッセージを取得する', () => {
    expect(getErrorCode(new Error('something failed'))).toBe('something failed');
  });

  it('文字列をそのまま返す', () => {
    expect(getErrorCode('raw-string')).toBe('raw-string');
  });

  it('null を文字列化する', () => {
    expect(getErrorCode(null)).toBe('null');
  });
});

describe('errorMsg', () => {
  it('メッセージとコードを結合する', () => {
    expect(errorMsg('保存に失敗しました', 'E001')).toBe('保存に失敗しました [E001]');
  });
});
