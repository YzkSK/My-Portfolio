import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../shared/firebase';
import { useSetLoading } from '../shared/AppLoadingContext';

type AuthContextType = {
  currentUser: User | null;
  /** undefined = 未ロード、null = ロード済みだがユーザー名未設定、string = 設定済み */
  username: string | null | undefined;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ currentUser: null, username: undefined, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const setGlobalLoading = useSetLoading();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      try {
        if (user) {
          const snap = await getDoc(doc(db, 'users', user.uid, 'profile', 'data'));
          setUsername(snap.exists() ? (snap.data().username as string) : null);
        } else {
          setUsername(null);
        }
      } catch (e) {
        console.error('AuthContext: プロフィール取得失敗', e);
        setUsername(null);
      } finally {
        setLoading(false);
        setGlobalLoading('auth', false);
      }
    });
    return unsubscribe;
  }, [setGlobalLoading]);

  return (
    <AuthContext.Provider value={{ currentUser, username, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
