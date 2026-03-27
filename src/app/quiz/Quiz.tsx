import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useToast } from '../shared/useToast';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { auth, db, storage } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import { useSetLoading } from '../shared/AppLoadingContext';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '../shared/AppFooter';
import '../shared/app.css';
import './quiz.css';
import {
  SAVE_DEBOUNCE_MS, TOAST_DURATION_MS,
  newProblem, newProblemSet, parseProblem, parseProblemSet, firestorePaths, WRONG_CHOICES_COUNT,
  getInvalidCount, storagePathFromUrl,
  type Problem, type ProblemSet, type Modal, type AddModal, type EditModal, type AnswerFormat,
} from './constants';
import { ProblemList } from './views/ProblemList';
import { ProblemModal } from './modals/ProblemModal';
import { ProblemSetModal } from './modals/ProblemSetModal';
import { ShareModal } from './modals/ShareModal';
import { ImportModal } from './modals/ImportModal';
import { Button } from '@/components/ui/button';
import { AppMenu } from '../shared/AppMenu';
import { usePageTitle } from '../shared/usePageTitle';

export const Quiz = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const setGlobalLoading = useSetLoading();
  usePageTitle('問題集');

  const [sets, setSets]               = useState<ProblemSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [modal, setModal]             = useState<Modal>(null);
  const { toasts, addToast }          = useToast(TOAST_DURATION_MS);
  const [loading, setLoading]         = useState(true);
  const [formError, setFormError]     = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setsRef = useRef<ProblemSet[]>([]);

  useLayoutEffect(() => {
    setGlobalLoading('quiz', true);
    return () => setGlobalLoading('quiz', false);
  }, [setGlobalLoading]);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const ref = doc(db, firestorePaths.quizData(currentUser.uid));
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.sets)) {
            setSets((data.sets as Record<string, unknown>[]).map(parseProblemSet));
          } else if (Array.isArray(data.problems)) {
            // 旧データ移行: problems → デフォルトセット
            const migrated = newProblemSet('問題集');
            migrated.problems = (data.problems as Record<string, unknown>[]).map(parseProblem);
            setSets([migrated]);
          }
        }
      } catch (e) {
        console.error('Quiz Firestore読み込みエラー:', e);
      } finally {
        setLoading(false);
        setGlobalLoading('quiz', false);
      }
    })();
  }, [currentUser]);

  useEffect(() => { setsRef.current = sets; }, [sets]);

  const cleanupImages = useCallback(async (guardUrl: string) => {
    if (!currentUser) return;
    const usedPaths = new Set(
      setsRef.current
        .flatMap(s => s.problems)
        .map(p => p.imageUrl ? storagePathFromUrl(p.imageUrl) : null)
        .filter((p): p is string => p !== null),
    );
    // setsRef が古い場合でも guardUrl のファイルは絶対に削除しない
    const guardPath = storagePathFromUrl(guardUrl);
    if (guardPath) usedPaths.add(guardPath);
    console.debug('[cleanupImages] guardUrl=%s guardPath=%s usedPaths=%o', guardUrl, guardPath, [...usedPaths]);
    try {
      const { items } = await listAll(ref(storage, `quiz-images/${currentUser.uid}`));
      console.debug('[cleanupImages] storage items: %o', items.map(i => i.fullPath));
      const toDelete = items.filter(item => !usedPaths.has(item.fullPath));
      console.debug('[cleanupImages] to delete: %o', toDelete.map(i => i.fullPath));
      await Promise.all(
        toDelete.map(item =>
          deleteObject(item)
            .then(() => console.debug('[cleanupImages] deleted: %s', item.fullPath))
            .catch(e => console.warn('[cleanupImages] delete failed: %s', item.fullPath, e)),
        ),
      );
    } catch (e) {
      console.warn('[cleanupImages] listAll failed:', e);
    }
  }, [currentUser]);

  const saveToFirestore = useCallback((data: ProblemSet[]) => {
    if (!currentUser) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const ref = doc(db, firestorePaths.quizData(currentUser.uid));
      await setDoc(ref, { sets: data }, { merge: true });
    }, SAVE_DEBOUNCE_MS);
  }, [currentUser]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/app/login');
  };

  // ── 問題集 CRUD ──────────────────────────────────────────
  const createSet = (name: string, answerFormat: AnswerFormat = 'written') => {
    const next = [...sets, newProblemSet(name, answerFormat)];
    setSets(next);
    saveToFirestore(next);
    setModal(null);
  };

  const updateSet = (setId: string, name: string, answerFormat: AnswerFormat) => {
    const next = sets.map(s => {
      if (s.id !== setId) return s;
      // 形式が変わったら全問題の answerFormat を同期し、不要な wrongChoices をクリア
      const problems = s.answerFormat !== answerFormat
        ? s.problems.map(p => ({
            ...p,
            answerFormat,
            wrongChoices: WRONG_CHOICES_COUNT[answerFormat] === 0 ? [] : p.wrongChoices,
          }))
        : s.problems;
      return { ...s, name, answerFormat, problems };
    });
    setSets(next);
    saveToFirestore(next);
    setModal(null);
  };

  const deleteSet = (setId: string) => {
    const next = sets.filter(s => s.id !== setId);
    setSets(next);
    saveToFirestore(next);
    if (activeSetId === setId) setActiveSetId(null);
    setModal(null);
  };

  const resetSetStats = (setId: string) => {
    const next = sets.map(s => s.id !== setId ? s : {
      ...s,
      problems: s.problems.map(p => ({ ...p, attemptCount: 0, correctCount: 0, consecutiveCorrect: 0, consecutiveWrong: 0 })),
    });
    setSets(next);
    saveToFirestore(next);
  };

  // ── 問題 CRUD（アクティブセット内）────────────────────────
  const activeSet  = sets.find(s => s.id === activeSetId) ?? null;
  const problems   = activeSet?.problems ?? [];

  const updateActiveSetProblems = (updated: Problem[]) => {
    const next = sets.map(s => s.id === activeSetId ? { ...s, problems: updated } : s);
    setSets(next);
    saveToFirestore(next);
  };

  const openAdd  = () => { setFormError(''); setModal({ type: 'add' }); };
  const openEdit = (id: string) => { setFormError(''); setModal({ type: 'edit', problemId: id }); };

  const saveProblem = (
    question: string, answer: string, category: string, wrongChoices: string[], memo: string, imageUrl: string,
  ): boolean => {
    const fmt = activeSet?.answerFormat ?? 'written';
    if (!question.trim() || !answer.trim()) {
      setFormError('問題文と答えは必須です');
      return false;
    }
    if (fmt === 'choice4' && wrongChoices.some(w => !w.trim())) {
      setFormError('不正解の選択肢をすべて入力してください');
      return false;
    }
    let next: Problem[];
    if (modal?.type === 'add') {
      next = [...problems, newProblem(question.trim(), answer.trim(), category.trim(), fmt, wrongChoices, memo, imageUrl)];
    } else if (modal?.type === 'edit') {
      next = problems.map(p =>
        p.id === modal.problemId
          ? { ...p, question: question.trim(), answer: answer.trim(), category: category.trim(), answerFormat: fmt, wrongChoices, memo, imageUrl }
          : p
      );
    } else {
      return false;
    }
    updateActiveSetProblems(next);
    setModal(null);
    return true;
  };

  const deleteProblem = (id: string) => {
    const problem = problems.find(p => p.id === id);
    if (problem?.imageUrl) {
      const usedElsewhere = sets.flatMap(s => s.problems).some(p => p.id !== id && p.imageUrl === problem.imageUrl);
      console.debug('[deleteProblem] id=%s imageUrl=%s usedElsewhere=%s', id, problem.imageUrl, usedElsewhere);
      if (!usedElsewhere) {
        deleteObject(ref(storage, problem.imageUrl))
          .then(() => console.debug('[deleteProblem] image deleted'))
          .catch(e => console.warn('[deleteProblem] image delete failed:', e));
      }
    }
    updateActiveSetProblems(problems.filter(p => p.id !== id));
    setModal(null);
  };

  const toggleBookmark = (id: string) => {
    updateActiveSetProblems(problems.map(p => p.id === id ? { ...p, bookmarked: !p.bookmarked } : p));
  };

  const handleImport = (imported: Problem[], title: string) => {
    const s = newProblemSet(title || 'インポートした問題集');
    s.problems = imported;
    const next = [...sets, s];
    setSets(next);
    saveToFirestore(next);
    setModal(null);
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e0e0e0] px-[14px] pt-5 pb-[120px]">
      <div className="qz-toast-container">
        {toasts.map(t => <div key={t.id} className="qz-toast">{t.msg}</div>)}
      </div>

      <div className="max-w-[640px] mx-auto">
        {activeSetId === null ? (
          // ── 問題集一覧 ─────────────────────────────────────
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <AppMenu />
                <h1 className="text-[1.3rem] font-black m-0 text-[#1a1a1a] dark:text-[#e0e0e0]">問題集</h1>
              </div>
              <Button variant="outline" onClick={handleLogout}>ログアウト</Button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black text-[#1a1a1a] dark:text-[#e0e0e0]">マイ問題集 ({sets.length}件)</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setModal({ type: 'import' })}>インポート</Button>
                <Button variant="default" onClick={() => setModal({ type: 'set-create' })}>＋ 新規作成</Button>
              </div>
            </div>

            {sets.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                <span className="text-[32px] block mb-3">📚</span>
                問題集がまだありません
                <span className="block mt-2.5">
                  <Button variant="default" onClick={() => setModal({ type: 'set-create' })}>
                    ＋ 問題集を作成する
                  </Button>
                </span>
              </p>
            ) : (
              sets.map(s => {
                const invalidCount = getInvalidCount(s.problems);
                return (
                <div key={s.id} className="qz-set-item" onClick={() => setActiveSetId(s.id)}>
                  <div className="qz-set-info">
                    <div className="qz-set-name">{s.name}</div>
                    <div className="qz-set-count">
                      {s.problems.length}問
                      {invalidCount > 0 && <span className="text-amber-500 text-[12px] font-semibold"> · ⚠ {invalidCount}件の選択肢が不足</span>}
                    </div>
                  </div>
                  <div className="qz-set-actions" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModal({ type: 'set-edit', setId: s.id })}
                    >
                      編集
                    </Button>
                  </div>
                </div>
                );
              })
            )}
          </>
        ) : (
          // ── 問題一覧（アクティブセット内）──────────────────
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <AppMenu />
                <h1 className="text-[1.3rem] font-black m-0 text-[#1a1a1a] dark:text-[#e0e0e0]">{activeSet?.name}</h1>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModal({ type: 'set-edit', setId: activeSetId! })}
                >
                  名前変更
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setActiveSetId(null)}>← 一覧</Button>
              </div>
            </div>

            <ProblemList
              problems={problems}
              onAdd={openAdd}
              onEdit={openEdit}
              onShare={() => setModal({ type: 'share' })}
              onToggleBookmark={toggleBookmark}
            />
          </>
        )}
      </div>

      {/* 問題集作成・編集モーダル */}
      {(modal?.type === 'set-create' || modal?.type === 'set-edit') && (
        <ProblemSetModal
          modal={modal}
          sets={sets}
          onSave={(name, answerFormat) => {
            if (modal.type === 'set-create') createSet(name, answerFormat);
            else updateSet(modal.setId, name, answerFormat);
          }}
          onDelete={modal.type === 'set-edit' ? () => deleteSet(modal.setId) : undefined}
          onReset={modal.type === 'set-edit' ? () => resetSetStats(modal.setId) : undefined}
          onClose={() => setModal(null)}
        />
      )}

      {(modal?.type === 'add' || modal?.type === 'edit') && currentUser && (
        <ProblemModal
          modal={modal as AddModal | EditModal}
          problems={problems}
          allProblems={sets.flatMap(s => s.problems)}
          answerFormat={activeSet?.answerFormat ?? 'written'}
          uid={currentUser.uid}
          formError={formError}
          onSave={saveProblem}
          onDelete={deleteProblem}
          onClose={() => setModal(null)}
          addToast={addToast}
          onCleanupImages={cleanupImages}
        />
      )}
      {modal?.type === 'share' && currentUser && (
        <ShareModal
          problems={problems}
          uid={currentUser.uid}
          defaultTitle={activeSet?.name}
          existingShareCode={activeSet?.shareCode}
          onShareCodeSaved={(code) => {
            if (!activeSetId) return;
            const next = sets.map(s => s.id === activeSetId ? { ...s, shareCode: code } : s);
            setSets(next);
            saveToFirestore(next);
          }}
          onClose={() => setModal(null)}
          addToast={addToast}
        />
      )}
      {modal?.type === 'import' && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setModal(null)}
          addToast={addToast}
        />
      )}

      {activeSetId === null && sets.length > 0 && (
        <div className="fixed bottom-[56px] left-0 right-0 px-[14px] flex justify-center pointer-events-none">
          <Button className="w-full max-w-[640px] pointer-events-auto" variant="default" onClick={() => navigate('/app/quiz/play')}>
            回答する
          </Button>
        </div>
      )}

      <AppFooter />
    </div>
  );
};
