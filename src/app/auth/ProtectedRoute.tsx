import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { Forbidden } from '../shared/NotFound';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { currentUser, username, loading } = useAuth();

  if (loading) return null;
  if (!currentUser) return <Forbidden />;
  return (
    <>
      {username === null && (
        <div className="app-username-banner">
          ユーザー名が設定されていません。
          <Link to="/app/settings" className="app-username-banner-link">設定ページ</Link>
          から登録してください。
        </div>
      )}
      {children}
    </>
  );
};
