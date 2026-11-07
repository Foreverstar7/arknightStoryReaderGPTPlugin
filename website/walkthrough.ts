import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

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
  const cursor = find('.walk-cursor');
  const movingCover = find('.walk-moving-cover');
  const source = find('.walk-cover-selected img');
  const target = find('.walk-book-cover');
  const caption = document.getElementById('walk-caption');
  const steps = [...root.querySelectorAll('.walk-steps li')];
  const media = gsap.matchMedia();
  // Add reading space between actions, not slower clicks or cover motion.
  // Positions below retain the original 12-unit choreography; cue() inserts
  // six units of stable views. Keep the 430svh span in walkthrough.css aligned.
  const holds = [
    { before: 0.5, length: 0.8 },
    { before: 3.6, length: 1.0 },
    { before: 6.0, length: 1.2 },
    { before: 8.0, length: 1.0 },
    { before: 9.1, length: 2.0 },
  ];
  const duration = 12 + holds.reduce((sum, hold) => sum + hold.length, 0);
  const cue = (time: number) =>
    time +
    holds.reduce(
      (sum, hold) => sum + (hold.before <= time ? hold.length : 0),
      0,
    );
  root.dataset.timelineDuration = String(duration);
  const captions = [
    '打开 ChatGPT，从侧栏进入阅读器。',
    '浏览封面，选择想读的故事。',
    '沿着篇目轴，找到这一章。',
    '进入正文，把注意力留给故事。',
  ];
  function setStage(time: number) {
    const index =
      time < cue(2.5) ? 0 : time < cue(5.2) ? 1 : time < cue(8.2) ? 2 : 3;
    root.dataset.scene = ['home', 'library', 'chapters', 'reader'][index];
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
        gsap.set([home, library, chapters, cursor, movingCover], {
          autoAlpha: 0,
        });
        gsap.set(reader, { autoAlpha: 1 });
        gsap.set('.walk-rail', { autoAlpha: 1 });
        setStage(duration);
        if (caption)
          caption.textContent = '打开插件，选择剧情与篇目，开始阅读。';
        return () => root.classList.remove('motion-static');
      }
      root.classList.add('motion-ready');
      gsap.set([library, chapters, reader, cursor, movingCover, '.walk-rail'], {
        autoAlpha: 0,
      });
      gsap.set('.walk-drawer', { x: 0, xPercent: -100 });
      gsap.set('.walk-progress span', { scaleX: 0, transformOrigin: 'left' });
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: 'top 16px',
          end: 'bottom bottom',
          scrub: true,
          invalidateOnRefresh: true,
        },
        onUpdate: () => setStage(timeline.time()),
      });
      timeline
        .fromTo(
          home,
          { autoAlpha: 1, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.55 },
          cue(0),
        )
        .to(
          '.walk-drawer',
          { xPercent: 0, duration: 0.65, ease: 'power2.inOut' },
          cue(0.5),
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
          cue(1.0),
        )
        .fromTo(
          '.menu-ring',
          { scale: 0.8, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.2 },
          cue(1.7),
        )
        .to(cursor, { scale: 0.85, duration: 0.12 }, cue(1.8))
        .to(cursor, { scale: 1, autoAlpha: 0, duration: 0.25 }, cue(1.92))
        .to(home, { autoAlpha: 0, duration: 0.35 }, cue(2.2))
        .to(
          '.walk-drawer',
          { xPercent: -100, duration: 0.5, ease: 'power2.inOut' },
          cue(2.25),
        )
        .to('.walk-rail', { autoAlpha: 1, duration: 0.35 }, cue(2.4))
        .fromTo(
          library,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, duration: 0.55 },
          cue(2.5),
        )
        .fromTo(
          '.walk-cover',
          { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.07 },
          cue(2.65),
        )
        .to(
          cursor,
          {
            autoAlpha: 1,
            x: () => box(source).x + box(source).width * 0.65,
            y: () => box(source).y + box(source).height * 0.65,
            duration: 0.6,
          },
          cue(3.6),
        )
        .fromTo(
          '.cover-ring',
          { opacity: 0 },
          { opacity: 1, duration: 0.2 },
          cue(4.35),
        )
        .to(cursor, { scale: 0.85, duration: 0.1 }, cue(4.4))
        .to(cursor, { scale: 1, autoAlpha: 0, duration: 0.2 }, cue(4.5))
        .set(movingCover, { autoAlpha: 1 }, cue(4.95))
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
          cue(4.95),
        )
        .to(library, { autoAlpha: 0, duration: 0.35 }, cue(4.96))
        .fromTo(
          chapters,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.45 },
          cue(5.35),
        )
        .set(target, { autoAlpha: 0 }, cue(4.95))
        .set(target, { autoAlpha: 1 }, cue(5.75))
        .set(movingCover, { autoAlpha: 0 }, cue(5.75))
        .to(
          '.walk-chapter-track',
          { x: () => -axisShift(), duration: 1.35, ease: 'power1.inOut' },
          cue(6.0),
        )
        .to(
          '.walk-scroll-line span',
          { xPercent: 100, duration: 1.35 },
          cue(6.0),
        )
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
          cue(7.15),
        )
        .fromTo(
          '.walk-chapter-selected i',
          { scaleX: 0 },
          { scaleX: 1, duration: 0.25 },
          cue(7.6),
        )
        .to(cursor, { scale: 0.85, duration: 0.1 }, cue(7.7))
        .to(cursor, { scale: 1, autoAlpha: 0, duration: 0.25 }, cue(7.8))
        .to(chapters, { autoAlpha: 0, y: -10, duration: 0.45 }, cue(8.0))
        .fromTo(
          reader,
          { autoAlpha: 0, y: 15 },
          { autoAlpha: 1, y: 0, duration: 0.6 },
          cue(8.2),
        )
        .to(
          '.walk-reading-copy',
          { y: -110, duration: 2.25, ease: 'power1.inOut' },
          cue(9.1),
        )
        .to('.walk-progress span', { scaleX: 1, duration }, cue(0));
      return () => {
        root.classList.remove('motion-ready');
      };
    },
  );
}
