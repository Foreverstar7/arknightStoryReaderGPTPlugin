import { useLayoutEffect, useRef, useState } from 'react';
import type { ReadingState, Story } from '../../shared/contracts.js';
import { storyProgress, storyProgressHint } from '../../domain/reading.js';
import { ProgressRing } from './ProgressRing.js';
import type { ReaderTransport } from '../transport.js';
import { SourceImage, useVisible } from './SourceImage.js';
import { groupStories, storyTypeLabel } from '../catalog.js';
import { supplementCover } from '../../shared/cover-policy.js';
import mainSupplement from '../assets/main-supplement.webp?inline';
import eventSupplement from '../assets/event-supplement.webp?inline';
import type { CatalogRefreshStatus } from '../useCatalogRefresh.js';
import type { ScoreMovement, ScoreNode } from '../../shared/score.js';
import type { ScoreViewState } from '../useScoreCatalog.js';
import { ScoreTrack } from './ScoreTrack.js';

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
  const supplement = supplementCover(story);
  const hasImage = story.source === 'prts' || story.imagesAvailable === true;
  const { ref, seen } = useVisible<HTMLDivElement>(
    hasImage && !supplement && active,
  );
  const transitionName = `cover-${Array.from(story.id, (letter) => letter.codePointAt(0)?.toString(16) ?? '').join('-')}`;
  return (
    <div
      className="cover"
      data-cover-kind={supplement ? 'supplement' : 'image'}
      ref={ref}
      style={{ viewTransitionName: transitionName }}
    >
      {supplement && (
        <img
          className="supplement-cover"
          src={supplement.art === 'main' ? mainSupplement : eventSupplement}
          alt=""
          loading="lazy"
        />
      )}
      {hasImage && !supplement && (
        <SourceImage
          key={story.id}
          input={{ kind: 'cover', storyId: story.id }}
          transport={transport}
          label={`${story.title} 封面`}
          cover
          retryable={retryable}
          enabled={seen}
        />
      )}
      <span
        className="cover-label"
        role={supplement ? 'img' : undefined}
        aria-label={
          supplement
            ? `${supplement.title} · 应用原创封面 · 非官方图片`
            : undefined
        }
      >
        {supplement?.title ?? story.coverLabel}
        <small>
          {supplement
            ? '非官方图片'
            : story.source === 'prts'
              ? 'PRTS 剧情'
              : '原创档案 · 布局样例'}
        </small>
      </span>
    </div>
  );
}

export function StoryCard({
  story,
  state,
  transport,
  active,
  open,
  movement,
  highlighted = false,
}: {
  story: Story;
  state: ReadingState;
  transport: ReaderTransport;
  active: boolean;
  open: (story: Story) => void;
  movement?: string;
  highlighted?: boolean;
}) {
  return (
    <article
      className={`story-card${highlighted ? ' score-highlight' : ''}`}
      data-story-id={story.id}
    >
      <Cover story={story} transport={transport} active={active} />
      <span className="card-caption">
        <strong>{story.title}</strong>
        <span className="card-meta">
          <span>
            {storyTypeLabel(story)} / {story.chapters.length} 篇
            {movement && <span className="movement-badge">{movement}</span>}
          </span>
          <ProgressRing
            title={story.title}
            unknownHint={storyProgressHint(story, state.records)}
            value={
              story.chapters.some(
                (chapter) => state.records[chapter.id] !== undefined,
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
  );
}

type BrowsingPosition = {
  top: number;
  tracks: Map<string, number>;
  selected: string;
};
export function Library({
  stories,
  state,
  open,
  transport,
  active,
  initialPosition,
  refreshStatus,
  refresh,
  score,
  retryScore,
  mode,
  changeMode,
}: {
  stories: Story[];
  state: ReadingState;
  open: (story: Story) => void;
  transport: ReaderTransport;
  active: boolean;
  initialPosition: LibraryPosition | null;
  refreshStatus: CatalogRefreshStatus;
  refresh: () => void;
  score: ScoreViewState;
  retryScore: () => void;
  mode: 'type' | 'movement';
  changeMode: (mode: 'type' | 'movement') => void;
}) {
  const sections = useRef(new Map<string, HTMLElement>());
  const scroller = useRef<HTMLElement>(null);
  const groups = groupStories(stories);
  const positions = useRef(new Map<string, BrowsingPosition>());
  const tracks = useRef(new Map<string, HTMLDivElement>());
  const [selected, setSelected] = useState('');
  const [highlight, setHighlight] = useState('');
  const [returns, setReturns] = useState<
    { position: BrowsingPosition; key: string; title: string }[]
  >([]);
  const memberships = new Map(
    score.data?.movements.flatMap((movement) =>
      movement.nodes.flatMap((node) =>
        node.kind === 'story' ? [[node.storyId, movement.title] as const] : [],
      ),
    ) ?? [],
  );
  const movements: ScoreMovement[] = [...(score.data?.movements ?? [])];
  const other = stories.filter((story) => !memberships.has(story.id));
  if (other.length)
    movements.push({
      id: 'score:other',
      code: 'OTHER',
      title: '其他',
      collection: true,
      nodes: other.map((story) => ({ kind: 'story', storyId: story.id })),
    });
  const navigationGroups =
    mode === 'type'
      ? groups.map((group) => ({ id: group.category, title: group.category }))
      : movements.map((group) => ({ id: group.id, title: group.title }));
  function capture(): BrowsingPosition {
    return {
      top: scroller.current?.scrollTop ?? 0,
      selected,
      tracks: new Map(
        [...tracks.current].map(([id, track]) => [id, track.scrollLeft]),
      ),
    };
  }
  function restore(position: BrowsingPosition) {
    setSelected(position.selected);
    for (const [id, left] of position.tracks) {
      const track = tracks.current.get(id);
      if (track) track.scrollLeft = left;
    }
    if (scroller.current) scroller.current.scrollTop = position.top;
  }
  function goTo(id: string) {
    const container = scroller.current;
    const section = sections.current.get(id);
    if (!container || !section) return;
    container.scrollTop +=
      section.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      12;
    setSelected(id);
  }
  useLayoutEffect(() => {
    const position = positions.current.get(mode);
    if (position) restore(position);
    else if (scroller.current) scroller.current.scrollTop = 0;
  }, [mode]);
  function jump(
    node: Extract<ScoreNode, { kind: 'junction' }>,
    movement: ScoreMovement,
  ) {
    const track = tracks.current.get(node.targetMovementId);
    const card = Array.from(
      track?.querySelectorAll<HTMLElement>('.story-card') ?? [],
    ).find((item) => item.dataset.storyId === node.targetStoryId);
    if (!track || !card) return;
    const sourcePosition = { ...capture(), selected: movement.id };
    setReturns((current) => [
      ...current,
      { position: sourcePosition, key: node.key, title: movement.title },
    ]);
    track.scrollLeft +=
      card.getBoundingClientRect().left -
      track.getBoundingClientRect().left -
      Math.max(0, (track.clientWidth - card.clientWidth) / 2);
    goTo(node.targetMovementId);
    if (matchMedia('(max-width: 600px)').matches && scroller.current)
      scroller.current.scrollTop +=
        card.getBoundingClientRect().top - track.getBoundingClientRect().top;
    if (scroller.current) {
      const bounds = scroller.current.getBoundingClientRect();
      const target = card.getBoundingClientRect();
      if (target.bottom > bounds.bottom - 12)
        scroller.current.scrollTop += target.bottom - bounds.bottom + 12;
      else if (target.top < bounds.top + 12)
        scroller.current.scrollTop += target.top - bounds.top - 12;
    }
    setHighlight(node.targetStoryId);
    card
      .querySelector<HTMLButtonElement>('.story-open')
      ?.focus({ preventScroll: true });
  }
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
        <span className="eyebrow">
          INDEX / {mode === 'type' ? '分类' : '乐章'}
        </span>
        {mode === 'movement' && (
          <label className="movement-select">
            乐章
            <select
              aria-label="选择乐章"
              value={selected || navigationGroups[0]?.id || ''}
              onChange={(event) => goTo(event.target.value)}
            >
              {navigationGroups.map((group) => (
                <option value={group.id} key={group.id}>
                  {group.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {navigationGroups.map(({ id, title }) => (
          <button
            key={id}
            className={mode === 'movement' ? 'movement-nav' : undefined}
            aria-current={selected === id ? 'location' : undefined}
            onClick={() => goTo(id)}
          >
            {title}
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
          <div className="library-heading">
            <h1>剧情档案</h1>
            <fieldset className="catalog-modes" aria-label="目录浏览方式">
              {(['type', 'movement'] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="catalog-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      positions.current.set(mode, capture());
                      setSelected('');
                      changeMode(value);
                    }}
                  />
                  <span>{value === 'type' ? '按类型' : '按乐章'}</span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              onClick={() => {
                if (refreshStatus.phase !== 'loading') refresh();
              }}
              aria-disabled={refreshStatus.phase === 'loading'}
              aria-busy={refreshStatus.phase === 'loading'}
              aria-label="刷新目录"
              aria-describedby="catalog-refresh-status"
            >
              <span aria-hidden="true">↻</span> 刷新目录
            </button>
          </div>
          <p className="muted">从一段记录开始，沿着故事继续。</p>
          <p
            className="catalog-refresh-status muted"
            id="catalog-refresh-status"
            role="status"
          >
            {refreshStatus.phase === 'loading'
              ? '正在刷新目录…'
              : refreshStatus.phase === 'ready'
                ? '目录刷新成功'
                : refreshStatus.phase === 'failed'
                  ? `目录刷新失败，保留已有目录。${refreshStatus.message} 可点击“刷新目录”重试。`
                  : '打开时自动检查目录更新'}
          </p>
          {(score.phase === 'loading' ||
            score.phase === 'failed' ||
            score.phase === 'unavailable') && (
            <p className="score-status muted" role="status">
              {score.phase === 'loading'
                ? '正在读取乐章资料…'
                : score.phase === 'failed'
                  ? `乐章资料读取失败${score.data ? '，保留已有资料' : ''}。${score.message}`
                  : '当前来源未提供乐章资料。'}
              {score.phase === 'failed' && (
                <button onClick={retryScore}>重试乐章资料</button>
              )}
            </p>
          )}
          {mode === 'movement' && score.data && (
            <p className="muted score-source">
              归属与连接取自{' '}
              <a href={score.data.sourceUrl} target="_blank" rel="noreferrer">
                {stories.some((story) => story.source === 'prts')
                  ? 'PRTS 曲谱'
                  : '原创样例资料'}
              </a>
              。
              {score.data.unmatchedNames.length > 0 && (
                <span>
                  当前目录尚未对应：{score.data.unmatchedNames.join('、')}。
                </span>
              )}
            </p>
          )}
        </div>
        {mode === 'movement' && returns.length > 0 && (
          <div className="score-return">
            <button
              onClick={() => {
                const target = returns[returns.length - 1];
                if (!target) return;
                restore(target.position);
                setHighlight('');
                setReturns((current) => current.slice(0, -1));
                Array.from(
                  scroller.current?.querySelectorAll<HTMLButtonElement>(
                    '[data-junction]',
                  ) ?? [],
                )
                  .find((item) => item.dataset.junction === target.key)
                  ?.focus({ preventScroll: true });
              }}
            >
              ↩ 返回{returns[returns.length - 1]?.title}
            </button>
          </div>
        )}
        {stories.length === 0 && (
          <p className="empty">目录暂时没有可用剧情。</p>
        )}
        {mode === 'type' &&
          groups.map(({ category, stories: group }) => (
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
                  <StoryCard
                    key={story.id}
                    story={story}
                    state={state}
                    transport={transport}
                    active={active}
                    open={open}
                    movement={memberships.get(story.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        {mode === 'movement' &&
          movements.map((movement) => (
            <section
              className="score-section"
              key={movement.id}
              ref={(element) => {
                if (element) sections.current.set(movement.id, element);
                else sections.current.delete(movement.id);
              }}
            >
              <div className="section-heading">
                <h2>{movement.title}</h2>
                <span />
              </div>
              {movement.collection && (
                <p className="muted">
                  {movement.id === 'score:other'
                    ? '当前曲谱未收录或尚未能对应的剧情，仍可正常阅读。'
                    : '本乐章仅作收录，不表示连续故事线。'}
                </p>
              )}
              <ScoreTrack
                movement={movement}
                stories={stories}
                register={(element) => {
                  if (element) tracks.current.set(movement.id, element);
                  else tracks.current.delete(movement.id);
                }}
                renderStory={(story) => (
                  <StoryCard
                    story={story}
                    state={state}
                    transport={transport}
                    active={active}
                    open={open}
                    movement={memberships.get(story.id)}
                    highlighted={highlight === story.id}
                  />
                )}
                jump={(node) => jump(node, movement)}
                movements={movements}
              />
            </section>
          ))}
      </main>
    </div>
  );
}
