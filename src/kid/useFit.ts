import { useEffect, useRef, useState } from 'react';
import { STAGE_H, STAGE_W } from '../model';

/** Measures a box and returns the largest 16:9 size that fits inside it (stage on any screen shape). */
export function useFit16x9(pad = 8): [React.RefObject<HTMLDivElement>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const aw = Math.max(120, el.clientWidth - pad * 2);
      const ah = Math.max(70, el.clientHeight - pad * 2);
      const w = Math.floor(Math.min(aw, (ah * STAGE_W) / STAGE_H));
      setSize({ w, h: Math.floor((w * STAGE_H) / STAGE_W) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pad]);
  return [ref, size];
}
