import { useState, useEffect, useLayoutEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import { useSetLoading } from './AppLoadingContext';

type Options<T> = {
  currentUser: User | null;
  path: string;
  parse: (raw: Record<string, unknown>) => T;
  loadingKey: string;
  initialData: T;
  onAfterLoad?: (data: T) => void;
};

export type FirestoreDataResult<T> = {
  data: T;
  setData: Dispatch<SetStateAction<T>>;
  loading: boolean;
  dbError: boolean;
  setDbError: Dispatch<SetStateAction<boolean>>;
};

/**
 * Firestore からデータを読み込み、ローディング・エラー状態を管理するフック。
 * useLayoutEffect でグローバルローディングキーを管理し、
 * currentUser が確定したときに getDoc を実行する。
 */
export function useFirestoreData<T>(opts: Options<T>): FirestoreDataResult<T> {
  const { currentUser, path, parse, loadingKey, initialData, onAfterLoad } = opts;
  const setGlobalLoading = useSetLoading();
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useLayoutEffect(() => {
    setGlobalLoading(loadingKey, true);
    return () => setGlobalLoading(loadingKey, false);
  }, [setGlobalLoading, loadingKey]);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const docRef = doc(db, path);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const parsed = parse(snap.data() as Record<string, unknown>);
          setData(parsed);
          onAfterLoad?.(parsed);
        }
      } catch (e) {
        console.error(`Firestore読み込みエラー [${loadingKey}]:`, e);
        setDbError(true);
      } finally {
        setLoading(false);
        setGlobalLoading(loadingKey, false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  return { data, setData, loading, dbError, setDbError };
}
