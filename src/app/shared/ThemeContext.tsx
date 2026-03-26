import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../auth/AuthContext';

type ThemeContextType = {
  darkMode: boolean;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextType>({ darkMode: false, toggleDarkMode: () => {} });

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { currentUser } = useAuth();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('tt-dark-mode') === 'true');

  useEffect(() => {
    if (!currentUser) return;
    getDoc(doc(db, 'users', currentUser.uid, 'profile', 'data')).then(snap => {
      if (snap.exists() && snap.data().darkMode !== undefined) {
        const value = snap.data().darkMode as boolean;
        setDarkMode(value);
        localStorage.setItem('tt-dark-mode', String(value));
      }
    });
  }, [currentUser]);

  useEffect(() => {
    document.documentElement.classList.toggle('app-theme-light', !darkMode);
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // iOS PWA: force CSS variable re-evaluation on app resume
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) {
        const el = document.documentElement;
        el.style.display = 'none';
        void el.offsetHeight;
        el.style.display = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const toggleDarkMode = async () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('tt-dark-mode', String(next));
    if (currentUser) {
      await setDoc(
        doc(db, 'users', currentUser.uid, 'profile', 'data'),
        { darkMode: next },
        { merge: true },
      );
    }
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};
