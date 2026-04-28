import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export const AppIndex = () => {
  const { currentUser } = useAuth();
  return <Navigate to={currentUser ? '/app/dashboard' : '/app/login'} replace />;
};
