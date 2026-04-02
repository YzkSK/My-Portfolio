import { describe, it, expect } from 'vitest';
import { newProblem, newProblemSet, type Problem, type ProblemSet } from '@/app/quiz/constants';

/**
 * ドラッグ&ドロップ並び替えフロー 結合テスト
 *
 * ProblemList.tsx の applyReorder（スプライス → ID リスト発火）と
 * Quiz.tsx の handleReorder（ID リスト → 再採番）が連携する
 * 並び替え全体フローを検証する。
 *
 * テスト対象ロジック:
 *   1. index によるソート（表示順）
 *   2. ドラッグ&ドロップによる配列スプライス
 *   3. index 再採番（i + 1）
 *   4. getShift（移動中カードの translateY 量）
 */

// ── ヘルパー: ProblemList.tsx の applyReorder と同じアルゴリズム ──────

/** sorted 配列を fromId→toId に並び替え、ID リストを返す */
const applyReorder = (sorted: Problem[], fromId: string, toId: string): string[] => {
  const next = [...sorted];
  const fromIdx = next.findIndex(p => p.id === fromId);
  const toIdx   = next.findIndex(p => p.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return next.map(p => p.id);
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item!);
  return next.map(p => p.id);
};

// ── ヘルパー: Quiz.tsx の handleReorder と同じアルゴリズム ──────────

/** ID リストを問題配列に変換し index を再採番する */
const handleReorder = (orderedIds: string[], problems: Problem[]): Problem[] => {
  const reordered = orderedIds.map(id => problems.find(p => p.id === id)!).filter(Boolean);
  return reordered.map((p, i) => ({ ...p, index: i + 1 }));
};

// ── ヘルパー: ProblemList.tsx / Quiz.tsx の getShift と同じアルゴリズム ──

/** ドラッグ中に i 番目のカードがずれるべき px 量 */
const getShift = (i: number, dragFromIdx: number, dragToIdx: number, slotHeight: number): number => {
  if (dragFromIdx === -1 || dragToIdx === -1 || dragFromIdx === dragToIdx) return 0;
  if (dragFromIdx < dragToIdx && i > dragFromIdx && i <= dragToIdx) return -slotHeight;
  if (dragFromIdx > dragToIdx && i >= dragToIdx && i < dragFromIdx) return  slotHeight;
  return 0;
};

// ── ヘルパー: ProblemList.tsx の sort と同じアルゴリズム ─────────────

const sortByIndex = (problems: Problem[]): Problem[] =>
  [...problems].sort((a, b) => {
    if (a.index && b.index) return a.index - b.index;
    if (a.index) return -1;
    if (b.index) return 1;
    return b.createdAt - a.createdAt;
  });

// ── ヘルパー: Quiz.tsx の handleReorderSets と同じアルゴリズム ────────

const handleReorderSets = (orderedIds: string[], sets: ProblemSet[]): ProblemSet[] =>
  orderedIds.map(id => sets.find(s => s.id === id)!).filter(Boolean);

// ── フィクスチャ ─────────────────────────────────────────────────────

const buildProblems = () => {
  const ps = [
    newProblem('問題A', '答えA', '', 'written'),
    newProblem('問題B', '答えB', '', 'written'),
    newProblem('問題C', '答えC', '', 'written'),
    newProblem('問題D', '答えD', '', 'written'),
  ];
  // index を 1 始まりで付与
  return ps.map((p, i) => ({ ...p, index: i + 1 }));
};

// ─────────────────────────────────────────────────────────────────────
describe('ドラッグ&ドロップ並び替えフロー (結合テスト)', () => {

  // ── 1. index によるソート ─────────────────────────────────────────

  it('index 順に並ぶ（昇順）', () => {
    const ps = buildProblems().reverse(); // 逆順に並べておく
    const sorted = sortByIndex(ps);
    expect(sorted.map(p => p.question)).toEqual(['問題A', '問題B', '問題C', '問題D']);
  });

  it('index=0 の問題は createdAt の新しい順（末尾）になる', () => {
    const ps = buildProblems();
    // C だけ index を 0 に（未設定）
    ps[2] = { ...ps[2]!, index: 0, createdAt: Date.now() };
    const sorted = sortByIndex(ps);
    // 0 は最後に回る（createdAt 降順）
    expect(sorted[sorted.length - 1]!.question).toBe('問題C');
  });

  // ── 2. 前方ドラッグ（0→2: A を C の位置へ）────────────────────────

  it('前方ドラッグ後の順序が正しい', () => {
    const ps = buildProblems();
    const sorted = sortByIndex(ps);                            // [A,B,C,D]
    const ids = applyReorder(sorted, ps[0]!.id, ps[2]!.id);   // A → C の位置
    expect(ids.map(id => sorted.find(p => p.id === id)!.question))
      .toEqual(['問題B', '問題C', '問題A', '問題D']);
  });

  it('前方ドラッグ後に index が 1 始まりで再採番される', () => {
    const ps = buildProblems();
    const sorted = sortByIndex(ps);
    const ids = applyReorder(sorted, ps[0]!.id, ps[2]!.id);
    const result = handleReorder(ids, ps);
    expect(result.map(p => p.index)).toEqual([1, 2, 3, 4]);
    expect(result.map(p => p.question)).toEqual(['問題B', '問題C', '問題A', '問題D']);
  });

  // ── 3. 後方ドラッグ（2→0: C を A の位置へ）────────────────────────

  it('後方ドラッグ後の順序が正しい', () => {
    const ps = buildProblems();
    const sorted = sortByIndex(ps);                            // [A,B,C,D]
    const ids = applyReorder(sorted, ps[2]!.id, ps[0]!.id);   // C → A の位置
    expect(ids.map(id => sorted.find(p => p.id === id)!.question))
      .toEqual(['問題C', '問題A', '問題B', '問題D']);
  });

  it('後方ドラッグ後に index が 1 始まりで再採番される', () => {
    const ps = buildProblems();
    const sorted = sortByIndex(ps);
    const ids = applyReorder(sorted, ps[2]!.id, ps[0]!.id);
    const result = handleReorder(ids, ps);
    expect(result.map(p => p.index)).toEqual([1, 2, 3, 4]);
    expect(result.map(p => p.question)).toEqual(['問題C', '問題A', '問題B', '問題D']);
  });

  // ── 4. 同一位置（no-op）──────────────────────────────────────────

  it('同じ位置へのドラッグは順序を変えない', () => {
    const ps = buildProblems();
    const sorted = sortByIndex(ps);
    const ids = applyReorder(sorted, ps[1]!.id, ps[1]!.id);   // B → B（同一）
    expect(ids.map(id => sorted.find(p => p.id === id)!.question))
      .toEqual(['問題A', '問題B', '問題C', '問題D']);
  });

  // ── 5. getShift ──────────────────────────────────────────────────

  it('前方ドラッグ: 間に挟まるカードが -slotHeight ずれる', () => {
    // dragFrom=0(A) → dragTo=3(D): i=1,2,3 が -sp になる
    const sp = 88;
    expect(getShift(0, 0, 3, sp)).toBe(0);    // A 自身（ドラッグ元）
    expect(getShift(1, 0, 3, sp)).toBe(-sp);  // B → 上へ
    expect(getShift(2, 0, 3, sp)).toBe(-sp);  // C → 上へ
    expect(getShift(3, 0, 3, sp)).toBe(-sp);  // D → 上へ
  });

  it('後方ドラッグ: 間に挟まるカードが +slotHeight ずれる', () => {
    // dragFrom=3(D) → dragTo=0(A): i=0,1,2 が +sp になる
    const sp = 88;
    expect(getShift(0, 3, 0, sp)).toBe(sp);   // A → 下へ
    expect(getShift(1, 3, 0, sp)).toBe(sp);   // B → 下へ
    expect(getShift(2, 3, 0, sp)).toBe(sp);   // C → 下へ
    expect(getShift(3, 3, 0, sp)).toBe(0);    // D 自身（ドラッグ元）
  });

  it('dragFromIdx === dragToIdx のとき全カードのシフトは 0', () => {
    const sp = 88;
    for (let i = 0; i < 4; i++) {
      expect(getShift(i, 2, 2, sp)).toBe(0);
    }
  });

  it('ドラッグ未開始（-1）のとき全カードのシフトは 0', () => {
    const sp = 88;
    for (let i = 0; i < 4; i++) {
      expect(getShift(i, -1, -1, sp)).toBe(0);
    }
  });

  // ── 6. 問題集の並び替え（handleReorderSets）──────────────────────

  it('問題集の前方ドラッグ後の順序が正しい', () => {
    const sets = [
      newProblemSet('英語'),
      newProblemSet('数学'),
      newProblemSet('理科'),
    ];
    // 英語(0) → 理科(2) の位置へ
    const sorted = [...sets];
    const fromId = sets[0]!.id;
    const toId   = sets[2]!.id;
    const nextIds = (() => {
      const next = [...sorted];
      const fi = next.findIndex(s => s.id === fromId);
      const ti = next.findIndex(s => s.id === toId);
      const [moved] = next.splice(fi, 1);
      next.splice(ti, 0, moved!);
      return next.map(s => s.id);
    })();
    const result = handleReorderSets(nextIds, sets);
    expect(result.map(s => s.name)).toEqual(['数学', '理科', '英語']);
  });

  it('問題集の後方ドラッグ後の順序が正しい', () => {
    const sets = [
      newProblemSet('英語'),
      newProblemSet('数学'),
      newProblemSet('理科'),
    ];
    // 理科(2) → 英語(0) の位置へ
    const sorted = [...sets];
    const fromId = sets[2]!.id;
    const toId   = sets[0]!.id;
    const nextIds = (() => {
      const next = [...sorted];
      const fi = next.findIndex(s => s.id === fromId);
      const ti = next.findIndex(s => s.id === toId);
      const [moved] = next.splice(fi, 1);
      next.splice(ti, 0, moved!);
      return next.map(s => s.id);
    })();
    const result = handleReorderSets(nextIds, sets);
    expect(result.map(s => s.name)).toEqual(['理科', '英語', '数学']);
  });

  // ── 7. 全体フロー（index ソート → ドラッグ → 再採番）────────────────

  it('index が不連続な問題でも並び替え後に連番になる', () => {
    const ps = buildProblems();
    // わざと index を 1,3,5,7 に（不連続）
    const withGap = ps.map((p, i) => ({ ...p, index: (i + 1) * 2 - 1 }));
    const sorted = sortByIndex(withGap); // 順序は同じ（1,3,5,7）
    const ids = applyReorder(sorted, withGap[3]!.id, withGap[0]!.id); // D→先頭
    const result = handleReorder(ids, withGap);
    // 再採番後は必ず 1,2,3,4 になる
    expect(result.map(p => p.index)).toEqual([1, 2, 3, 4]);
    expect(result[0]!.question).toBe('問題D');
  });
});
