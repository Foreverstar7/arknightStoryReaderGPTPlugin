import { useEffect, useRef, useState, type RefObject } from 'react';

type Destination = { id: string; title: string };
type Preview = {
  direction: 'next' | 'previous';
  title: string;
  ready: boolean;
};
/** Deliberate horizontal travel confirms a chapter change on release. Browser
 * edge navigation, vertical scrolling, text selection and controls retain their
 * native behavior. Toolbar navigation remains the non-gesture alternative. */
export function useChapterSwipe(
  scroll: RefObject<HTMLElement | null>,
  previous: Destination | undefined,
  next: Destination | undefined,
  open: (id: string, restore: boolean, direction: 'next' | 'previous') => void,
  suspended: boolean,
) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const latest = useRef({ previous, next, open, suspended });
  latest.current = { previous, next, open, suspended };
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    let gesture: {
      x: number;
      y: number;
      horizontal: boolean;
      dx: number;
      threshold: number;
    } | null = null;
    const selection = () => Boolean(window.getSelection()?.toString());
    const clear = () => {
      gesture = null;
      setPreview(null);
    };
    const start = (event: TouchEvent) => {
      // A second finger cancels an already-previewed swipe too.
      clear();
      const point = event.touches[0];
      const target = event.target;
      if (
        !point ||
        event.touches.length !== 1 ||
        latest.current.suspended ||
        !matchMedia('(max-width: 600px)').matches ||
        selection() ||
        !(target instanceof Element) ||
        target.closest(
          'button, a, input, select, textarea, summary, .cg-wrap, .portrait',
        ) ||
        point.clientX < 24 ||
        point.clientX > innerWidth - 24
      )
        return;
      // At least 72px and 22% of the reading viewport (capped at 120px).
      gesture = {
        x: point.clientX,
        y: point.clientY,
        horizontal: false,
        dx: 0,
        threshold: Math.max(72, Math.min(120, element.clientWidth * 0.22)),
      };
    };
    const move = (event: TouchEvent) => {
      const point = event.touches[0];
      if (!gesture || !point) return;
      if (
        event.touches.length !== 1 ||
        selection() ||
        latest.current.suspended
      ) {
        clear();
        return;
      }
      const dx = point.clientX - gesture.x;
      const dy = point.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx) / 1.5) {
          clear();
          return;
        }
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        gesture.horizontal = true;
      }
      if (Math.abs(dy) > Math.max(30, Math.abs(dx) * 0.65)) {
        clear();
        return;
      }
      if (event.cancelable) event.preventDefault();
      gesture.dx = dx;
      const direction = dx < 0 ? 'next' : 'previous';
      const destination = latest.current[direction];
      setPreview({
        direction,
        title:
          destination?.title ??
          (direction === 'next' ? '已是最后一篇' : '已是第一篇'),
        ready: Boolean(destination) && Math.abs(dx) >= gesture.threshold,
      });
    };
    const end = (event: TouchEvent) => {
      if (event.touches.length) {
        clear();
        return;
      }
      if (gesture?.horizontal && !selection() && !latest.current.suspended) {
        if (event.cancelable) event.preventDefault();
        const direction = gesture.dx < 0 ? 'next' : 'previous';
        const destination = latest.current[direction];
        if (destination && Math.abs(gesture.dx) >= gesture.threshold)
          latest.current.open(destination.id, false, direction);
      }
      clear();
    };
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end, { passive: false });
    element.addEventListener('touchcancel', clear);
    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', clear);
    };
  }, [scroll]);
  return preview;
}
