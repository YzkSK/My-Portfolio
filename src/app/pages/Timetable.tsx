import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getToken, deleteToken } from 'firebase/messaging';
import { db, messaging } from '../firebase';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import './timetable.css';
import { AppFooter } from '../AppFooter';

// ── 型定義 ──────────────────────────────────────────────────
type TimetableEvent = {
  pi: number;
  name: string;
  room: string;
  colorIdx: number;
  _idx: number;
};

type Period = {
  label: string;
  start: string;
  end: string;
};

type Events = Record<string, TimetableEvent[]>;

type EventModal = { type: 'event'; dateKey: string; pi: number; idx?: number };
type SettingsModal = { type: 'settings' };
type Modal = EventModal | SettingsModal | null;

type Form = { name: string; room: string; colorIdx: number };

// ── 定数 ────────────────────────────────────────────────────
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const COLORS = [
  { bg: '#64748b', text: '#fff' },
  { bg: '#ef4444', text: '#fff' },
  { bg: '#f97316', text: '#fff' },
  { bg: '#22c55e', text: '#fff' },
  { bg: '#3b82f6', text: '#fff' },
  { bg: '#8b5cf6', text: '#fff' },
  { bg: '#ec4899', text: '#fff' },
  { bg: '#f59e0b', text: '#fff' },
];

const NOTIFY_OPTIONS = [
  { label: '5分前',  value: 5 },
  { label: '10分前', value: 10 },
  { label: '15分前', value: 15 },
  { label: '30分前', value: 30 },
];

const DEFAULT_PERIODS: Period[] = [
  { label: '1限', start: '09:00', end: '10:30' },
  { label: '2限', start: '10:45', end: '12:15' },
  { label: '3限', start: '13:00', end: '14:30' },
  { label: '4限', start: '14:45', end: '16:15' },
  { label: '5限', start: '16:30', end: '18:00' },
];

// ── ユーティリティ ──────────────────────────────────────────
const toKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDays = (date: Date, n: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

const timeToMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// ── コンポーネント ──────────────────────────────────────────
export const Timetable = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view, setView] = useState<'month' | 'week' | 'day'>('week');
  const [cursor, setCursor] = useState(new Date(today));
  const [events, setEvents] = useState<Events>({});
  const [periods, setPeriods] = useState<Period[]>(DEFAULT_PERIODS);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<Form>({ name: '', room: '', colorIdx: 0 });
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
    if ('serviceWorker' in navigator) {
      const params = new URLSearchParams({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });
      navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`).catch(console.error);
    }
  }, []);

  // ── Firestore 読み込み ──────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const ref = doc(db, 'users', currentUser.uid, 'timetable', 'data');
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
      const ref = doc(db, 'users', currentUser.uid, 'timetable', 'data');
      await setDoc(ref, { events: eventsData, periods: periodsData, notifyBefore: notifyBeforeData });
    }, 800);
  }, [currentUser]);

  // ── Toast ───────────────────────────────────────────────
  const addToast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
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
    const ref = doc(db, 'users', currentUser.uid, 'push', 'token');
    await setDoc(ref, { token, notifyBefore });
  };

  const removePushToken = async () => {
    if (!currentUser) return;
    const ref = doc(db, 'users', currentUser.uid, 'push', 'token');
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
      try {
        await deleteToken(messaging);
        await removePushToken();
      } catch (e) {
        console.error('FCMトークン削除失敗:', e);
      }
      addToast('通知をオフにしました');
    }
  };

  useEffect(() => {
    Object.values(scheduledRef.current).forEach(clearTimeout);
    scheduledRef.current = {};
    if (!notifyEnabled || permission !== 'granted') return;
    const todayKey = toKey(today);
    const todayEvents = events[todayKey] || [];
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    todayEvents.forEach((ev, idx) => {
      const p = periods[ev.pi];
      if (!p) return;
      const diffMs = (timeToMin(p.start) - notifyBefore - nowMin) * 60000 - now.getSeconds() * 1000;
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
  const openAdd = (dateKey: string, pi: number) => {
    setIsEditing(false);
    setForm({ name: '', room: '', colorIdx: 0 });
    setModal({ type: 'event', dateKey, pi });
  };

  const openEdit = (dateKey: string, pi: number, idx: number) => {
    const ev = (events[dateKey] || []).find(e => e.pi === pi && e._idx === idx);
    if (!ev) return;
    setIsEditing(true);
    setForm({ name: ev.name, room: ev.room || '', colorIdx: ev.colorIdx ?? 0 });
    setModal({ type: 'event', dateKey, pi, idx });
  };

  const saveEvent = () => {
    if (!form.name.trim()) { setModal(null); return; }
    const m = modal as EventModal;
    const { dateKey, pi, idx } = m;
    setEvents(prev => {
      const base = prev[dateKey] || [];
      const filtered = isEditing
        ? base.filter(e => !(e.pi === pi && e._idx === idx))
        : base.filter(e => e.pi !== pi);
      const newEv: TimetableEvent = {
        pi, name: form.name.trim(), room: form.room.trim(),
        colorIdx: form.colorIdx, _idx: Date.now(),
      };
      const next = { ...prev, [dateKey]: [...filtered, newEv].sort((a, b) => a.pi - b.pi) };
      saveToFirestore(next, periods, notifyBefore);
      return next;
    });
    setModal(null);
  };

  const deleteEvent = () => {
    const m = modal as EventModal;
    const { dateKey, pi, idx } = m;
    setEvents(prev => {
      const next = { ...prev, [dateKey]: (prev[dateKey] || []).filter(e => !(e.pi === pi && e._idx === idx)) };
      saveToFirestore(next, periods, notifyBefore);
      return next;
    });
    setModal(null);
  };

  // ── 設定 ────────────────────────────────────────────────
  const openSettings = () => {
    const base = periods.length > 0 ? periods : DEFAULT_PERIODS;
    setSettingsPeriods(base.map(p => ({ ...p })));
    setModal({ type: 'settings' });
  };

  const saveSettings = () => {
    if (settingsPeriods.length === 0) return;
    setPeriods(settingsPeriods);
    saveToFirestore(events, settingsPeriods, notifyBefore);
    setModal(null);
    addToast('時間設定を保存しました');
  };

  // ── ナビゲーション ───────────────────────────────────────
  const navigate2 = (dir: number) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const goToday = () => setCursor(new Date(today));

  const getTitle = () => {
    if (view === 'month') return `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`;
    if (view === 'week') {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      return `${ws.getMonth() + 1}/${ws.getDate()} 〜 ${we.getMonth() + 1}/${we.getDate()}`;
    }
    return `${cursor.getMonth() + 1}月${cursor.getDate()}日（${DAY_LABELS[cursor.getDay()]}）`;
  };

  const isToday = (date: Date) => toKey(date) === toKey(today);

  // ── スタイル定数 ────────────────────────────────────────
  const underlineInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'transparent', border: 'none',
    borderBottom: '2px solid #1a1a1a',
    padding: '8px 2px', color: '#1a1a1a', fontSize: 14, outline: 'none',
  };

  // ── 月ビュー ─────────────────────────────────────────────
  const renderMonth = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {DAY_LABELS.map((l, i) => (
            <div key={l} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0', color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#888' }}>{l}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} />;
            const key = toKey(date);
            const dayEvents = events[key] || [];
            const isTod = isToday(date);
            const isSun = date.getDay() === 0;
            const isSat = date.getDay() === 6;
            return (
              <div key={key}
                onClick={() => { setCursor(new Date(date)); setView('day'); }}
                style={{ height: 80, overflow: 'hidden', background: isTod ? '#1a1a1a' : '#fff', border: '1px solid #eee', borderRadius: 8, padding: '4px 5px', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (!isTod) (e.currentTarget as HTMLDivElement).style.background = '#f5f5f5'; }}
                onMouseLeave={e => { if (!isTod) (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: isTod ? '#fff' : isSun ? '#ef4444' : isSat ? '#3b82f6' : '#1a1a1a', marginBottom: 3 }}>{date.getDate()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayEvents.slice(0, 2).map((ev, idx) => {
                    const c = COLORS[ev.colorIdx ?? 0];
                    return (
                      <div key={idx} style={{ background: c.bg, color: c.text, borderRadius: 3, fontSize: 9, fontWeight: 700, padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {periods[ev.pi]?.label} {ev.name}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && <div style={{ fontSize: 9, color: isTod ? '#aaa' : '#999' }}>+{dayEvents.length - 2}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── 週ビュー ─────────────────────────────────────────────
  const renderWeek = () => {
    const ws = startOfWeek(cursor);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', gap: 3, minWidth: 480 }}>
          <div />
          {weekDays.map((date, i) => {
            const isTod = isToday(date);
            return (
              <div key={i} onClick={() => { setCursor(new Date(date)); setView('day'); }}
                style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, cursor: 'pointer', background: isTod ? '#1a1a1a' : '#f0f0f0' }}>
                <div style={{ fontSize: 10, color: isTod ? '#aaa' : i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#888' }}>{DAY_LABELS[date.getDay()]}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: isTod ? '#fff' : '#1a1a1a' }}>{date.getDate()}</div>
              </div>
            );
          })}

          {periods.map((period, pi) => (
            <Fragment key={pi}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8f8f8', borderRadius: 8, minHeight: 60, padding: 3, gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#333' }}>{period.label}</span>
                <span style={{ fontSize: 8, color: '#bbb', textAlign: 'center', lineHeight: 1.4 }}>{period.start}<br />〜{period.end}</span>
              </div>
              {weekDays.map((date, di) => {
                const key = toKey(date);
                const ev = (events[key] || []).find(e => e.pi === pi);
                const isTod = isToday(date);
                const c = ev ? COLORS[ev.colorIdx ?? 0] : null;
                return (
                  <div key={`${key}-${pi}-${di}`}
                    onClick={() => ev ? openEdit(key, pi, ev._idx) : openAdd(key, pi)}
                    style={{ minHeight: 60, borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 3px', textAlign: 'center', background: ev ? c!.bg : isTod ? '#e8f0fe' : '#f9f9f9', border: ev ? 'none' : isTod ? '1.5px dashed #93b4e8' : '1.5px dashed #e0e0e0', transition: 'opacity 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.8'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                  >
                    {ev ? (
                      <>
                        <div style={{ fontSize: 10, fontWeight: 800, color: c!.text, lineHeight: 1.3, wordBreak: 'break-all' }}>{ev.name}</div>
                        {ev.room && <div style={{ fontSize: 8, color: c!.text, opacity: 0.75, marginTop: 1 }}>{ev.room}</div>}
                      </>
                    ) : <div style={{ fontSize: 14, color: '#ddd' }}>+</div>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  // ── 日ビュー ─────────────────────────────────────────────
  const renderDay = () => {
    const key = toKey(cursor);
    const dayEvs = events[key] || [];
    const isTod = isToday(cursor);

    return (
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {periods.map((period, pi) => {
          const ev = dayEvs.find(e => e.pi === pi);
          const c = ev ? COLORS[ev.colorIdx ?? 0] : null;
          return (
            <div key={pi}
              onClick={() => ev ? openEdit(key, pi, ev._idx) : openAdd(key, pi)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 6, borderRadius: 10, cursor: 'pointer', background: ev ? c!.bg : isTod ? '#f0f5ff' : '#fafafa', border: ev ? 'none' : '1.5px dashed #e0e0e0', transition: 'opacity 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
            >
              <div style={{ minWidth: 52, textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: ev ? c!.text : '#333' }}>{period.label}</div>
                <div style={{ fontSize: 9, color: ev ? c!.text : '#bbb', opacity: ev ? 0.8 : 1, lineHeight: 1.4 }}>{period.start}<br />〜{period.end}</div>
              </div>
              <div style={{ flex: 1 }}>
                {ev ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 800, color: c!.text }}>{ev.name}</div>
                    {ev.room && <div style={{ fontSize: 11, color: c!.text, opacity: 0.75 }}>{ev.room}</div>}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#ccc' }}>タップして追加</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 14 }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div className="tt-page">

      {/* Toast */}
      <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: '#1a1a1a', color: '#fff', borderRadius: 20, padding: '9px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', animation: 'fadeUp 0.25s ease', whiteSpace: 'nowrap' }}>{t.msg}</div>
        ))}
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="tt-header">
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>時間割</h1>
          <div className="tt-controls">
            <div className="tt-notify">
              <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>{notifyEnabled ? '🔔' : '🔕'}</span>
              <div onClick={toggleNotify} style={{ width: 38, height: 20, borderRadius: 10, cursor: 'pointer', background: notifyEnabled ? '#1a1a1a' : '#ccc', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: notifyEnabled ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div onClick={() => setShowNotifyPicker(true)} style={{ padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: '#f0f0f0', color: '#444', userSelect: 'none' }}>
                {notifyBefore}分前
              </div>
            </div>
            <button onClick={openSettings} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#555', cursor: 'pointer' }}>⚙️ 時間設定</button>
            <button onClick={async () => { await signOut(auth); navigate('/app/login'); }} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#999', cursor: 'pointer' }}>ログアウト</button>
          </div>
        </div>

        {/* ビュー切り替えタブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f0f0f0', borderRadius: 10, padding: 3, width: 'fit-content' }}>
          {([['month', '月'], ['week', '週'], ['day', '日']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: view === v ? '#1a1a1a' : 'transparent', color: view === v ? '#fff' : '#888', transition: 'all 0.15s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* ナビゲーション */}
        <div className="tt-nav">
          <button onClick={() => navigate2(-1)} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14, color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&lt;</button>
          <span style={{ fontSize: 15, fontWeight: 800, minWidth: 140, color: '#1a1a1a' }}>{getTitle()}</span>
          <button onClick={() => navigate2(1)} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14, color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&gt;</button>
          <button onClick={goToday} style={{ marginLeft: 4, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#555', cursor: 'pointer' }}>今日</button>
        </div>

        {/* ビュー本体 */}
        {view === 'month' && renderMonth()}
        {view === 'week' && renderWeek()}
        {view === 'day' && renderDay()}
      </div>

      {/* 時間設定モーダル */}
      {modal?.type === 'settings' && (
        <div className="tt-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="tt-modal tt-modal-settings">
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, color: '#1a1a1a' }}>時限・時間の設定</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>時限名と開始・終了時刻を自由に編集できます</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {settingsPeriods.map((p, i) => (
                <div key={i} style={{ background: '#f8f9fa', border: '1px solid #e8e8e8', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: '#aaa', fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
                    <input value={p.label} onChange={e => setSettingsPeriods(prev => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                      placeholder="例: 1限" style={{ flex: 1, background: '#fff', border: '1px solid #ddd', borderRadius: 7, padding: '7px 10px', fontSize: 13, fontWeight: 700, outline: 'none', color: '#1a1a1a' }} />
                    <button onClick={() => setSettingsPeriods(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: '#fff', border: '1px solid #ffcccc', borderRadius: 7, color: '#ef4444', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '6px 10px' }}>削除</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#aaa' }}>開始</span>
                    <input type="time" value={p.start} onChange={e => setSettingsPeriods(prev => prev.map((x, idx) => idx === i ? { ...x, start: e.target.value } : x))}
                      style={{ flex: 1, background: '#fff', border: '1px solid #ddd', borderRadius: 7, padding: '7px 8px', fontSize: 13, outline: 'none', color: '#1a1a1a' }} />
                    <span style={{ fontSize: 11, color: '#aaa' }}>〜</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>終了</span>
                    <input type="time" value={p.end} onChange={e => setSettingsPeriods(prev => prev.map((x, idx) => idx === i ? { ...x, end: e.target.value } : x))}
                      style={{ flex: 1, background: '#fff', border: '1px solid #ddd', borderRadius: 7, padding: '7px 8px', fontSize: 13, outline: 'none', color: '#1a1a1a' }} />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setSettingsPeriods(prev => [...prev, { label: `${prev.length + 1}限`, start: '09:00', end: '10:30' }])}
              style={{ width: '100%', padding: 10, background: '#f8f9fa', border: '1.5px dashed #ccc', borderRadius: 8, color: '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>
              ＋ 時限を追加
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 11, background: '#f0f0f0', border: 'none', borderRadius: 8, color: '#666', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
              <button onClick={saveSettings} style={{ flex: 2, padding: 11, background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* イベント追加・編集モーダル */}
      {modal?.type === 'event' && (
        <div className="tt-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="tt-modal tt-modal-event">
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2, color: '#1a1a1a' }}>
              {(modal as EventModal).dateKey} {periods[(modal as EventModal).pi]?.label}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
              {periods[(modal as EventModal).pi]?.start} 〜 {periods[(modal as EventModal).pi]?.end}
            </div>

            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>科目名 / 授業名</div>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="例：微分積分、第一段階" autoFocus style={{ ...underlineInput, marginBottom: 18 }} />

            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>教室 / 場所（任意）</div>
            <input value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
              placeholder="例：201講義室" style={{ ...underlineInput, marginBottom: 20 }} />

            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 8 }}>色</div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 24 }}>
              {COLORS.map((c, i) => (
                <div key={i} onClick={() => setForm(f => ({ ...f, colorIdx: i }))}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c.bg, cursor: 'pointer', border: form.colorIdx === i ? '2.5px solid #1a1a1a' : '2.5px solid transparent', outline: form.colorIdx === i ? '2px solid #fff' : 'none', outlineOffset: 1, transform: form.colorIdx === i ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.1s', boxSizing: 'border-box' }} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isEditing && (
                <button onClick={deleteEvent} style={{ padding: '10px 12px', background: '#fff', border: '1px solid #ffcccc', borderRadius: 8, color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>削除</button>
              )}
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 10, background: '#f0f0f0', border: 'none', borderRadius: 8, color: '#666', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>キャンセル</button>
              <button onClick={saveEvent} style={{ flex: 2, padding: 10, background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>保存</button>
            </div>
          </div>
        </div>
      )}

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
                  const ref = doc(db, 'users', currentUser.uid, 'push', 'token');
                  await setDoc(ref, { notifyBefore: o.value }, { merge: true });
                }
              }}
                style={{ padding: '13px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: notifyBefore === o.value ? '#1a1a1a' : '#f5f5f5', color: notifyBefore === o.value ? '#fff' : '#333', marginBottom: 6, transition: 'all 0.15s' }}>
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
