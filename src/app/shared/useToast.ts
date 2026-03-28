import { useState } from 'react';

export type ToastType = 'normal' | 'error' | 'warning';

export const useToast = (duration = 3500) => {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: ToastType }[]>([]);
  const addToast = (msg: string, type: ToastType = 'normal') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  };
  return { toasts, addToast };
};
