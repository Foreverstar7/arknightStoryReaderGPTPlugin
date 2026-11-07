import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep the complete floating image within the reader viewport. */
export function PortraitPopover({
  anchorId,
  label,
  focusOnOpen,
  children,
  keepOpen,
  leave,
}: {
  anchorId: string;
  label: string;
  focusOnOpen: boolean;
  children: ReactNode;
  keepOpen?: () => void;
  leave?: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 110 });
  useLayoutEffect(() => {
    if (focusOnOpen) panel.current?.focus({ preventScroll: true });
  }, [anchorId, focusOnOpen]);
  useLayoutEffect(() => {
    const anchor = document.getElementById(anchorId);
    const element = panel.current;
    if (!anchor || !element) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const minimum =
        (document.querySelector('.source-note')?.getBoundingClientRect()
          .bottom ?? 0) + 8;
      const top =
        rect.bottom + 8 + element.offsetHeight <= innerHeight - 12
          ? rect.bottom + 8
          : Math.max(minimum, rect.top - element.offsetHeight - 8);
      setPosition({
        left: Math.max(
          12,
          Math.min(rect.left, innerWidth - element.offsetWidth - 12),
        ),
        top: Math.max(
          minimum,
          Math.min(
            top,
            Math.max(minimum, innerHeight - element.offsetHeight - 12),
          ),
        ),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    const scroller = anchor.closest('.reader-scroll');
    scroller?.addEventListener('scroll', place, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      scroller?.removeEventListener('scroll', place);
    };
  }, [anchorId]);
  return createPortal(
    <div
      ref={panel}
      className="portrait"
      style={position}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onPointerEnter={keepOpen}
      onPointerLeave={leave}
    >
      {children}
    </div>,
    document.body,
  );
}
