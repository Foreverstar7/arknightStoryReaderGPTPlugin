// Keep the original 12-unit choreography. Motion consumes 380svh; five complete
// poses consume another 170svh without advancing any animation. Together with
// the sticky viewport this yields a 650svh section, with no timers or input lock.
export const WALK_CONTENT_DURATION = 12;
const motionSvh = 380;
const holds = [
  { id: 'sidebar', at: 2.18, span: 24 },
  { id: 'library', at: 3.45, span: 36 },
  { id: 'chapters', at: 5.85, span: 32 },
  { id: 'chapter-selected', at: 7.56, span: 28 },
  { id: 'reader', at: 8.9, span: 50 },
] as const;

export const WALK_HOLDS = holds.map((hold, index) => {
  const earlier = holds
    .slice(0, index)
    .reduce((sum, item) => sum + item.span, 0);
  const start = (hold.at / WALK_CONTENT_DURATION) * motionSvh + earlier;
  return { ...hold, start, end: start + hold.span };
});
export const WALK_SCROLL_SVH =
  motionSvh + holds.reduce((sum, hold) => sum + hold.span, 0);
export const WALK_SECTION_SVH = 100 + WALK_SCROLL_SVH;

/** A stop consumes real scroll distance, not time. Seeking, reversing and
 * resizing always produce the same frame at the same scroll position. */
export function walkthroughFrame(distance: number): {
  time: number;
  hold: (typeof holds)[number]['id'] | null;
} {
  const position = Number.isFinite(distance)
    ? Math.max(0, Math.min(WALK_SCROLL_SVH, distance))
    : 0;
  let held = 0;
  for (const hold of WALK_HOLDS) {
    if (position < hold.start) break;
    if (position <= hold.end) return { time: hold.at, hold: hold.id };
    held += hold.span;
  }
  return {
    time: ((position - held) / motionSvh) * WALK_CONTENT_DURATION,
    hold: null,
  };
}
