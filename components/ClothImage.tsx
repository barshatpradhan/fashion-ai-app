'use client';

import { useEffect, useState } from 'react';
import { croppedObjectUrl } from '@/lib/image/crop';

/** One crop per picture per page visit, shared by the rail and the chosen piece's view. */
const cache = new Map<string, Promise<string | null>>();

function cropped(src: string): Promise<string | null> {
  let p = cache.get(src);
  if (!p) {
    p = croppedObjectUrl(src);
    cache.set(src, p);
  }
  return p;
}

type Props = { src: string; className?: string; loading?: 'lazy' | 'eager' };

/**
 * A garment picture cropped to the cloth (no transparent or white margins), so it sits on the page like a
 * flat cut-out. Shows the original at once and swaps in the crop when ready; keeps the original if it fails.
 */
export function ClothImage({ src, className, loading }: Props) {
  const [shown, setShown] = useState(src);

  useEffect(() => {
    let live = true;
    setShown(src);
    if (src.startsWith('blob:')) return; // already cropped when it was made
    void cropped(src).then((url) => { if (live && url) setShown(url); });
    return () => { live = false; };
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed Storage or local object URL
    <img src={shown} alt="" className={className} loading={loading} draggable={false} data-cloth />
  );
}
