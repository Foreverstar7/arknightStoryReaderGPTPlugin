import { useEffect, useRef } from 'react';

type Page = 'library' | 'chapters' | 'reader';
export type Motion = 'home' | 'chapters' | 'read' | 'next' | 'previous';
type TransitionRequest = {
  from: Page;
  to: Page;
  motion?: Motion;
  isCurrent: () => boolean;
  beforeCapture: () => void;
  commit: () => void;
  failed: (error: unknown) => void;
};

/** DOM animation adapter. Navigation owns requests, errors and atomic commits. */
export function usePageTransition() {
  const stage = useRef<HTMLDivElement>(null);
  const transition = useRef<{
    animation: ViewTransition;
    settled: Promise<void>;
  } | null>(null);
  const fallbackAnimation = useRef<Animation | null>(null);
  function cancel() {
    transition.current?.animation.skipTransition();
    fallbackAnimation.current?.cancel();
  }
  useEffect(() => cancel, []);
  function updateBounds() {
    document.documentElement.style.setProperty(
      '--reader-stage-top',
      `${Math.ceil(stage.current?.getBoundingClientRect().top ?? 0)}px`,
    );
  }
  async function run({
    from,
    to,
    motion,
    isCurrent,
    beforeCapture,
    commit,
    failed,
  }: TransitionRequest) {
    const previous = transition.current;
    cancel();
    if (previous) await previous.settled;
    if (!isCurrent()) return;
    // The notice is outside the transition content and must leave before capture.
    beforeCapture();
    const kind =
      motion ??
      (to === 'library' ? 'home' : to === 'chapters' ? 'chapters' : 'read');
    const update = () => {
      if (!isCurrent()) return;
      commit();
      updateBounds();
    };
    // Document view-transition snapshots render above modal dialogs. Refreshing
    // underneath settings must commit directly, without replaying a page reveal.
    if (
      document.querySelector('dialog[open]') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      update();
      return;
    }
    document.documentElement.dataset.navigation = kind;
    updateBounds();
    document.documentElement.dataset.coverTransition = String(
      (from === 'library' && to === 'chapters') ||
        (from === 'chapters' && to === 'library'),
    );
    if (!document.startViewTransition) {
      const turning = kind === 'next' || kind === 'previous';
      update();
      const incoming = turning
        ? stage.current?.querySelector<HTMLElement>('.reader-scroll')
        : stage.current;
      // Without snapshot support keep the existing small, flat slide.
      const x = kind === 'previous' ? -8 : kind === 'next' ? 8 : 0;
      fallbackAnimation.current =
        incoming?.animate(
          [
            { transform: `translate(${x}px, ${turning ? 0 : 8}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration: 220, easing: 'cubic-bezier(.2,.7,.25,1)' },
        ) ?? null;
      return;
    }
    const active = document.startViewTransition(update);
    // Skipping only cancels the animation; the update callback still runs.
    // A failed callback is an actual state-commit failure, owned by navigation.
    // https://www.w3.org/TR/css-view-transitions-1/#viewtransition
    void active.ready.catch(() => undefined); // Animation may be skipped; state has its own result below.
    void active.updateCallbackDone.catch((error: unknown) => {
      if (isCurrent()) failed(error);
    });
    const release = () => {
      if (transition.current?.animation === active) transition.current = null;
    };
    // Both outcomes release the DOM lifetime; callback errors were reported above.
    const settled = active.finished.then(release, release);
    transition.current = { animation: active, settled };
  }
  return { stage, cancel, run };
}
