import { useState } from 'react';

export const useToast = (duration = 3500) => {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const addToast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  };
  return { toasts, addToast };
};
