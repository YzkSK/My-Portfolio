// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGeminiSession } from '@/app/quiz/modals/GeminiPdfModal';
import { newProblemSet } from '@/app/quiz/constants';

/**
 * Gemini セッション保存・復元フロー 結合テスト
 *
 * parseGeminiSession を中心に、保存→シリアライズ→復元の
 * 一連の流れとエッジケースを検証する。
 */
describe('Gemini セッション保存・復元フロー (結合テスト)', () => {
  const buildSets = () => [
    newProblemSet('英語テスト'),
    newProblemSet('数学テスト'),
  ];

  const buildValidSession = (overrides: Record<string, unknown> = {}) => ({
    step: 'review' as const,
    items: [
      { id: 'item-1', question: '問題1', answer: '答え1', checked: true },
      { id: 'item-2', question: '問題2', answer: '答え2', checked: false },
    ],
    importMode: 'new' as const,
    setName: '英語テスト第1章',
    targetSetId: '',
    verifyIndex: 0,
    verifyFlags: [],
    ...overrides,
  });

  beforeEach(() => {
    localStorage.clear();
  });

  // ── 正常系 ────────────────────────────────────────────────

  it('review ステップの有効なセッションを復元できる', () => {
    const session = buildValidSession({ step: 'review' });
    const result = parseGeminiSession(JSON.stringify(session), buildSets());
    expect(result).not.toBeNull();
    expect(result!.step).toBe('review');
    expect(result!.items).toHaveLength(2);
    expect(result!.items[0].question).toBe('問題1');
  });

  it('verify ステップの有効なセッションを復元できる', () => {
    const session = buildValidSession({ step: 'verify', verifyIndex: 3, verifyFlags: ['item-1'] });
    const result = parseGeminiSession(JSON.stringify(session), buildSets());
    expect(result).not.toBeNull();
    expect(result!.step).toBe('verify');
    expect(result!.verifyIndex).toBe(3);
    expect(result!.verifyFlags).toEqual(['item-1']);
  });

  it('fix ステップの有効なセッションを復元できる', () => {
    const session = buildValidSession({ step: 'fix' });
    const result = parseGeminiSession(JSON.stringify(session), buildSets());
    expect(result).not.toBeNull();
    expect(result!.step).toBe('fix');
  });

  it('items・verifyFlags を含むフルデータを正確にラウンドトリップできる', () => {
    const session = buildValidSession({
      step: 'verify',
      importMode: 'existing',
      setName: 'テスト',
      verifyIndex: 2,
      verifyFlags: ['item-1', 'item-2'],
    });
    const json = JSON.stringify(session);
    localStorage.setItem('gemini-session-uid123', json);
    const raw = localStorage.getItem('gemini-session-uid123')!;
    const result = parseGeminiSession(raw, buildSets());
    expect(result).not.toBeNull();
    expect(result!.importMode).toBe('existing');
    expect(result!.verifyIndex).toBe(2);
    expect(result!.verifyFlags).toEqual(['item-1', 'item-2']);
  });

  // ── targetSetId の解決 ────────────────────────────────────

  it('targetSetId が sets に存在する場合はそのまま使う', () => {
    const sets = buildSets();
    const session = buildValidSession({ targetSetId: sets[1].id });
    const result = parseGeminiSession(JSON.stringify(session), sets);
    expect(result!.resolvedTargetId).toBe(sets[1].id);
  });

  it('targetSetId が sets に存在しない場合は sets[0] にフォールバックする', () => {
    const sets = buildSets();
    const session = buildValidSession({ targetSetId: 'deleted-set-id' });
    const result = parseGeminiSession(JSON.stringify(session), sets);
    expect(result!.resolvedTargetId).toBe(sets[0].id);
  });

  it('sets が空の場合は resolvedTargetId が空文字になる', () => {
    const session = buildValidSession({ targetSetId: 'some-id' });
    const result = parseGeminiSession(JSON.stringify(session), []);
    expect(result!.resolvedTargetId).toBe('');
  });

  // ── 省略フィールドのデフォルト値 ─────────────────────────

  it('verifyIndex が省略されている場合は 0 になる', () => {
    const session = buildValidSession();
    const { verifyIndex: _vi, ...without } = session;
    const result = parseGeminiSession(JSON.stringify(without), buildSets());
    expect(result!.verifyIndex).toBe(0);
  });

  it('verifyFlags が省略されている場合は空配列になる', () => {
    const session = buildValidSession();
    const { verifyFlags: _vf, ...without } = session;
    const result = parseGeminiSession(JSON.stringify(without), buildSets());
    expect(result!.verifyFlags).toEqual([]);
  });

  // ── 異常系 ────────────────────────────────────────────────

  it('step が upload の場合は null を返す', () => {
    const session = buildValidSession({ step: 'upload' });
    expect(parseGeminiSession(JSON.stringify(session), buildSets())).toBeNull();
  });

  it('step が extracting の場合は null を返す', () => {
    const session = buildValidSession({ step: 'extracting' });
    expect(parseGeminiSession(JSON.stringify(session), buildSets())).toBeNull();
  });

  it('items が配列でない場合は null を返す', () => {
    const session = buildValidSession({ items: 'invalid' });
    expect(parseGeminiSession(JSON.stringify(session), buildSets())).toBeNull();
  });

  it('不正な JSON 文字列の場合は null を返す', () => {
    expect(parseGeminiSession('{ not valid json', buildSets())).toBeNull();
  });

  it('空文字列の場合は null を返す', () => {
    expect(parseGeminiSession('', buildSets())).toBeNull();
  });

  it('step フィールドがない場合は null を返す', () => {
    const { step: _s, ...without } = buildValidSession();
    expect(parseGeminiSession(JSON.stringify(without), buildSets())).toBeNull();
  });
});
