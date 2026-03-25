import { StrictMode, lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './portfolio/App'
import { Test } from './Test.tsx'
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './app/auth/AuthContext';
import { ProtectedRoute } from './app/auth/ProtectedRoute';
import { AppIndex } from './app/shared/AppIndex';

const Login = lazy(() => import('./app/auth/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./app/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const Timetable = lazy(() => import('./app/timetable/Timetable').then(m => ({ default: m.Timetable })));

// アプリページ表示中は #root の margin-top をリセット
const AppWrapper = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const original = root.style.marginTop;
    root.style.marginTop = '0';
    return () => { root.style.marginTop = original; };
  }, []);
  return <>{children}</>;
};

const root = document.getElementById('root');

createRoot(root!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Portfolio */}
        <Route path="/" element={<App />} />
        <Route path="/test" element={<Test />} />

        {/* App — Firebase only loads when /app/* is accessed */}
        <Route path="/app/*" element={
          <AppWrapper>
            <AuthProvider>
              <Suspense fallback={<div>Loading...</div>}>
                <Routes>
                  <Route path="" element={<AppIndex />} />
                  <Route path="login" element={<Login />} />
                  <Route path="dashboard" element={
                    <ProtectedRoute><Dashboard /></ProtectedRoute>
                  } />
                  <Route path="timetable" element={
                    <ProtectedRoute><Timetable /></ProtectedRoute>
                  } />
                </Routes>
              </Suspense>
            </AuthProvider>
          </AppWrapper>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
