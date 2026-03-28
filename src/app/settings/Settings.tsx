import { useNavigate, Link } from 'react-router-dom';
import '../shared/app.css';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../shared/ThemeContext';
import { usePageTitle } from '../shared/usePageTitle';

export const Settings = () => {
  const { currentUser, username } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  usePageTitle('設定');

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
      </main>
    </div>
  );
};
