import { useRef } from 'react';
import type { ReadingState, Story } from '../../shared/contracts.js';
import { progressLabel, storyProgress } from '../../domain/reading.js';
import type { ReaderTransport } from '../transport.js';
import { SourceImage, useVisible } from './SourceImage.js';
import { groupStories, storyTypeLabel } from '../catalog.js';

export function Cover({
  story,
  transport,
  retryable = true,
}: {
  story: Story;
  transport: ReaderTransport;
  retryable?: boolean;
}) {
  const { ref, seen } = useVisible<HTMLDivElement>(story.source === 'prts');
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
}: {
  stories: Story[];
  state: ReadingState;
  open: (story: Story) => void;
  transport: ReaderTransport;
}) {
  const sections = useRef(new Map<string, HTMLElement>());
  const groups = groupStories(stories);
  return (
    <div className="library page">
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
      <main className="library-scroll">
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
                  <Cover story={story} transport={transport} />
                  <span className="card-caption">
                    <strong>{story.title}</strong>
                    <span className="card-meta">
                      <span>
                        {storyTypeLabel(story)} / {story.chapters.length} 篇
                      </span>
                      <span>
                        {progressLabel(storyProgress(story, state.records))}
                      </span>
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
