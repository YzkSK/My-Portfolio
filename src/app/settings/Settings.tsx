import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useGoogleLogin } from '@react-oauth/google';
import '../shared/app.css';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../shared/ThemeContext';
import { usePageTitle } from '../shared/usePageTitle';
import { useToast } from '../shared/useToast';
import { db } from '../shared/firebase';
import { type VcAuth, firestorePaths, DRIVE_SCOPES, VC_ERROR_CODES } from '../videocollect/constants';

const REDIRECT_URI = `${window.location.origin}/app/settings`;

export const Settings = () => {
  const { currentUser, username } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  usePageTitle('設定');
  const { toasts, addToast } = useToast();

  const [driveConnected, setDriveConnected] = useState(false);

  // Drive 接続状態チェック
  useEffect(() => {
    if (!currentUser) return;
    getDoc(doc(db, firestorePaths.vcAuth(currentUser.uid)))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data() as VcAuth;
          setDriveConnected(!!data.refreshToken);
        }
      })
      .catch(console.error);
  }, [currentUser]);

  // OAuth リダイレクト後のコールバック処理
  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return;

    // URL からコードを除去
    window.history.replaceState({}, '', window.location.pathname);

    const exchange = async () => {
      try {
        const proxyUrl = import.meta.env.VITE_DRIVE_PROXY_URL as string;
        const res = await fetch(`${proxyUrl}/oauth/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, uid: currentUser.uid, redirectUri: REDIRECT_URI }),
        });
        if (!res.ok) throw new Error(`exchange failed: ${res.status}`);
        setDriveConnected(true);
        addToast('Google Drive に接続しました');
      } catch (e) {
        console.error('Drive 連携エラー:', e);
        addToast(`Drive 連携に失敗しました [${VC_ERROR_CODES.AUTH_FAILED}]`, 'error');
      }
    };
    exchange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const login = useGoogleLogin({
    flow: 'auth-code',
    scope: DRIVE_SCOPES,
    ux_mode: 'redirect',
    redirect_uri: REDIRECT_URI,
  });

  return (
    <div className="app-settings">
      <header className="app-header">
        <h1>設定</h1>
        <button onClick={() => navigate('/app/dashboard')} className="app-logout-btn">
          戻る
        </button>
      </header>
      <main className="app-settings-main">
        <section className="app-settings-section">
          <h3 className="app-settings-section-title">プロフィール</h3>
          <div className="app-settings-profile">
            <div className="app-settings-profile-row">
              <span className="app-settings-profile-label">ユーザー名</span>
              <span className="app-settings-profile-value">{username ?? '未設定'}</span>
            </div>
            <div className="app-settings-profile-row">
              <span className="app-settings-profile-label">メールアドレス</span>
              <span className="app-settings-profile-value">{currentUser?.email}</span>
            </div>
          </div>
          <Link to="/app/settings/edit" className="app-settings-edit-link">
            ユーザー情報を変更
            <span className="app-settings-edit-arrow">›</span>
          </Link>
        </section>

        <section className="app-settings-section">
          <h3 className="app-settings-section-title">外観</h3>
          <div className="app-settings-row">
            <span className="app-settings-row-label">ダークモード</span>
            <label className="app-switch">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={toggleDarkMode}
              />
              <span className="app-switch-track">
                <span className="app-switch-thumb" />
              </span>
            </label>
          </div>
        </section>

        <section className="app-settings-section">
          <h3 className="app-settings-section-title">外部連携</h3>
          <div className="app-settings-row">
            <span className="app-settings-row-label">Google Drive</span>
            <button onClick={() => login()} className="app-settings-link-btn">
              {driveConnected ? '接続済み（再接続）' : '接続する'}
            </button>
          </div>
        </section>
      </main>

      {/* トースト */}
      <div className="app-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`app-toast app-toast--${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
};
