import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../shared/firebase';
import { useSetLoading } from '../shared/AppLoadingContext';

type AuthContextType = {
  currentUser: User | null;
  username: string | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ currentUser: null, username: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const setGlobalLoading = useSetLoading();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid, 'profile', 'data'));
        setUsername(snap.exists() ? (snap.data().username as string) : null);
      } else {
        setUsername(null);
      }
      setLoading(false);
      setGlobalLoading('auth', false);
    });
    return unsubscribe;
  }, [setGlobalLoading]);

  return (
    <AuthContext.Provider value={{ currentUser, username, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
