import { describe, it, expect } from 'vitest';
import {
  isAnswerCorrect,
  filterProblems,
  isInvalidProblem,
  getCategories,
  isWeak,
  getErrorCode,
  formatTime,
  formatElapsed,
  formatRelativeTime,
  parseProblem,
  parseProblemSet,
  newProblem,
  newProblemSet,
  buildProblemChoices,
  isExamSession,
  CHOICE2_OPTIONS,
  type Problem,
  type ActiveSession,
} from '@/app/quiz/constants';

// ── テスト用ヘルパー ──────────────────────────────────────────
const makeProblem = (overrides: Partial<Problem> = {}): Problem => ({
  id: 'test-id',
  question: '問題文',
  answer: '答え',
  wrongChoices: [],
  answerFormat: 'written',
  category: '',
  memo: '',
  imageUrl: '',
  createdAt: 0,
  bookmarked: false,
  consecutiveCorrect: 0,
  consecutiveWrong: 0,
  correctCount: 0,
  attemptCount: 0,
  ...overrides,
});

// ── isAnswerCorrect ───────────────────────────────────────────
describe('isAnswerCorrect', () => {
  it('完全一致', () => {
    expect(isAnswerCorrect('東京', '東京')).toBe(true);
  });

  it('大文字・小文字を区別しない', () => {
    expect(isAnswerCorrect('TOKYO', 'tokyo')).toBe(true);
    expect(isAnswerCorrect('Hello', 'hello')).toBe(true);
  });

  it('前後の空白を無視する', () => {
    expect(isAnswerCorrect('  東京  ', '東京')).toBe(true);
  });

  it('連続する空白を1つに正規化する', () => {
    expect(isAnswerCorrect('東  京', '東 京')).toBe(true);
  });

  it('内容が異なれば false', () => {
    expect(isAnswerCorrect('大阪', '東京')).toBe(false);
    expect(isAnswerCorrect('', '東京')).toBe(false);
  });
});

// ── filterProblems ────────────────────────────────────────────
describe('filterProblems', () => {
  const p1 = makeProblem({ category: '数学', bookmarked: true, attemptCount: 2, consecutiveCorrect: 0 });
  const p2 = makeProblem({ category: '英語', bookmarked: false, attemptCount: 1, consecutiveCorrect: 1 });
  const p3 = makeProblem({ category: '数学', bookmarked: false, attemptCount: 0, consecutiveCorrect: 0 });
  const problems = [p1, p2, p3];

  it("'' → 全件返す", () => {
    expect(filterProblems(problems, '')).toHaveLength(3);
  });

  it("'BOOKMARKED' → ブックマークのみ", () => {
    const result = filterProblems(problems, 'BOOKMARKED');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(p1);
  });

  it("'WEAK' → 苦手問題のみ（attemptCount > 0 かつ consecutiveCorrect === 0）", () => {
    const result = filterProblems(problems, 'WEAK');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(p1);
  });

  it('カテゴリ名 → 該当カテゴリのみ', () => {
    const result = filterProblems(problems, '数学');
    expect(result).toHaveLength(2);
    expect(result.every(p => p.category === '数学')).toBe(true);
  });
});

// ── isInvalidProblem ──────────────────────────────────────────
describe('isInvalidProblem', () => {
  it('正常な問題は false', () => {
    expect(isInvalidProblem(makeProblem())).toBe(false);
  });

  it('question が空なら true', () => {
    expect(isInvalidProblem(makeProblem({ question: '   ' }))).toBe(true);
  });

  it('answer が空なら true', () => {
    expect(isInvalidProblem(makeProblem({ answer: '' }))).toBe(true);
  });

  it('choice4 で wrongChoices が3件未満なら true', () => {
    expect(isInvalidProblem(makeProblem({ answerFormat: 'choice4', wrongChoices: ['a', 'b'] }))).toBe(true);
  });

  it('choice4 で wrongChoices に空文字があれば true', () => {
    expect(isInvalidProblem(makeProblem({ answerFormat: 'choice4', wrongChoices: ['a', 'b', ''] }))).toBe(true);
  });

  it('choice4 で wrongChoices が3件すべて有効なら false', () => {
    expect(isInvalidProblem(makeProblem({ answerFormat: 'choice4', wrongChoices: ['a', 'b', 'c'] }))).toBe(false);
  });
});

// ── getCategories ─────────────────────────────────────────────
describe('getCategories', () => {
  it('カテゴリが重複なく返る', () => {
    const problems = [
      makeProblem({ category: '数学' }),
      makeProblem({ category: '英語' }),
      makeProblem({ category: '数学' }),
    ];
    expect(getCategories(problems)).toEqual(['数学', '英語']);
  });

  it('空カテゴリは除外される', () => {
    const problems = [makeProblem({ category: '' }), makeProblem({ category: '数学' })];
    expect(getCategories(problems)).toEqual(['数学']);
  });
});

// ── isWeak ────────────────────────────────────────────────────
describe('isWeak', () => {
  it('初回不正解（attemptCount=1, consecutiveWrong=1）は苦手', () => {
    expect(isWeak(makeProblem({ attemptCount: 1, consecutiveWrong: 1 }))).toBe(true);
  });

  it('2回連続不正解以上は苦手', () => {
    expect(isWeak(makeProblem({ consecutiveWrong: 2 }))).toBe(true);
    expect(isWeak(makeProblem({ consecutiveWrong: 5 }))).toBe(true);
  });

  it('正解済みは苦手でない', () => {
    expect(isWeak(makeProblem({ consecutiveWrong: 0 }))).toBe(false);
    expect(isWeak(makeProblem({ attemptCount: 3, consecutiveCorrect: 2 }))).toBe(false);
  });
});

// ── getErrorCode ──────────────────────────────────────────────
describe('getErrorCode', () => {
  it('code プロパティを持つオブジェクトからコードを返す', () => {
    expect(getErrorCode({ code: 'auth/user-not-found' })).toBe('auth/user-not-found');
  });

  it('Error インスタンスはメッセージを返す', () => {
    expect(getErrorCode(new Error('something went wrong'))).toBe('something went wrong');
  });

  it('その他は文字列化して返す', () => {
    expect(getErrorCode('unknown')).toBe('unknown');
    expect(getErrorCode(404)).toBe('404');
  });
});

// ── formatTime ────────────────────────────────────────────────
describe('formatTime', () => {
  it('ミリ秒をMM:SS形式に変換する', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(60000)).toBe('01:00');
    expect(formatTime(90000)).toBe('01:30');
    expect(formatTime(3600000)).toBe('60:00');
  });

  it('負値は 00:00 になる', () => {
    expect(formatTime(-1000)).toBe('00:00');
  });

  it('1秒未満の端数は切り上げる', () => {
    expect(formatTime(1)).toBe('00:01');
    expect(formatTime(999)).toBe('00:01');
  });
});

// ── formatElapsed ─────────────────────────────────────────────
describe('formatElapsed', () => {
  it('ミリ秒を「X分Y秒」形式に変換する', () => {
    expect(formatElapsed(0)).toBe('0分0秒');
    expect(formatElapsed(61000)).toBe('1分1秒');
    expect(formatElapsed(3600000)).toBe('60分0秒');
  });
});

// ── formatRelativeTime ────────────────────────────────────────
describe('formatRelativeTime', () => {
  it('1分未満 → たった今', () => {
    expect(formatRelativeTime(Date.now() - 30000)).toBe('たった今');
  });

  it('1〜59分前', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60000)).toBe('5分前');
  });

  it('1〜23時間前', () => {
    expect(formatRelativeTime(Date.now() - 3 * 3600000)).toBe('3時間前');
  });

  it('1〜29日前', () => {
    expect(formatRelativeTime(Date.now() - 2 * 86400000)).toBe('2日前');
  });

  it('30日以上前 → Xヶ月前', () => {
    expect(formatRelativeTime(Date.now() - 60 * 86400000)).toBe('2ヶ月前');
  });
});

// ── parseProblem ──────────────────────────────────────────────
describe('parseProblem', () => {
  it('すべてのフィールドを正しくパースする', () => {
    const raw = {
      id: 'abc',
      question: '問',
      answer: '答',
      wrongChoices: ['x'],
      answerFormat: 'choice4',
      category: 'cat',
      memo: 'memo',
      imageUrl: 'https://example.com/img.png',
      createdAt: 1000,
      bookmarked: true,
      consecutiveCorrect: 3,
      consecutiveWrong: 0,
      correctCount: 5,
      attemptCount: 7,
    };
    const result = parseProblem(raw);
    expect(result).toMatchObject(raw);
  });

  it('欠損フィールドはデフォルト値で補完される', () => {
    const result = parseProblem({});
    expect(result.question).toBe('');
    expect(result.answer).toBe('');
    expect(result.wrongChoices).toEqual([]);
    expect(result.answerFormat).toBe('written');
    expect(result.bookmarked).toBe(false);
    expect(result.consecutiveCorrect).toBe(0);
  });
});

// ── parseProblemSet ───────────────────────────────────────────
describe('parseProblemSet', () => {
  it('正常なデータをパースする', () => {
    const result = parseProblemSet({ id: 's1', name: 'セット', answerFormat: 'flashcard', problems: [], createdAt: 0 });
    expect(result.id).toBe('s1');
    expect(result.name).toBe('セット');
    expect(result.problems).toEqual([]);
  });

  it('shareCode がある場合はセットされる', () => {
    const result = parseProblemSet({ shareCode: 'ABCD1234' });
    expect(result.shareCode).toBe('ABCD1234');
  });

  it('shareCode がない場合はプロパティなし', () => {
    const result = parseProblemSet({});
    expect('shareCode' in result).toBe(false);
  });
});

// ── newProblem / newProblemSet ────────────────────────────────
describe('newProblem', () => {
  it('指定した値で問題を生成する', () => {
    const p = newProblem('Q', 'A', 'cat', 'choice4', ['x', 'y', 'z']);
    expect(p.question).toBe('Q');
    expect(p.answer).toBe('A');
    expect(p.category).toBe('cat');
    expect(p.answerFormat).toBe('choice4');
    expect(p.wrongChoices).toEqual(['x', 'y', 'z']);
  });
});

describe('newProblemSet', () => {
  it('指定した値でセットを生成する', () => {
    const s = newProblemSet('テストセット', 'flashcard');
    expect(s.name).toBe('テストセット');
    expect(s.answerFormat).toBe('flashcard');
    expect(s.problems).toEqual([]);
  });
});

// ── buildProblemChoices ───────────────────────────────────────
describe('buildProblemChoices', () => {
  it('choice2 は常に ○/✗ の固定2択', () => {
    const p = makeProblem({ answerFormat: 'choice2', answer: '○' });
    expect(buildProblemChoices(p)).toEqual([...CHOICE2_OPTIONS]);
  });

  it('choice4 は正解 + wrongChoices の計4択を含む', () => {
    const p = makeProblem({ answerFormat: 'choice4', answer: '正解', wrongChoices: ['A', 'B', 'C'] });
    const choices = buildProblemChoices(p);
    expect(choices).toHaveLength(4);
    expect(choices).toContain('正解');
    expect(choices).toContain('A');
  });
});

// ── isExamSession ─────────────────────────────────────────────
describe('isExamSession', () => {
  it('exam モードは true', () => {
    const s = { mode: 'exam' } as ActiveSession;
    expect(isExamSession(s)).toBe(true);
  });

  it('oneByOne モードは false', () => {
    const s = { mode: 'oneByOne' } as ActiveSession;
    expect(isExamSession(s)).toBe(false);
  });
});
