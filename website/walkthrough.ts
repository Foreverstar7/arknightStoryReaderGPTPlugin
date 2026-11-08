import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  WALK_CONTENT_DURATION,
  WALK_SCROLL_SVH,
  WALK_SECTION_SVH,
  walkthroughFrame,
} from './walkthrough-timing.js';

gsap.registerPlugin(ScrollTrigger);

export function initializeWalkthrough() {
  const section = document.querySelector<HTMLElement>('.walkthrough');
  if (!section) return;
  const root = section;
  const find = (selector: string) => {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`阅读流程演示缺少元素：${selector}`);
    return element;
  };
  const stage = find('.walk-stage');
  const library = find('.walk-library');
  const chapters = find('.walk-chapters');
  const reader = find('.walk-reader');
  const home = find('.walk-home');
  const search = find('.walk-search');
  const interlude = find('.walk-interlude');
  const cursor = find('.walk-cursor');
  const movingCover = find('.walk-moving-cover');
  const source = find('.walk-cover-selected img');
  const target = find('.walk-book-cover');
  const direction = find('.walk-direction');
  const caption = document.getElementById('walk-caption');
  const steps = [...root.querySelectorAll('.walk-steps li')];
  const media = gsap.matchMedia();
  root.style.setProperty('--walkthrough-span', `${WALK_SECTION_SVH}svh`);
  root.dataset.timelineDuration = String(WALK_CONTENT_DURATION);
  const movingHint = direction.textContent ?? '';
  const captions = [
    '打开 ChatGPT，从侧栏进入阅读器。',
    '浏览封面，选择想读的故事。',
    '沿着篇目轴，找到这一章。',
    '进入正文，把注意力留给故事。',
    '也可以在对话中，直接找想读的故事。',
    '点击剧情卡片，查看简介并选择篇目。',
  ];
  function setStage(time: number) {
    const index =
      time < 2.5
        ? 0
        : time < 5.2
          ? 1
          : time < 8.2
            ? 2
            : time < 12.3
              ? 3
              : time < 16.6
                ? 4
                : 5;
    root.dataset.scene = [
      'home',
      'library',
      'chapters',
      'reader',
      'search',
      'search-chapters',
    ][index];
    root.dataset.entrypoint = index < 4 ? 'sidebar' : 'conversation';
    if (caption) caption.textContent = captions[index] ?? '';
    steps.forEach((step, i) => step.classList.toggle('current', index === i));
  }
  // Offset geometry deliberately ignores current animated transforms, so a
  // resize/reverse computes the same cover path as the first forward pass.
  function box(element: HTMLElement) {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = element;
    while (node && node !== stage) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node =
        node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
    }
    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  }
  const axisShift = () =>
    Math.max(0, find('.walk-chapter-selected').offsetLeft - 24);
  media.add(
    {
      all: 'all',
      reduced: '(prefers-reduced-motion: reduce)',
      low: '(max-height: 480px)',
    },
    (context) => {
      const staticMode = context.conditions?.reduced || context.conditions?.low;
      root.classList.toggle('motion-static', Boolean(staticMode));
      if (staticMode) {
        gsap.set(
          [home, library, chapters, search, interlude, cursor, movingCover],
          {
            autoAlpha: 0,
          },
        );
        gsap.set(reader, { autoAlpha: 1 });
        gsap.set('.walk-rail', { autoAlpha: 1 });
        setStage(8.9);
        delete root.dataset.hold;
        direction.textContent = movingHint;
        if (caption)
          caption.textContent =
            '从侧栏浏览，或从对话搜索卡片，进入目录开始阅读。';
        return () => root.classList.remove('motion-static');
      }
      root.classList.add('motion-ready');
      gsap.set(
        [
          library,
          chapters,
          reader,
          search,
          interlude,
          cursor,
          movingCover,
          '.walk-rail',
        ],
        {
          autoAlpha: 0,
        },
      );
      gsap.set('.walk-drawer', { x: 0, xPercent: -100 });
      gsap.set('.walk-progress span', { scaleX: 0, transformOrigin: 'left' });
      const timeline = gsap.timeline({
        paused: true,
        defaults: { ease: 'none' },
      });
      timeline
        .fromTo(
          home,
          { autoAlpha: 1, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.55 },
          0,
        )
        .to(
          '.walk-drawer',
          { xPercent: 0, duration: 0.65, ease: 'power2.inOut' },
          0.5,
        )
        .fromTo(
          cursor,
          { autoAlpha: 0, x: 60, y: 80 },
          {
            autoAlpha: 1,
            x: () => box(find('.walk-menu-reader')).x + 112,
            y: () => box(find('.walk-menu-reader')).y + 26,
            duration: 0.65,
          },
          1.0,
        )
        .fromTo(
          '.menu-ring',
          { scale: 0.8, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.2 },
          1.7,
        )
        .to(cursor, { scale: 0.85, duration: 0.12 }, 1.8)
        .to(cursor, { scale: 1, autoAlpha: 0, duration: 0.25 }, 1.92)
        .to(home, { autoAlpha: 0, duration: 0.35 }, 2.2)
        .to(
          '.walk-drawer',
          { xPercent: -100, duration: 0.5, ease: 'power2.inOut' },
          2.25,
        )
        .to('.walk-rail', { autoAlpha: 1, duration: 0.35 }, 2.4)
        .fromTo(
          library,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, duration: 0.55 },
          2.5,
        )
        .fromTo(
          '.walk-cover',
          { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.07 },
          2.65,
        )
        .to(
          cursor,
          {
            autoAlpha: 1,
            x: () => box(source).x + box(source).width * 0.65,
            y: () => box(source).y + box(source).height * 0.65,
            duration: 0.6,
          },
          3.6,
        )
        .fromTo(
          '.cover-ring',
          { opacity: 0 },
          { opacity: 1, duration: 0.2 },
          4.35,
        )
        .to(cursor, { scale: 0.85, duration: 0.1 }, 4.4)
        .to(cursor, { scale: 1, autoAlpha: 0, duration: 0.2 }, 4.5)
        .set(movingCover, { autoAlpha: 1 }, 4.95)
        .fromTo(
          movingCover,
          {
            x: () => box(source).x,
            y: () => box(source).y,
            scaleX: () => box(source).width / movingCover.offsetWidth,
            scaleY: () => box(source).height / movingCover.offsetHeight,
          },
          {
            x: () => box(target).x,
            y: () => box(target).y,
            scaleX: () => box(target).width / movingCover.offsetWidth,
            scaleY: () => box(target).height / movingCover.offsetHeight,
            duration: 0.8,
            ease: 'power2.inOut',
            immediateRender: false,
          },
          4.95,
        )
        .to(library, { autoAlpha: 0, duration: 0.35 }, 4.96)
        .fromTo(
          chapters,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.45 },
          5.35,
        )
        .set(target, { autoAlpha: 0 }, 4.95)
        .set(target, { autoAlpha: 1 }, 5.75)
        .set(movingCover, { autoAlpha: 0 }, 5.75)
        .to(
          '.walk-chapter-track',
          { x: () => -axisShift(), duration: 1.35, ease: 'power1.inOut' },
          6.0,
        )
        .to('.walk-scroll-line span', { xPercent: 100, duration: 1.35 }, 6.0)
        .to(
          cursor,
          {
            autoAlpha: 1,
            x: () =>
              box(find('.walk-axis-viewport')).x +
              24 +
              find('.walk-chapter-selected').offsetWidth * 0.6,
            y: () => box(find('.walk-chapter-selected')).y + 44,
            duration: 0.4,
          },
          7.15,
        )
        .fromTo(
          '.walk-chapter-selected i',
          { scaleX: 0 },
          { scaleX: 1, duration: 0.25 },
          7.6,
        )
        .to(cursor, { scale: 0.85, duration: 0.1 }, 7.7)
        .to(cursor, { scale: 1, autoAlpha: 0, duration: 0.25 }, 7.8)
        .to(chapters, { autoAlpha: 0, y: -10, duration: 0.45 }, 8.0)
        .fromTo(
          reader,
          { autoAlpha: 0, y: 15 },
          { autoAlpha: 1, y: 0, duration: 0.6 },
          8.2,
        )
        .to(
          '.walk-reading-copy',
          { y: -110, duration: 2.25, ease: 'power1.inOut' },
          9.1,
        )
        .to(reader, { autoAlpha: 0, duration: 0.4 }, 12)
        .to(interlude, { autoAlpha: 1, duration: 0.35 }, 12.3)
        .to(interlude, { autoAlpha: 0, duration: 0.35 }, 13)
        .to(search, { autoAlpha: 1, duration: 0.4 }, 13.3)
        .fromTo(
          '.walk-search-query',
          { clipPath: 'inset(0 100% 0 0)' },
          { clipPath: 'inset(0 0% 0 0)', duration: 0.6 },
          13.5,
        )
        .fromTo(
          '.walk-search-answer',
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.5 },
          14.6,
        )
        .to(
          cursor,
          {
            autoAlpha: 1,
            x: () => box(find('.walk-search-card')).x + 140,
            y: () =>
              box(find('.walk-search-card')).y +
              find('.walk-search-card').offsetHeight -
              24,
            duration: 0.45,
          },
          15.7,
        )
        .to(cursor, { scale: 0.85, duration: 0.1 }, 16.2)
        .to(cursor, { scale: 1, autoAlpha: 0, duration: 0.2 }, 16.3)
        .to(search, { autoAlpha: 0, duration: 0.35 }, 16.45)
        .to(chapters, { autoAlpha: 1, y: 0, duration: 0.5 }, 16.8)
        .to(
          '.walk-progress span',
          { scaleX: 1, duration: WALK_CONTENT_DURATION },
          0,
        );
      const render = (progress: number) => {
        const frame = walkthroughFrame(progress * WALK_SCROLL_SVH);
        timeline.time(frame.time);
        setStage(frame.time);
        if (frame.hold) root.dataset.hold = frame.hold;
        else delete root.dataset.hold;
        direction.textContent = frame.hold ? '停留中 · 继续下滑' : movingHint;
      };
      ScrollTrigger.create({
        trigger: root,
        start: 'top 16px',
        end: 'bottom bottom',
        onUpdate: (self) => render(self.progress),
        onRefresh: (self) => {
          // Rewind before invalidating so `.to` tweens recapture their original
          // start values, then restore the scroll frame before the next paint.
          timeline.time(0, true).invalidate();
          render(self.progress);
        },
      });
      return () => {
        root.classList.remove('motion-ready');
        delete root.dataset.hold;
        direction.textContent = movingHint;
      };
    },
  );
}
