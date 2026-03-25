import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { auth, db, messaging } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import './timetable.css';
import { AppFooter } from '../shared/AppFooter';
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

export const Timetable = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

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
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [showNotifyPicker, setShowNotifyPicker] = useState(false);
  const [settingsPeriods, setSettingsPeriods] = useState<Period[]>(DEFAULT_PERIODS);
  const [loading, setLoading] = useState(true);
  const scheduledRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`).catch(console.error);
  }, []);

  // ── Firestore 読み込み ──────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const ref = doc(db, firestorePaths.timetableData(currentUser.uid));
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.events) setEvents(data.events);
          if (data.periods?.length > 0) setPeriods(data.periods);
          if (data.notifyBefore) setNotifyBefore(data.notifyBefore);
        }
      } catch (e) {
        console.error('Firestore読み込みエラー:', e);
      } finally {
        setLoading(false);
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
      const ref = doc(db, firestorePaths.timetableData(currentUser.uid));
      await setDoc(ref, { events: eventsData, periods: periodsData, notifyBefore: notifyBeforeData });
    }, SAVE_DEBOUNCE_MS);
  }, [currentUser]);

  // ── Toast ───────────────────────────────────────────────
  const addToast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), TOAST_DURATION_MS);
  };

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
    const ref = doc(db, firestorePaths.pushToken(currentUser.uid));
    await setDoc(ref, { token, notifyBefore });
  };

  const removePushToken = async () => {
    if (!currentUser) return;
    const ref = doc(db, firestorePaths.pushToken(currentUser.uid));
    await deleteDoc(ref);
  };

  const toggleNotify = async () => {
    if (!notifyEnabled) {
      const granted = permission === 'granted' || await requestPermission();
      if (granted) {
        setNotifyEnabled(true);
        localStorage.setItem('notifyEnabled', 'true');
        try {
          const sw = await navigator.serviceWorker.ready;
          const token = await getToken(messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: sw,
          });
          await savePushToken(token);
        } catch (e) {
          console.error('FCMトークン取得失敗:', e);
        }
        addToast('通知をオンにしました');
      } else {
        addToast('通知が許可されませんでした');
      }
    } else {
      setNotifyEnabled(false);
      localStorage.setItem('notifyEnabled', 'false');
      Object.values(scheduledRef.current).forEach(clearTimeout);
      scheduledRef.current = {};
      await deleteToken(messaging);
      await removePushToken();
      addToast('通知をオフにしました');
    }
  };

  useEffect(() => {
    const unsub = onMessage(messaging, (payload) => {
      const title = payload.data?.title ?? payload.notification?.title ?? '時間割';
      const body = payload.data?.body ?? payload.notification?.body ?? '';
      if (permission === 'granted') new Notification(title, { body, icon: '/vite.svg' });
    });
    return unsub;
  }, [permission]);

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
        note: form.note.trim(), colorIdx: form.colorIdx, eventId: Date.now(),
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

  if (loading) {
    return (
      <div className="tt-loading">読み込み中...</div>
    );
  }

  return (
    <div className="tt-page">

      {/* Toast */}
      <div className="tt-toast-container">
        {toasts.map(t => (
          <div key={t.id} className="tt-toast">{t.msg}</div>
        ))}
      </div>

      <div className="tt-inner">

        {/* ヘッダー */}
        <div className="tt-header">
          <h1 className="tt-title">時間割</h1>
          <div className="tt-controls">
            <div className="tt-notify">
              <span className="tt-notify-icon">{notifyEnabled ? '🔔' : '🔕'}</span>
              <div onClick={toggleNotify} className="tt-toggle" style={{ background: notifyEnabled ? '#1a1a1a' : '#ccc' }}>
                <div className="tt-toggle-thumb" style={{ left: notifyEnabled ? 20 : 2 }} />
              </div>
              <div onClick={() => setShowNotifyPicker(true)} className="tt-notify-picker-btn">
                {notifyBefore}分前
              </div>
            </div>
            <button onClick={openSettings} className="tt-btn">⚙️ 時間設定</button>
            <button onClick={async () => { await signOut(auth); navigate('/app/login'); }} className="tt-btn">ログアウト</button>
          </div>
        </div>

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
          <button onClick={() => setCursor(new Date(today))} className="tt-btn" style={{ marginLeft: 4 }}>今日</button>
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
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: '#1a1a1a' }}>通知タイミング</div>
            {NOTIFY_OPTIONS.map(o => (
              <div key={o.value} onClick={async () => {
                setNotifyBefore(o.value);
                setShowNotifyPicker(false);
                saveToFirestore(events, periods, o.value);
                if (notifyEnabled && currentUser) {
                  const ref = doc(db, firestorePaths.pushToken(currentUser.uid));
                  await setDoc(ref, { notifyBefore: o.value }, { merge: true });
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
