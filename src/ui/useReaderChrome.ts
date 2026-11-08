import { useLayoutEffect, useRef, useState } from 'react';

/** Chrome changes only through the explicit toggle. Preserve the visible content
 * anchor when reclaiming or restoring toolbar space. */
export function useReaderChrome() {
  const root = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const pending = useRef<{
    scroller: HTMLElement;
    anchor: HTMLElement;
    top: number;
  } | null>(null);
  function capture() {
    const scroller = root.current?.querySelector<HTMLElement>(
      '.page:not([hidden]) .library-scroll, .chapters.page, .reader-scroll',
    );
    if (!scroller) return;
    const bounds = scroller.getBoundingClientRect();
    const anchor = Array.from(
      scroller.querySelectorAll<HTMLElement>(
        '.body-block, .story-card, .book-intro, .timeline-node',
      ),
    ).find((node) => {
      const box = node.getBoundingClientRect();
      return box.bottom > bounds.top && box.top < bounds.bottom;
    });
    if (anchor)
      pending.current = {
        scroller,
        anchor,
        top: anchor.getBoundingClientRect().top,
      };
  }
  useLayoutEffect(() => {
    const saved = pending.current;
    pending.current = null;
    if (saved?.anchor.isConnected)
      saved.scroller.scrollTop +=
        saved.anchor.getBoundingClientRect().top - saved.top;
  }, [collapsed]);
  return {
    root,
    collapsed,
    toggle: () => {
      capture();
      setCollapsed((current) => !current);
    },
  };
}
