import { useRef, useState } from 'react';
import type { ReadingState, Story } from '../../shared/contracts.js';
import { chapterProgress, progressLabel } from '../../domain/reading.js';
import { Cover } from './Library.js';

export function ChapterList({
  story,
  state,
  open,
}: {
  story: Story;
  state: ReadingState;
  open: (id: string, restore: boolean) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; scroll: number } | null>(null);
  const dragged = useRef(false);
  const [axis, setAxis] = useState(0);
  const recent = Object.values(state.records)
    .filter((record) => record.storyId === story.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const recentTitle = story.chapters.find(
    (chapter) => chapter.id === recent?.chapterId,
  )?.title;
  return (
    <main className="chapters page">
      <div className="book-intro">
        <div className="mini-cover">
          <Cover story={story} />
        </div>
        <div className="book-heading">
          <span className="eyebrow">STORY / {story.type}</span>
          <h1>{story.title}</h1>
          <p className="muted">{story.chapters.length} 篇记录 · 从左到右浏览</p>
          {recent && (
            <button
              className="primary continue"
              onClick={() => open(recent.chapterId, true)}
              title={`继续阅读 ${recentTitle}`}
            >
              继续阅读 <span>{recentTitle}</span> ↗
            </button>
          )}
        </div>
      </div>
      <p className="timeline-help muted">
        拖动横轴、横向滚动，或使用下方浏览线。
      </p>
      <div
        className="timeline-scroll"
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label="横向篇目轴"
        onScroll={(event) => {
          const element = event.currentTarget;
          setAxis(
            element.scrollWidth === element.clientWidth
              ? 0
              : (element.scrollLeft /
                  (element.scrollWidth - element.clientWidth)) *
                  100,
          );
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            scroll: event.currentTarget.scrollLeft,
          };
          dragged.current = false;
        }}
        onPointerMove={(event) => {
          if (!drag.current || event.buttons !== 1) return;
          const delta = drag.current.x - event.clientX;
          if (Math.abs(delta) > 5) {
            dragged.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (dragged.current)
            event.currentTarget.scrollLeft = drag.current.scroll + delta;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClickCapture={(event) => {
          if (dragged.current) {
            event.preventDefault();
            event.stopPropagation();
            dragged.current = false;
          }
        }}
      >
        <div className="timeline">
          {story.chapters.map((chapter, index) => (
            <div className="timeline-node" key={chapter.id}>
              <span className="node-dot" />
              <button
                className="chapter-card"
                onClick={() => open(chapter.id, false)}
                aria-label={`阅读 ${chapter.code} ${chapter.title}`}
              >
                <span className="chapter-code">
                  {chapter.code}
                  <span>{String(index + 1).padStart(2, '0')}</span>
                </span>
                <strong>{chapter.title}</strong>
                {chapter.summary && (
                  <span className="chapter-summary">{chapter.summary}</span>
                )}
                <span className="chapter-percent">
                  已读{' '}
                  {progressLabel(
                    chapterProgress(story, chapter.id, state.records),
                  )}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <label className="axis-seek">
        <span>浏览线</span>
        <input
          aria-label="篇目浏览线"
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={axis}
          onChange={(event) => {
            const element = scroller.current;
            if (element)
              element.scrollLeft =
                ((element.scrollWidth - element.clientWidth) *
                  Number(event.target.value)) /
                100;
          }}
        />
        <span>{story.chapters.length} 篇</span>
      </label>
    </main>
  );
}
