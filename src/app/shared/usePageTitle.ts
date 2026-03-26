import { useEffect } from 'react';

export const usePageTitle = (title: string) => {
  useEffect(() => {
    document.title = title;
    return () => { document.title = 'My PortFolio'; };
  }, [title]);
};
