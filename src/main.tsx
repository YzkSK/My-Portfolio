import { StrictMode, lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { clearCachesAndReload } from './app/shared/ErrorBoundary';

// モジュール読み込みエラー（MIME type / chunk not found）を React 外で検知してキャッシュクリア
// sessionStorage でガードして無限リロードを防ぐ
window.addEventListener('error', (e) => {
  const isMimeError = e.message?.includes('MIME type');
  const isModuleError = e.message?.includes('Failed to load module script') || e.message?.includes('dynamically imported module');
  if (!isMimeError && !isModuleError) return;
  if (sessionStorage.getItem('chunk-reload')) return;
  sessionStorage.setItem('chunk-reload', '1');
  clearCachesAndReload();
}, true);
import { App } from './portfolio/App'
import { createBrowserRouter, RouterProvider, Route, Routes } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './app/auth/AuthContext';
import { ProtectedRoute } from './app/auth/ProtectedRoute';
import { AppIndex } from './app/shared/AppIndex';
import { AppLoadingProvider } from './app/shared/AppLoadingContext';
import { ThemeProvider } from './app/shared/ThemeContext';
import { ErrorBoundary } from './app/shared/ErrorBoundary';
import { NotFound } from './app/shared/NotFound';

const Login         = lazy(() => import('./app/auth/Login').then(m => ({ default: m.Login })));
const ResetPassword = lazy(() => import('./app/auth/ResetPassword').then(m => ({ default: m.ResetPassword })));
const Dashboard     = lazy(() => import('./app/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings      = lazy(() => import('./app/settings/Settings').then(m => ({ default: m.Settings })));
const EditProfile   = lazy(() => import('./app/settings/EditProfile').then(m => ({ default: m.EditProfile })));
const Timetable     = lazy(() => import('./app/timetable/Timetable').then(m => ({ default: m.Timetable })));
const Quiz          = lazy(() => import('./app/quiz/Quiz').then(m => ({ default: m.Quiz })));
const QuizPlay      = lazy(() => import('./app/quiz/QuizPlay').then(m => ({ default: m.QuizPlay })));
const Videocollect  = lazy(() => import('./app/videocollect/Videocollect').then(m => ({ default: m.Videocollect })));
const VideoPlayer   = lazy(() => import('./app/videocollect/VideoPlayer').then(m => ({ default: m.VideoPlayer })));

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

const AppRoutes = () => (
  <AppWrapper>
    <AppLoadingProvider initialKeys={['auth']}>
      <AuthProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <Suspense fallback={null}>
              <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''}>
                <Routes>
                <Route path="" element={<AppIndex />} />
                <Route path="login" element={<Login />} />
                <Route path="reset-password" element={<ResetPassword />} />
                <Route path="dashboard" element={
                  <ProtectedRoute><Dashboard /></ProtectedRoute>
                } />
                <Route path="timetable" element={
                  <ProtectedRoute><Timetable /></ProtectedRoute>
                } />
                <Route path="quiz" element={
                  <ProtectedRoute><Quiz /></ProtectedRoute>
                } />
                <Route path="quiz/play" element={
                  <ProtectedRoute><QuizPlay /></ProtectedRoute>
                } />
                <Route path="settings" element={
                  <ProtectedRoute><Settings /></ProtectedRoute>
                } />
                <Route path="settings/edit" element={
                  <ProtectedRoute><EditProfile /></ProtectedRoute>
                } />
                <Route path="videocollect" element={
                  <ProtectedRoute><Videocollect /></ProtectedRoute>
                } />
                <Route path="videocollect/play" element={
                  <ProtectedRoute><VideoPlayer /></ProtectedRoute>
                } />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </GoogleOAuthProvider>
            </Suspense>
          </ErrorBoundary>
        </ThemeProvider>
      </AuthProvider>
    </AppLoadingProvider>
  </AppWrapper>
);

const router = createBrowserRouter([
  { path: '/',      element: <App /> },
{ path: '/app/*', element: <AppRoutes /> },
  { path: '*',      element: <NotFound /> },
]);

const root = document.getElementById('root');

createRoot(root!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
