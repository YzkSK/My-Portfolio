// ── ユーティリティ ────────────────────────────────────────────
export const getErrorCode = (e: unknown): string => {
  if (e != null && typeof e === 'object' && 'code' in e) return String((e as { code: unknown }).code);
  if (e instanceof Error) return e.message;
  return String(e);
};


// ── 型定義 ──────────────────────────────────────────────────
export type AnswerFormat = 'flashcard' | 'written' | 'choice2' | 'choice4';

export type Problem = {
  id: string;
  question: string;
  answer: string;
  wrongChoices: string[];   // 不正解の選択肢 (choice2: 1件, choice4: 3件)
  answerFormat: AnswerFormat;
  category: string;
  memo: string;
  imageUrl: string;         // 問題画像のダウンロードURL（空文字 = 画像なし）
  createdAt: number;
  bookmarked: boolean;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  correctCount: number;
  attemptCount: number;
};

export type ProblemSet = {
  id: string;
  name: string;
  answerFormat: AnswerFormat;
  problems: Problem[];
  createdAt: number;
  shareCode?: string;
};

export type AddModal       = { type: 'add' };
export type EditModal      = { type: 'edit'; problemId: string };
export type ShareModal     = { type: 'share' };
export type ImportModal    = { type: 'import' };
export type SetCreateModal = { type: 'set-create' };
export type SetEditModal   = { type: 'set-edit'; setId: string };
export type GeminiPdfModal = { type: 'gemini-pdf' };
export type Modal = AddModal | EditModal | ShareModal | ImportModal | SetCreateModal | SetEditModal | GeminiPdfModal | null;

export type QuizMode = 'oneByOne' | 'exam';

export type RecentConfig = {
  id: string;
  setIds: string[];
  setNames: string[];    // 削除されたセットの名前も保持
  mode: QuizMode;
  categoryFilter: string;
  usedAt: number;
};

export type QuizSessionConfig = {
  mode: QuizMode;
  categoryFilter: string;
  // '' = すべて, 'BOOKMARKED' = ブックマークのみ, 'WEAK' = 苦手のみ, その他 = カテゴリ名
};

export type OneByOneSession = {
  mode: 'oneByOne';
  config: QuizSessionConfig;
  queue: Problem[];
  currentIndex: number;
  results: boolean[];
  answers: string[];   // 各問のユーザー回答（flashcard は ''）
  phase: 'answering' | 'revealed' | 'finished';
  writtenInput: string;
  pendingResult: boolean | null;
};

export type ExamSession = {
  mode: 'exam';
  config: QuizSessionConfig;
  queue: Problem[];
  currentIndex: number;
  answers: string[];
  phase: 'answering' | 'reviewing';
  choiceOptionsMap: Record<number, string[]>; // 問題ごとにシャッフルを固定
  startedAt: number;
  timeLimit: number;
  elapsedMs: number | null;
};

export type ActiveSession = OneByOneSession | ExamSession;

// ── 定数 ────────────────────────────────────────────────────
export const SAVE_DEBOUNCE_MS   = 800;
export const TOAST_DURATION_MS  = 3500;
export const EXAM_TIME_LIMIT_MS = 50 * 60 * 1000;
export const EXAM_MAX_PROBLEMS  = 50;
export const MASTER_THRESHOLD   = 5;

export const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  oneByOne: '一問一答',
  exam:     '試験',
};

export const ANSWER_FORMAT_LABELS: Record<AnswerFormat, string> = {
  flashcard: 'フラッシュカード',
  written:   '記述式',
  choice2:   '2択',
  choice4:   '4択',
};

export const WRONG_CHOICES_COUNT: Record<AnswerFormat, number> = {
  flashcard: 0,
  written:   0,
  choice2:   0, // ○/✗ 固定のため不正解選択肢不要
  choice4:   3,
};

export const CHOICE2_OPTIONS = ['○', '✗'] as const;

export const firestorePaths = {
  quizData:      (uid: string) => `users/${uid}/quiz/data`,
  sharedProblem: (code: string) => `sharedProblems/${code}`,
};

// ── 型ガード ─────────────────────────────────────────────────
export function isExamSession(s: ActiveSession): s is ExamSession {
  return s.mode === 'exam';
}

// ── ユーティリティ ──────────────────────────────────────────
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getCategories(problems: Problem[]): string[] {
  return Array.from(new Set(problems.map(p => p.category).filter(Boolean)));
}

export function filterProblems(problems: Problem[], filter: string): Problem[] {
  if (filter === '')           return problems;
  if (filter === 'BOOKMARKED') return problems.filter(p => p.bookmarked);
  if (filter === 'WEAK')       return problems.filter(p => p.attemptCount > 0 && p.consecutiveCorrect === 0);
  return problems.filter(p => p.category === filter);
}

export function isWeak(p: Problem): boolean {
  // 初回不正解 or 2回連続不正解
  return (p.attemptCount === 1 && p.consecutiveWrong === 1) || p.consecutiveWrong >= 2;
}

export function isInvalidProblem(p: Problem): boolean {
  if (!p.question.trim()) return true;
  if (!p.answer.trim()) return true;
  if (p.answerFormat === 'choice4') {
    return p.wrongChoices.length < 3 || p.wrongChoices.some(w => !w.trim());
  }
  return false;
}

export function getInvalidCount(problems: Problem[]): number {
  return problems.filter(isInvalidProblem).length;
}

export function isAnswerCorrect(input: string, answer: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalize(input) === normalize(answer);
}

// 問題に登録された選択肢を返す（choice2 は常に ○/✗ 固定）
export function buildProblemChoices(p: Problem): string[] {
  if (p.answerFormat === 'choice2') return [...CHOICE2_OPTIONS];
  return shuffle([p.answer, ...p.wrongChoices]);
}

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'たった今';
  if (min < 60)  return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day  = Math.floor(hour / 24);
  if (day  < 30) return `${day}日前`;
  return `${Math.floor(day / 30)}ヶ月前`;
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}分${sec}秒`;
}

export function genShareCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function parseRecentConfig(r: Record<string, unknown>): RecentConfig {
  return {
    id: (r.id as string) ?? crypto.randomUUID(),
    setIds: Array.isArray(r.setIds) ? (r.setIds as string[]) : [],
    setNames: Array.isArray(r.setNames) ? (r.setNames as string[]) : [],
    mode: (r.mode as QuizMode) ?? 'oneByOne',
    categoryFilter: (r.categoryFilter as string) ?? '',
    usedAt: (r.usedAt as number) ?? Date.now(),
  };
}

export function newProblemSet(name: string, answerFormat: AnswerFormat = 'written'): ProblemSet {
  return { id: crypto.randomUUID(), name, answerFormat, problems: [], createdAt: Date.now() };
}

export function parseProblemSet(s: Record<string, unknown>): ProblemSet {
  return {
    id: (s.id as string) ?? crypto.randomUUID(),
    name: (s.name as string) ?? '問題集',
    answerFormat: (s.answerFormat as AnswerFormat) ?? 'written',
    problems: Array.isArray(s.problems)
      ? (s.problems as Record<string, unknown>[]).map(parseProblem)
      : [],
    createdAt: (s.createdAt as number) ?? Date.now(),
    ...(s.shareCode ? { shareCode: s.shareCode as string } : {}),
  };
}

export function newProblem(
  question: string,
  answer: string,
  category: string,
  answerFormat: AnswerFormat = 'written',
  wrongChoices: string[] = [],
  memo: string = '',
  imageUrl: string = '',
): Problem {
  return {
    id: crypto.randomUUID(),
    question, answer, wrongChoices, answerFormat, category, memo, imageUrl,
    createdAt: Date.now(),
    bookmarked: false, consecutiveCorrect: 0, consecutiveWrong: 0, correctCount: 0, attemptCount: 0,
  };
}

// Firestore から読んだデータを安全に Problem に変換（後方互換）
export function parseProblem(p: Record<string, unknown>): Problem {
  return {
    id: (p.id as string) ?? '',
    question: (p.question as string) ?? '',
    answer: (p.answer as string) ?? '',
    wrongChoices: Array.isArray(p.wrongChoices) ? (p.wrongChoices as string[]) : [],
    answerFormat: (p.answerFormat as AnswerFormat) ?? 'written',
    category: (p.category as string) ?? '',
    memo: (p.memo as string) ?? '',
    imageUrl: (p.imageUrl as string) ?? '',
    createdAt: (p.createdAt as number) ?? Date.now(),
    bookmarked: (p.bookmarked as boolean) ?? false,
    consecutiveCorrect: (p.consecutiveCorrect as number) ?? 0,
    consecutiveWrong: (p.consecutiveWrong as number) ?? 0,
    correctCount: (p.correctCount as number) ?? 0,
    attemptCount: (p.attemptCount as number) ?? 0,
  };
}
