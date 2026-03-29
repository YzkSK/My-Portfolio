import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useToast } from '../shared/useToast';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { auth, db, messaging } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import '../shared/app.css';
import './timetable.css';
import { AppFooter } from '../shared/AppFooter';
import { useSetLoading } from '../shared/AppLoadingContext';
import {
  DEFAULT_PERIODS, DAY_LABELS, NOTIFY_OPTIONS,
  SAVE_DEBOUNCE_MS, MS_PER_MINUTE, TOAST_DURATION_MS,
  toKey, addDays, startOfWeek, timeToMin, isEventModal, firestorePaths,
  type TimetableEvent, type Period, type Events, type Modal, type Form,
} from './constants';
import { MonthView } from './views/MonthView';
import { WeekView } from './views/WeekView';
import { DayView } from './views/DayView';
import { EventModal } from './modals/EventModal';
import { SettingsModal } from './modals/SettingsModal';
import { AppMenu } from '../shared/AppMenu';
import { usePageTitle } from '../shared/usePageTitle';
import { DbErrorBanner } from '../shared/DbErrorBanner';
import { Button } from '@/components/ui/button';

const NOTIFY_ERROR_CODES = {
  SW_NOT_READY:    'E001',
  TOKEN_FETCH:     'E002',
  TOKEN_SAVE:      'E003',
  TOKEN_DELETE:    'E004',
  TOKEN_DB_DELETE: 'E005',
} as const;

export const Timetable = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  usePageTitle('時間割');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toKey(today);

  const [view, setView] = useState<'month' | 'week' | 'day'>('week');
  const [cursor, setCursor] = useState(new Date(today));
  const [events, setEvents] = useState<Events>({});
  const [periods, setPeriods] = useState<Period[]>(DEFAULT_PERIODS);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<Form>({ name: '', room: '', note: '', colorIdx: 0 });
  const [formError, setFormError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [notifyBefore, setNotifyBefore] = useState(10);
  const [notifyEnabled, setNotifyEnabled] = useState(() => {
    const saved = localStorage.getItem('notifyEnabled') === 'true';
    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    return saved && perm === 'granted';
  });
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const { toasts, addToast } = useToast(TOAST_DURATION_MS);
  const [showNotifyPicker, setShowNotifyPicker] = useState(false);
  const [settingsPeriods, setSettingsPeriods] = useState<Period[]>(DEFAULT_PERIODS);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [nextNotify, setNextNotify] = useState<{
    label: string; name: string; start: string; notifyAt: string; pushReady: boolean;
  } | null>(null);
  const [tokenVersion, setTokenVersion] = useState(0);
  const [notifyToggling, setNotifyToggling] = useState(false);
  const setGlobalLoading = useSetLoading();
  const scheduledRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTokenRef = useRef<string>('');

  // ── Firestoreローディングをグローバルに通知 ──────────────
  useLayoutEffect(() => {
    setGlobalLoading('timetable', true);
    return () => setGlobalLoading('timetable', false);
  }, [setGlobalLoading]);

  // ── Service Worker 登録 ─────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const params = new URLSearchParams({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
    navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`).then(async (sw) => {
      if (notifyEnabled) {
        try {
          const token = await getToken(messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: sw,
          });
          currentTokenRef.current = token;
        } catch { /* トークン取得失敗は無視 */ }
      }
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firestore 読み込み ──────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const ref = doc(db, firestorePaths.timetableData(currentUser.uid));
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.events) {
            // pi/_idx → periodIndex/eventId への移行処理
            const migrated: Events = {};
            for (const [key, evs] of Object.entries(data.events)) {
              migrated[key] = (evs as Record<string, unknown>[]).map(ev => ({
                periodIndex: (ev.periodIndex ?? ev.pi) as number,
                eventId: (ev.eventId ?? ev._idx) as number,
                name: ev.name as string,
                room: (ev.room ?? '') as string,
                note: (ev.note ?? '') as string,
                colorIdx: (ev.colorIdx ?? 0) as number,
              }));
            }
            setEvents(migrated);
          }
          if (data.periods?.length > 0) setPeriods(data.periods);
          if (data.notifyBefore) setNotifyBefore(data.notifyBefore);
        }
      } catch (e) {
        console.error('Firestore読み込みエラー:', e);
        setDbError(true);
      } finally {
        setLoading(false);
        setGlobalLoading('timetable', false);
      }
    })();
  }, [currentUser]);

  // ── Firestore 保存（デバウンス） ────────────────────────
  const saveToFirestore = useCallback((
    eventsData: Events,
    periodsData: Period[],
    notifyBeforeData: number,
  ) => {
    if (!currentUser) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const ref = doc(db, firestorePaths.timetableData(currentUser.uid));
        await setDoc(ref, { events: eventsData, periods: periodsData, notifyBefore: notifyBeforeData });
        // 保存完了後にSW側の次の予定チェックを再実行
        setTokenVersion(v => v + 1);
      } catch (e) {
        console.error('Timetable: Firestore保存失敗', e);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [currentUser, setTokenVersion]);

  // ── 通知 ────────────────────────────────────────────────
  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      addToast('このブラウザは通知非対応です');
      return false;
    }
    const r = await Notification.requestPermission();
    setPermission(r);
    return r === 'granted';
  };

  const savePushToken = async (token: string) => {
    if (!currentUser) return;
    currentTokenRef.current = token;
    const ref = doc(db, firestorePaths.pushTokenDoc(currentUser.uid, token));
    await setDoc(ref, { token, notifyBefore });
  };

  const removePushToken = async () => {
    if (!currentUser || !currentTokenRef.current) return;
    const ref = doc(db, firestorePaths.pushTokenDoc(currentUser.uid, currentTokenRef.current));
    await deleteDoc(ref);
    currentTokenRef.current = '';
  };

  const toggleNotify = async () => {
    setNotifyToggling(true);
    try {
      if (!notifyEnabled) {
        const granted = permission === 'granted' || await requestPermission();
        if (granted) {
          let sw: ServiceWorkerRegistration;
          try {
            sw = await navigator.serviceWorker.ready;
          } catch (e) {
            console.error('SW準備失敗:', e);
            addToast(`通知の設定に失敗しました [${NOTIFY_ERROR_CODES.SW_NOT_READY}]`, 'error');
            return;
          }
          let token: string;
          try {
            token = await getToken(messaging, {
              vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
              serviceWorkerRegistration: sw,
            });
            currentTokenRef.current = token;
          } catch (e) {
            console.error('FCMトークン取得失敗:', e);
            addToast(`通知の設定に失敗しました [${NOTIFY_ERROR_CODES.TOKEN_FETCH}]`, 'error');
            return;
          }
          try {
            await savePushToken(token);
          } catch (e) {
            console.error('トークン保存失敗:', e);
            addToast(`通知の設定に失敗しました [${NOTIFY_ERROR_CODES.TOKEN_SAVE}]`, 'error');
            return;
          }
          setNotifyEnabled(true);
          localStorage.setItem('notifyEnabled', 'true');
          setTokenVersion(v => v + 1);
          addToast('通知をオンにしました');
        } else {
          addToast('通知が許可されていません', 'warning');
        }
      } else {
        setNotifyEnabled(false);
        localStorage.setItem('notifyEnabled', 'false');
        Object.values(scheduledRef.current).forEach(clearTimeout);
        scheduledRef.current = {};
        try {
          await deleteToken(messaging);
        } catch (e) {
          console.error('FCMトークン削除失敗:', e);
          addToast(`クリーンアップに失敗しました [${NOTIFY_ERROR_CODES.TOKEN_DELETE}]`, 'warning');
        }
        try {
          await removePushToken();
        } catch (e) {
          console.error('Firestoreトークン削除失敗:', e);
          addToast(`クリーンアップに失敗しました [${NOTIFY_ERROR_CODES.TOKEN_DB_DELETE}]`, 'warning');
        }
        addToast('通知をオフにしました');
      }
    } finally {
      setNotifyToggling(false);
    }
  };

  useEffect(() => {
    const unsub = onMessage(messaging, (payload) => {
      const title = payload.data?.title ?? payload.notification?.title ?? '時間割';
      const body = payload.data?.body ?? payload.notification?.body ?? '';
      if (permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, { body });
        }).catch((e) => { console.error('フォアグラウンド通知表示失敗:', e); });
      }
    });
    return unsub;
  }, [permission]);

  // ── 次の通知予定を計算（SWのpush subscriptionで配信可否も確認） ──
  useEffect(() => {
    if (!notifyEnabled || permission !== 'granted') {
      setNextNotify(null);
      return;
    }
    const compute = async () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const key = toKey(now);
      const sorted = [...(events[key] ?? [])].sort((a, b) => {
        const pA = periods[a.periodIndex];
        const pB = periods[b.periodIndex];
        return (pA ? timeToMin(pA.start) : 0) - (pB ? timeToMin(pB.start) : 0);
      });

      // 次に通知されるイベントを探す
      let found: typeof nextNotify = null;
      for (const ev of sorted) {
        const p = periods[ev.periodIndex];
        if (!p) continue;
        const notifyAtMin = timeToMin(p.start) - notifyBefore;
        if (notifyAtMin > nowMin) {
          const hh = String(Math.floor(notifyAtMin / 60)).padStart(2, '0');
          const mm = String(notifyAtMin % 60).padStart(2, '0');

          // 表示されたイベントに対してSWがプッシュ通知を送れるか確認
          let pushReady = false;
          try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub !== null && currentUser && currentTokenRef.current) {
              const snap = await getDoc(doc(db, firestorePaths.pushTokenDoc(currentUser.uid, currentTokenRef.current)));
              pushReady = snap.exists();
            }
          } catch { /* SW未対応環境 */ }

          found = { label: p.label, name: ev.name, start: p.start, notifyAt: `${hh}:${mm}`, pushReady };
          break;
        }
      }
      setNextNotify(found);
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [notifyEnabled, permission, events, periods, notifyBefore, currentUser, tokenVersion]);

  useEffect(() => {
    Object.values(scheduledRef.current).forEach(clearTimeout);
    scheduledRef.current = {};
    if (!notifyEnabled || permission !== 'granted') return;
    const todayEvents = events[todayKey] || [];
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    todayEvents.forEach((ev, idx) => {
      const p = periods[ev.periodIndex];
      if (!p) return;
      const diffMs = (timeToMin(p.start) - notifyBefore - nowMin) * MS_PER_MINUTE - now.getSeconds() * 1000;
      if (diffMs <= 0) return;
      scheduledRef.current[`today-${idx}`] = setTimeout(() => {
        addToast(`🔔 ${p.label}「${ev.name}」まであと${notifyBefore}分`);
      }, diffMs);
    });
    return () => {
      Object.values(scheduledRef.current).forEach(clearTimeout);
      scheduledRef.current = {};
    };
  }, [notifyEnabled, notifyBefore, events, periods, permission]);

  // ── イベント操作 ─────────────────────────────────────────
  const openAdd = (dateKey: string, periodIndex: number) => {
    setIsEditing(false);
    setFormError('');
    setForm({ name: '', room: '', note: '', colorIdx: 0 });
    setModal({ type: 'event', dateKey, periodIndex });
  };

  const openEdit = (dateKey: string, periodIndex: number, eventId: number) => {
    const ev = (events[dateKey] || []).find(e => e.periodIndex === periodIndex && e.eventId === eventId);
    if (!ev) return;
    setIsEditing(true);
    setFormError('');
    setForm({ name: ev.name, room: ev.room || '', note: ev.note || '', colorIdx: ev.colorIdx ?? 0 });
    setModal({ type: 'event', dateKey, periodIndex, eventId });
  };

  const saveEvent = () => {
    if (!form.name.trim()) { setFormError('科目名を入力してください'); return; }
    setFormError('');
    if (!isEventModal(modal)) return;
    const { dateKey, periodIndex, eventId } = modal;
    setEvents(prev => {
      const base = prev[dateKey] || [];
      const filtered = isEditing
        ? base.filter(e => !(e.periodIndex === periodIndex && e.eventId === eventId))
        : base.filter(e => e.periodIndex !== periodIndex);
      const newEv: TimetableEvent = {
        periodIndex, name: form.name.trim(), room: form.room.trim(),
        note: form.note.trim(), colorIdx: form.colorIdx, eventId: Date.now() + Math.random(),
      };
      const next = { ...prev, [dateKey]: [...filtered, newEv].sort((a, b) => a.periodIndex - b.periodIndex) };
      saveToFirestore(next, periods, notifyBefore);
      return next;
    });
    setModal(null);
  };

  const deleteEvent = () => {
    if (!isEventModal(modal)) return;
    const { dateKey, periodIndex, eventId } = modal;
    setEvents(prev => {
      const next = {
        ...prev,
        [dateKey]: (prev[dateKey] || []).filter(e => !(e.periodIndex === periodIndex && e.eventId === eventId)),
      };
      saveToFirestore(next, periods, notifyBefore);
      return next;
    });
    setModal(null);
  };

  // ── 設定 ────────────────────────────────────────────────
  const openSettings = () => {
    setSettingsPeriods((periods.length > 0 ? periods : DEFAULT_PERIODS).map(p => ({ ...p })));
    setSettingsError('');
    setModal({ type: 'settings' });
  };

  const saveSettings = () => {
    if (settingsPeriods.length === 0) { setSettingsError('時限を1つ以上追加してください'); return; }
    for (const p of settingsPeriods) {
      if (!p.label.trim()) { setSettingsError('時限名を入力してください'); return; }
      if (!p.start || !p.end) { setSettingsError('開始・終了時刻を入力してください'); return; }
      if (p.start >= p.end) { setSettingsError('開始時刻は終了時刻より前にしてください'); return; }
    }
    for (let i = 0; i < settingsPeriods.length; i++) {
      for (let j = i + 1; j < settingsPeriods.length; j++) {
        const a = settingsPeriods[i], b = settingsPeriods[j];
        if (a.start < b.end && a.end > b.start) {
          setSettingsError(`「${a.label}」と「${b.label}」の時間が重複しています`);
          return;
        }
      }
    }
    setSettingsError('');
    setPeriods(settingsPeriods);
    saveToFirestore(events, settingsPeriods, notifyBefore);
    setModal(null);
    addToast('時間設定を保存しました');
  };

  // ── ナビゲーション ───────────────────────────────────────
  const moveCursor = (dir: number) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const getTitle = () => {
    if (view === 'month') return `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`;
    if (view === 'week') {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      return `${ws.getMonth() + 1}/${ws.getDate()} 〜 ${we.getMonth() + 1}/${we.getDate()}`;
    }
    return `${cursor.getMonth() + 1}月${cursor.getDate()}日（${DAY_LABELS[cursor.getDay()]}）`;
  };

  if (loading) return null;

  return (
    <div className="tt-page">
      {dbError && <DbErrorBanner />}

      {/* Toast */}
      <div className="tt-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`tt-toast tt-toast--${t.type}`}>{t.msg}</div>
        ))}
      </div>


      <div className="tt-inner">

        {/* ヘッダー */}
        <div className="tt-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AppMenu />
            <h1 className="tt-title">時間割</h1>
          </div>
          <div className="tt-controls">
            <div className="tt-notify">
              <span className="tt-notify-icon">{notifyEnabled ? '🔔' : '🔕'}</span>
              <div onClick={notifyToggling ? undefined : toggleNotify} className="tt-toggle" style={{ background: notifyEnabled ? 'var(--tt-tab-active-bg)' : 'var(--tt-border)', opacity: notifyToggling ? 0.4 : 1, cursor: notifyToggling ? 'not-allowed' : 'pointer' }}>
                <div className="tt-toggle-thumb" style={{ left: notifyEnabled ? 20 : 2, background: notifyEnabled ? 'var(--tt-tab-active-text)' : '#fff' }} />
              </div>
              <div onClick={() => setShowNotifyPicker(true)} className="tt-notify-picker-btn">
                {notifyBefore}分前
              </div>
            </div>
            <Button variant="outline" onClick={openSettings}>⚙️ 時間設定</Button>
            <Button variant="outline" onClick={async () => { await signOut(auth); navigate('/app/login'); }}>ログアウト</Button>
          </div>
        </div>

        {/* 次の通知予定 */}
        {notifyEnabled && nextNotify && (
          <div className="tt-next-notify">
            <div className="tt-next-notify-row">
              <span className="tt-next-notify-bell">🔔</span>
              <span className="tt-next-notify-body">
                次の予定: {nextNotify.label}「{nextNotify.name}」{nextNotify.start}〜
              </span>
              <span className="tt-next-notify-time">{nextNotify.notifyAt}に通知</span>
            </div>
            {!nextNotify.pushReady && (
              <div className="tt-push-warn">⚠️ プッシュ未登録</div>
            )}
          </div>
        )}

        {/* ビュー切り替えタブ */}
        <div className="tt-view-tabs">
          {([['month', '月'], ['week', '週'], ['day', '日']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`tt-view-tab${view === v ? ' tt-view-tab--active' : ''}`}>
              {l}
            </button>
          ))}
        </div>

        {/* ナビゲーション */}
        <div className="tt-nav">
          <button onClick={() => moveCursor(-1)} className="tt-nav-btn">&lt;</button>
          <span className="tt-nav-title">{getTitle()}</span>
          <button onClick={() => moveCursor(1)} className="tt-nav-btn">&gt;</button>
          <Button variant="outline" onClick={() => setCursor(new Date(today))} style={{ marginLeft: 4 }}>今日</Button>
        </div>

        {/* ビュー本体 */}
        {view === 'month' && (
          <MonthView cursor={cursor} events={events} periods={periods} todayKey={todayKey}
            onDayClick={date => { setCursor(new Date(date)); setView('day'); }} />
        )}
        {view === 'week' && (
          <WeekView cursor={cursor} events={events} periods={periods} todayKey={todayKey}
            onDayClick={date => { setCursor(new Date(date)); setView('day'); }}
            onAdd={openAdd} onEdit={openEdit} />
        )}
        {view === 'day' && (
          <DayView cursor={cursor} events={events} periods={periods} todayKey={todayKey}
            onAdd={openAdd} onEdit={openEdit} />
        )}
      </div>

      {/* 設定モーダル */}
      {modal?.type === 'settings' && (
        <SettingsModal
          settingsPeriods={settingsPeriods}
          settingsError={settingsError}
          onPeriodsChange={setSettingsPeriods}
          onSave={saveSettings}
          onClose={() => setModal(null)}
        />
      )}

      {/* イベントモーダル */}
      {isEventModal(modal) && (
        <EventModal
          modal={modal}
          periods={periods}
          form={form}
          formError={formError}
          isEditing={isEditing}
          onFormChange={setForm}
          onFormErrorChange={setFormError}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setModal(null)}
        />
      )}

      {/* 通知タイミング選択 */}
      {showNotifyPicker && (
        <div className="tt-modal-overlay" onClick={() => setShowNotifyPicker(false)}>
          <div className="tt-modal tt-modal-notify" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: 'var(--tt-text)' }}>通知タイミング</div>
            {NOTIFY_OPTIONS.map(o => (
              <div key={o.value} onClick={async () => {
                setNotifyBefore(o.value);
                setShowNotifyPicker(false);
                saveToFirestore(events, periods, o.value);
                if (notifyEnabled && currentUser && currentTokenRef.current) {
                  const ref = doc(db, firestorePaths.pushTokenDoc(currentUser.uid, currentTokenRef.current));
                  await setDoc(ref, { notifyBefore: o.value }, { merge: true });
                  setTokenVersion(v => v + 1);
                }
              }}
                className={`tt-notify-option${notifyBefore === o.value ? ' tt-notify-option--active' : ''}`}>
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <AppFooter />
    </div>
  );
};
