import { useState, useEffect } from 'react';
import { getCachedImageUrl } from '../imageCache';

type Props = {
  src: string;
  className?: string;
  spinnerClassName?: string;
  alt?: string;
};

export const ImageWithLoader = ({ src, className, spinnerClassName = 'qz-img-spinner--side', alt = '' }: Props) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    setFailed(false);
    getCachedImageUrl(src)
      .then(url => { if (!cancelled) setBlobUrl(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [src]);

  const errorSizeClass = spinnerClassName.replace('qz-img-spinner', 'qz-img-error');

  if (failed) return <div className={`qz-img-error ${errorSizeClass}`}>✕</div>;

  return (
    <>
      {!blobUrl && <div className={`qz-img-spinner ${spinnerClassName}`} />}
      {blobUrl  && <img src={blobUrl} className={className} alt={alt} />}
    </>
  );
};
