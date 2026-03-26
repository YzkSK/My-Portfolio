import { signOut } from 'firebase/auth';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import '../shared/app.css';
import { AppFooter } from '../shared/AppFooter';

const APPS = [
  { to: '/app/timetable', label: '時間割', description: '授業・時間割の管理' },
  { to: '/app/quiz',      label: '問題集', description: '問題登録・ランダム出題' },
];

export const Dashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/app/login');
  };

  return (
    <div className="app-dashboard">
      <header className="app-header">
        <h1>Dashboard</h1>
        <div className="app-user-info">
          <span>{currentUser?.email}</span>
          <button onClick={handleLogout} className="app-logout-btn">Logout</button>
        </div>
      </header>
      <main className="app-main">
        <div className="app-grid">
          {APPS.map(app => (
            <Link key={app.to} to={app.to} className="app-card">
              <div className="app-card-label">{app.label}</div>
              <div className="app-card-desc">{app.description}</div>
            </Link>
          ))}
        </div>
      </main>
      <AppFooter />
    </div>
  );
};
