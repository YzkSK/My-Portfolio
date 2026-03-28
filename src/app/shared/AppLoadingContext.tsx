import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

type SetLoading = (key: string, loading: boolean) => void;

const AppLoadingContext = createContext<SetLoading>(() => {});

export const useSetLoading = () => useContext(AppLoadingContext);

export const AppLoadingProvider = ({
  children,
  initialKeys = [],
}: {
  children: ReactNode;
  initialKeys?: string[];
}) => {
  const [keys, setKeys] = useState<Set<string>>(() => new Set(initialKeys));

  const setLoading = useCallback((key: string, loading: boolean) => {
    setKeys(prev => {
      const next = new Set(prev);
      if (loading) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const isLoading = keys.size > 0;

  return (
    <AppLoadingContext.Provider value={setLoading}>
      {children}
      <div className={`app-loading-overlay${isLoading ? '' : ' app-loading-overlay--done'}`}>
        <div className="app-loading-spinner" />
      </div>
    </AppLoadingContext.Provider>
  );
};
