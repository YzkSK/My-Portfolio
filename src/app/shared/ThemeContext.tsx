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
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    getDoc(doc(db, 'users', currentUser.uid, 'profile', 'data')).then(snap => {
      if (snap.exists() && snap.data().darkMode !== undefined) {
        setDarkMode(snap.data().darkMode as boolean);
      }
    });
  }, [currentUser]);

  useEffect(() => {
    document.documentElement.classList.toggle('app-theme-light', !darkMode);
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleDarkMode = async () => {
    const next = !darkMode;
    setDarkMode(next);
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
