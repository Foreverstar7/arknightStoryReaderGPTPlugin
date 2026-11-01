import { useRef } from 'react';
import type { ReadingState, Story } from '../../shared/contracts.js';
import { progressLabel, storyProgress } from '../../domain/reading.js';

export function Cover({ story }: { story: Story }) {
  const transitionName = `cover-${Array.from(story.id, (letter) => letter.codePointAt(0)?.toString(16) ?? '').join('-')}`;
  return (
    <div className="cover" style={{ viewTransitionName: transitionName }}>
      <span>
        {story.coverLabel}
        <small>
          {story.source === 'prts'
            ? 'PRTS 剧情 · 封面待接入'
            : '原创档案 · 布局样例'}
        </small>
      </span>
    </div>
  );
}

export function Library({
  stories,
  state,
  open,
}: {
  stories: Story[];
  state: ReadingState;
  open: (story: Story) => void;
}) {
  const sections = useRef(new Map<string, HTMLElement>());
  const categories = [...new Set(stories.map((story) => story.category))];
  return (
    <div className="library page">
      <aside className="category-rail" aria-label="剧情分类">
        <span className="eyebrow">INDEX / 分类</span>
        {categories.map((category) => (
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
        {categories.map((category) => (
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
              {stories
                .filter((story) => story.category === category)
                .map((story) => (
                  <button
                    className="story-card"
                    key={story.id}
                    aria-label={`打开剧情：${story.title}`}
                    onClick={() => open(story)}
                  >
                    <Cover story={story} />
                    <span className="card-caption">
                      <strong>{story.title}</strong>
                      <span className="card-meta">
                        <span>
                          {story.type} / {story.chapters.length} 篇
                        </span>
                        <span>
                          {progressLabel(storyProgress(story, state.records))}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
