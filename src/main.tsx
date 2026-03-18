import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { Test } from './Test.tsx'
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './app/AuthContext';
import { ProtectedRoute } from './app/ProtectedRoute';
import { AppIndex } from './app/AppIndex';

const Login = lazy(() => import('./app/pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./app/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Timetable = lazy(() => import('./app/pages/Timetable').then(m => ({ default: m.Timetable })));

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
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
