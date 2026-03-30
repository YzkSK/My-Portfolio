import { describe, it, expect } from 'vitest';
import { normalizeText } from '@/app/quiz/modals/GeminiPdfModal';

describe('normalizeText', () => {
  it('前後の空白を除去する', () => {
    expect(normalizeText('  問題文  ')).toBe('問題文');
  });

  it('ひらがなのルビ（丸括弧）を除去する', () => {
    expect(normalizeText('漢字（かんじ）の読み')).toBe('漢字の読み');
    expect(normalizeText('漢字(かんじ)の読み')).toBe('漢字の読み');
  });

  it('ひらがなのルビ（二重山括弧）を除去する', () => {
    expect(normalizeText('漢字《かんじ》の読み')).toBe('漢字の読み');
  });

  it('連続する半角スペース・タブ・全角スペースを1つの半角スペースに統一する', () => {
    expect(normalizeText('問題　文')).toBe('問題 文');
    expect(normalizeText('問題\t文')).toBe('問題 文');
    expect(normalizeText('問題  文')).toBe('問題 文');
  });

  it('○の表記を統一する（◯・〇 → ○）', () => {
    expect(normalizeText('◯')).toBe('○');
    expect(normalizeText('〇')).toBe('○');
  });

  it('✗の表記を統一する（✕・×・✖など → ✗）', () => {
    expect(normalizeText('✕')).toBe('✗');
    expect(normalizeText('×')).toBe('✗');
    expect(normalizeText('✖')).toBe('✗');
    expect(normalizeText('x')).toBe('✗');
    expect(normalizeText('X')).toBe('✗');
  });

  it('ルビ除去・空白統一・trim を組み合わせて適用する', () => {
    expect(normalizeText('  漢字（かんじ）　の　読み  ')).toBe('漢字 の 読み');
  });

  it('ルビを含まない通常の括弧は除去しない', () => {
    expect(normalizeText('（東京都）')).toBe('（東京都）');
    expect(normalizeText('(Tokyo)')).toBe('(Tokyo)');
  });

  it('空文字はそのまま返す', () => {
    expect(normalizeText('')).toBe('');
  });
});
