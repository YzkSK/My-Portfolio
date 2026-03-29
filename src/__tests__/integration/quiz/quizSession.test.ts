import { describe, it, expect } from 'vitest';
import {
  newProblemSet,
  newProblem,
  filterProblems,
  isAnswerCorrect,
  isInvalidProblem,
  getInvalidCount,
  getCategories,
  isWeak,
  buildProblemChoices,
  CHOICE2_OPTIONS,
} from '@/app/quiz/constants';

/**
 * Quiz セッションフロー 結合テスト
 *
 * 問題集の作成 → バリデーション → フィルタ → 回答判定 → 苦手管理 まで
 * 複数の関数を連携させた一連の流れを検証する。
 */
describe('Quiz セッションフロー (結合テスト)', () => {
  // ── セットアップ ─────────────────────────────────────────

  const buildSet = () => {
    const set = newProblemSet('総合テスト', 'written');
    set.problems = [
      newProblem('日本の首都は？', '東京', '地理', 'written'),
      newProblem('1 + 1 = ?', '2', '数学', 'written'),
      newProblem('"apple" の日本語は？', 'りんご', '英語', 'written'),
      newProblem('次の中で正しいものは？', '○', '確認', 'choice2'),
      newProblem('', '答え', 'NG', 'written'),           // 空の問題文 → 無効
      newProblem('問題文', '', 'NG', 'written'),           // 空の答え → 無効
    ];
    return set;
  };

  // ── バリデーション ────────────────────────────────────────

  it('無効な問題が正しく検出される', () => {
    const set = buildSet();
    expect(getInvalidCount(set.problems)).toBe(2);
    expect(set.problems.filter(isInvalidProblem).map(p => p.category)).toEqual(['NG', 'NG']);
  });

  // ── カテゴリ・フィルタ ────────────────────────────────────

  it('カテゴリ一覧が重複なく取得できる', () => {
    const set = buildSet();
    const cats = getCategories(set.problems);
    expect(cats).toContain('地理');
    expect(cats).toContain('数学');
    expect(cats).toContain('英語');
    expect(cats).toContain('確認');
    expect(cats).toContain('NG');
    expect(new Set(cats).size).toBe(cats.length); // 重複なし
  });

  it('カテゴリフィルタで対象問題だけが返る', () => {
    const set = buildSet();
    expect(filterProblems(set.problems, '数学')).toHaveLength(1);
    expect(filterProblems(set.problems, '数学')[0].answer).toBe('2');
  });

  it('全件フィルタ（空文字）は全問題を返す', () => {
    const set = buildSet();
    expect(filterProblems(set.problems, '')).toHaveLength(set.problems.length);
  });

  // ── 回答判定 ─────────────────────────────────────────────

  it('written: 正規化して正誤判定できる', () => {
    const set = buildSet();
    const geoQ = set.problems[0]; // 東京
    expect(isAnswerCorrect('東京', geoQ.answer)).toBe(true);
    expect(isAnswerCorrect('  東京  ', geoQ.answer)).toBe(true);
    expect(isAnswerCorrect('大阪', geoQ.answer)).toBe(false);
  });

  it('choice2: buildProblemChoices が ○/✗ の固定2択を返す', () => {
    const set = buildSet();
    const choiceQ = set.problems[3]; // choice2
    const choices = buildProblemChoices(choiceQ);
    expect(choices).toEqual([...CHOICE2_OPTIONS]);
    expect(isAnswerCorrect(choices[0], choiceQ.answer)).toBe(true); // ○ が正解
  });

  // ── 苦手フラグ管理 ────────────────────────────────────────

  it('初回不正解で苦手フラグが立ち、WEAK フィルタに引っかかる', () => {
    const set = buildSet();
    const p = set.problems[0];

    // 初回不正解をシミュレート
    p.attemptCount = 1;
    p.consecutiveWrong = 1;
    p.consecutiveCorrect = 0;

    expect(isWeak(p)).toBe(true);
    expect(filterProblems(set.problems, 'WEAK')).toContain(p);
  });

  it('連続正解で苦手フラグが解除され、WEAK フィルタから外れる', () => {
    const set = buildSet();
    const p = set.problems[0];

    // 一度苦手にする
    p.attemptCount = 3;
    p.consecutiveWrong = 2;
    p.consecutiveCorrect = 0;
    expect(isWeak(p)).toBe(true);

    // 正解を重ねて苦手解除
    p.consecutiveWrong = 0;
    p.consecutiveCorrect = 3;
    expect(isWeak(p)).toBe(false);
    expect(filterProblems(set.problems, 'WEAK')).not.toContain(p);
  });

  // ── ブックマーク ──────────────────────────────────────────

  it('ブックマーク登録・解除が BOOKMARKED フィルタに反映される', () => {
    const set = buildSet();
    const p = set.problems[1]; // 1+1

    p.bookmarked = true;
    expect(filterProblems(set.problems, 'BOOKMARKED')).toContain(p);

    p.bookmarked = false;
    expect(filterProblems(set.problems, 'BOOKMARKED')).not.toContain(p);
  });

  // ── 全体フロー ────────────────────────────────────────────

  it('有効な問題だけに絞ったうえでカテゴリフィルタを適用できる', () => {
    const set = buildSet();
    const valid = set.problems.filter(p => !isInvalidProblem(p));
    expect(valid).toHaveLength(4);

    const geo = filterProblems(valid, '地理');
    expect(geo).toHaveLength(1);
    expect(isAnswerCorrect('東京', geo[0].answer)).toBe(true);
  });
});
