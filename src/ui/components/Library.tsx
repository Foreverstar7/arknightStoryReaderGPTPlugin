import { useLayoutEffect, useRef } from 'react';
import type { ReadingState, Story } from '../../shared/contracts.js';
import { storyProgress } from '../../domain/reading.js';
import { ProgressRing } from './ProgressRing.js';
import type { ReaderTransport } from '../transport.js';
import { SourceImage, useVisible } from './SourceImage.js';
import { groupStories, storyTypeLabel } from '../catalog.js';

export type LibraryPosition = {
  scrollTop: number;
  storyId?: string;
  offset: number;
};

export function captureLibraryPosition(node: HTMLElement): LibraryPosition {
  const bounds = node.getBoundingClientRect();
  const anchor =
    node.scrollTop > 0
      ? Array.from(node.querySelectorAll<HTMLElement>('.story-card')).find(
          (card) => {
            const box = card.getBoundingClientRect();
            return box.bottom > bounds.top && box.top < bounds.bottom;
          },
        )
      : undefined;
  return {
    scrollTop: node.scrollTop,
    storyId: anchor?.dataset.storyId,
    offset: anchor ? anchor.getBoundingClientRect().top - bounds.top : 0,
  };
}

export function Cover({
  story,
  transport,
  retryable = true,
  active = true,
}: {
  story: Story;
  transport: ReaderTransport;
  retryable?: boolean;
  active?: boolean;
}) {
  const { ref, seen } = useVisible<HTMLDivElement>(
    story.source === 'prts' && active,
  );
  const transitionName = `cover-${Array.from(story.id, (letter) => letter.codePointAt(0)?.toString(16) ?? '').join('-')}`;
  return (
    <div
      className="cover"
      ref={ref}
      style={{ viewTransitionName: transitionName }}
    >
      {story.source === 'prts' && (
        <SourceImage
          input={{ kind: 'cover', storyId: story.id }}
          transport={transport}
          label={`${story.title} 封面`}
          cover
          retryable={retryable}
          enabled={seen}
        />
      )}
      <span className="cover-label">
        {story.coverLabel}
        <small>
          {story.source === 'prts' ? 'PRTS 剧情' : '原创档案 · 布局样例'}
        </small>
      </span>
    </div>
  );
}

export function Library({
  stories,
  state,
  open,
  transport,
  active,
  initialPosition,
}: {
  stories: Story[];
  state: ReadingState;
  open: (story: Story) => void;
  transport: ReaderTransport;
  active: boolean;
  initialPosition: LibraryPosition | null;
}) {
  const sections = useRef(new Map<string, HTMLElement>());
  const scroller = useRef<HTMLElement>(null);
  const groups = groupStories(stories);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!active || !node) return;
    if (initialPosition) {
      node.scrollTop = initialPosition.scrollTop;
      const anchor = Array.from(
        node.querySelectorAll<HTMLElement>('.story-card'),
      ).find((card) => card.dataset.storyId === initialPosition.storyId);
      if (anchor)
        node.scrollTop +=
          anchor.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          initialPosition.offset;
    }
    // Restore before the incoming snapshot if the grid reflowed while hidden.
    // Keep the component mounted so loaded covers do not revert to placeholders.
  }, [active, initialPosition]);
  return (
    <div className="library page" hidden={!active}>
      <aside className="category-rail" aria-label="剧情分类">
        <span className="eyebrow">INDEX / 分类</span>
        {groups.map(({ category }) => (
          <button
            key={category}
            onClick={() =>
              sections.current.get(category)?.scrollIntoView({ block: 'start' })
            }
          >
            {category}
          </button>
        ))}
        <small>
          RHODES ISLAND
          <br />
          STORY ARCHIVE
        </small>
      </aside>
      <main className="library-scroll" ref={scroller}>
        <div className="library-intro">
          <span className="eyebrow">ARKNIGHTS / STORY ARCHIVE</span>
          <h1>剧情档案</h1>
          <p className="muted">从一段记录开始，沿着故事继续。</p>
        </div>
        {stories.length === 0 && (
          <p className="empty">目录暂时没有可用剧情。</p>
        )}
        {groups.map(({ category, stories: group }) => (
          <section
            key={category}
            ref={(element) => {
              if (element) sections.current.set(category, element);
            }}
          >
            <div className="section-heading">
              <h2>{category}</h2>
              <span />
            </div>
            <div className="card-grid">
              {group.map((story) => (
                <article
                  className="story-card"
                  key={story.id}
                  data-story-id={story.id}
                >
                  <Cover story={story} transport={transport} active={active} />
                  <span className="card-caption">
                    <strong>{story.title}</strong>
                    <span className="card-meta">
                      <span>
                        {storyTypeLabel(story)} / {story.chapters.length} 篇
                      </span>
                      <ProgressRing
                        title={story.title}
                        value={
                          story.chapters.some(
                            (chapter) =>
                              state.records[chapter.id] !== undefined,
                          )
                            ? storyProgress(story, state.records)
                            : 0
                        }
                      />
                    </span>
                  </span>
                  <button
                    className="story-open"
                    type="button"
                    aria-label={`打开剧情：${story.title}`}
                    onClick={() => open(story)}
                  />
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
