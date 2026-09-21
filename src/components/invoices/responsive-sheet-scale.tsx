'use client';

import { useEffect, useRef, useState } from 'react';

// The sheet's own markup (invoice-sheet.tsx / invoice-sheet-classic.tsx) is
// laid out at this fixed design width — wide enough that none of its
// internal tables ever hit their own min-width overflow-x-auto fallback.
// Below this container width we scale the whole thing down uniformly
// instead, so the live builder preview never needs horizontal scrolling on
// a phone/tablet, at the cost of smaller (but still fully legible, and
// still fully interactive — transforms don't affect hit-testing) text.
const DESIGN_WIDTH = 760;

/** Wraps an invoice sheet so it always fits its container's width — see
 * DESIGN_WIDTH above. Renders the sheet at native size and scales down via
 * CSS transform when the available width is narrower, tracking both the
 * container's width and the sheet's own (content-driven) height live. */
export function ResponsiveSheetScale({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);
  // Below DESIGN_WIDTH the scaled box already exactly fills the container
  // (scale = containerWidth / DESIGN_WIDTH by construction), so this is 0
  // there — only a wide container, where scale is capped at 1 and the
  // un-scaled box is narrower than what's available, needs an offset to
  // center it instead of sitting flush against the container's left edge.
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const containerWidth = outer.clientWidth;
      const nextScale = containerWidth > 0 ? Math.min(1, containerWidth / DESIGN_WIDTH) : 1;
      setScale(nextScale);
      setHeight(inner.scrollHeight * nextScale);
      setOffset(Math.max(0, (containerWidth - DESIGN_WIDTH * nextScale) / 2));
    };

    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full overflow-hidden" style={{ height }}>
      <div ref={innerRef} style={{ width: DESIGN_WIDTH, marginLeft: offset, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}
