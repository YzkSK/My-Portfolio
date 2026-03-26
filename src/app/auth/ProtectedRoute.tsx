import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { currentUser, username, loading } = useAuth();

  if (loading) return null;
  if (!currentUser) return <Navigate to="/app/login" replace />;
  return (
    <>
      {username === null && (
        <div className="app-username-banner">
          ユーザー名が設定されていません。プロフィール設定からユーザー名を登録してください。
        </div>
      )}
      {children}
    </>
  );
};
