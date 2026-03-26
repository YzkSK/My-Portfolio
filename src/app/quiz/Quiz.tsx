import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import { useSetLoading } from '../shared/AppLoadingContext';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '../shared/AppFooter';
import './quiz.css';
import {
  SAVE_DEBOUNCE_MS, TOAST_DURATION_MS,
  newProblem, newProblemSet, parseProblem, parseProblemSet, firestorePaths, WRONG_CHOICES_COUNT,
  getInvalidCount,
  type Problem, type ProblemSet, type Modal, type AddModal, type EditModal, type AnswerFormat,
} from './constants';
import { ProblemList } from './views/ProblemList';
import { ProblemModal } from './modals/ProblemModal';
import { ProblemSetModal } from './modals/ProblemSetModal';
import { ShareModal } from './modals/ShareModal';
import { ImportModal } from './modals/ImportModal';

export const Quiz = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const setGlobalLoading = useSetLoading();

  const [sets, setSets]               = useState<ProblemSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [modal, setModal]             = useState<Modal>(null);
  const [toasts, setToasts]           = useState<{ id: number; msg: string }[]>([]);
  const [loading, setLoading]         = useState(true);
  const [formError, setFormError]     = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const saveToFirestore = useCallback((data: ProblemSet[]) => {
    if (!currentUser) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const ref = doc(db, firestorePaths.quizData(currentUser.uid));
      await setDoc(ref, { sets: data }, { merge: true });
    }, SAVE_DEBOUNCE_MS);
  }, [currentUser]);

  const addToast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), TOAST_DURATION_MS);
  };

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
  ) => {
    const fmt = activeSet?.answerFormat ?? 'written';
    if (!question.trim() || !answer.trim()) {
      setFormError('問題文と答えは必須です');
      return;
    }
    if (fmt === 'choice4' && wrongChoices.some(w => !w.trim())) {
      setFormError('不正解の選択肢をすべて入力してください');
      return;
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
      return;
    }
    updateActiveSetProblems(next);
    setModal(null);
  };

  const deleteProblem = (id: string) => {
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
    <div className="qz-page">
      <div className="qz-toast-container">
        {toasts.map(t => <div key={t.id} className="qz-toast">{t.msg}</div>)}
      </div>

      <div className="qz-inner">
        {activeSetId === null ? (
          // ── 問題集一覧 ─────────────────────────────────────
          <>
            <div className="qz-header">
              <h1 className="qz-title">問題集</h1>
              <button className="qz-btn" onClick={handleLogout}>ログアウト</button>
            </div>

            <div className="qz-list-header">
              <div className="qz-list-title">マイ問題集 ({sets.length}件)</div>
              <div className="qz-header-actions">
                <button className="qz-btn" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'import' })}>インポート</button>
                <button className="qz-btn qz-btn--primary" onClick={() => setModal({ type: 'set-create' })}>＋ 新規作成</button>
              </div>
            </div>

            {sets.length === 0 ? (
              <div className="qz-empty">
                <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
                <div>問題集がまだありません</div>
                <div style={{ marginTop: 10 }}>
                  <button className="qz-btn qz-btn--primary" onClick={() => setModal({ type: 'set-create' })}>
                    ＋ 問題集を作成する
                  </button>
                </div>
              </div>
            ) : (
              sets.map(s => {
                const invalidCount = getInvalidCount(s.problems);
                return (
                <div key={s.id} className="qz-set-item" onClick={() => setActiveSetId(s.id)}>
                  <div className="qz-set-info">
                    <div className="qz-set-name">{s.name}</div>
                    <div className="qz-set-count">
                      {s.problems.length}問
                      {invalidCount > 0 && <span className="qz-set-invalid"> · ⚠ {invalidCount}件の選択肢が不足</span>}
                    </div>
                  </div>
                  <div className="qz-set-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="qz-btn qz-btn--primary"
                      style={{ fontSize: 12 }}
                      disabled={s.problems.length === 0 || invalidCount > 0}
                      title={invalidCount > 0 ? '選択肢が不足している問題があります' : undefined}
                      onClick={() => navigate(`/app/quiz/play?set=${s.id}`)}
                    >
                      出題する
                    </button>
                    <button
                      className="qz-btn"
                      style={{ fontSize: 12 }}
                      onClick={() => setModal({ type: 'set-edit', setId: s.id })}
                    >
                      編集
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </>
        ) : (
          // ── 問題一覧（アクティブセット内）──────────────────
          <>
            <div className="qz-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 className="qz-title">{activeSet?.name}</h1>
                <button
                  className="qz-btn"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => setModal({ type: 'set-edit', setId: activeSetId! })}
                >
                  名前変更
                </button>
              </div>
              <div className="qz-header-actions">
                <button className="qz-btn" onClick={() => setActiveSetId(null)}>← 一覧</button>
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
          onClose={() => setModal(null)}
        />
      )}

      {(modal?.type === 'add' || modal?.type === 'edit') && currentUser && (
        <ProblemModal
          modal={modal as AddModal | EditModal}
          problems={problems}
          answerFormat={activeSet?.answerFormat ?? 'written'}
          uid={currentUser.uid}
          formError={formError}
          onSave={saveProblem}
          onDelete={deleteProblem}
          onClose={() => setModal(null)}
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

      <AppFooter />
    </div>
  );
};
