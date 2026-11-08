import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
  type PointerEvent,
} from 'react';

/** Manual collapse is sticky. Automatic mobile collapse uses accumulated travel
 * (40px down / 24px up) so small reading corrections don't flicker the chrome.
 * These are interaction thresholds, not source-data or reading-progress rules. */
export function useReaderChrome(suspended: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const [manual, setManual] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const collapsed = manual || automatic;
  const scrollState = useRef<{
    node: HTMLElement;
    top: number;
    travel: number;
  } | null>(null);
  const pending = useRef<{
    scroller: HTMLElement;
    anchor: HTMLElement;
    top: number;
  } | null>(null);
  const ignoreUntil = useRef(0);
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
    ignoreUntil.current = performance.now() + 180;
    scrollState.current = null;
  }, [collapsed]);
  useEffect(() => {
    const media = matchMedia('(max-width: 600px) and (pointer: coarse)');
    const resize = () => {
      if (!media.matches) {
        capture();
        setAutomatic(false);
      }
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  function onScrollCapture(event: UIEvent<HTMLDivElement>) {
    const node = event.target;
    if (
      !(node instanceof HTMLElement) ||
      !node.matches('.library-scroll, .chapters, .reader-scroll')
    )
      return;
    if (
      manual ||
      suspended ||
      performance.now() < ignoreUntil.current ||
      !matchMedia('(max-width: 600px) and (pointer: coarse)').matches ||
      root.current?.querySelector(
        '.reading-index.is-open, .portrait, dialog[open]',
      )
    ) {
      scrollState.current = null;
      return;
    }
    const previous = scrollState.current;
    const delta = previous?.node === node ? node.scrollTop - previous.top : 0;
    let travel = previous?.node === node ? previous.travel : 0;
    if (Math.sign(delta) !== Math.sign(travel)) travel = 0;
    travel += delta;
    scrollState.current = { node, top: node.scrollTop, travel };
    if (!automatic && travel >= 40) {
      capture();
      setAutomatic(true);
    } else if (automatic && (travel <= -24 || node.scrollTop <= 0)) {
      capture();
      setAutomatic(false);
    }
  }
  return {
    root,
    collapsed,
    onScrollCapture,
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (
        event.target instanceof Element &&
        event.target.closest('button, input, select, a')
      )
        ignoreUntil.current = performance.now() + 600;
    },
    toggle: () => {
      capture();
      setManual(!collapsed);
      setAutomatic(false);
    },
  };
}
