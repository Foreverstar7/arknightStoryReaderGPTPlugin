import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReadingState, Story } from '../../shared/contracts.js';
import {
  chapterProgress,
  pendingReadingChapters,
  progressLabel,
} from '../../domain/reading.js';
import { Cover } from './Library.js';
import type { ReaderTransport } from '../transport.js';
import { useVisible } from './SourceImage.js';
import { storyTypeLabel } from '../catalog.js';
import { StoryIntro } from './StoryIntro.js';
import type { StoryPreparation } from '../useStoryPreparation.js';

function Summary({
  chapter,
  source,
  transport,
}: {
  chapter: Story['chapters'][number];
  source: Story['source'];
  transport: ReaderTransport;
}) {
  const { ref, seen } = useVisible<HTMLSpanElement>(source === 'prts');
  const [summary, setSummary] = useState(chapter.summary);
  const [url, setUrl] = useState(chapter.summarySourceUrl);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!seen || source !== 'prts') return;
    let active = true;
    void transport
      .call('reader_chapter_info', { chapterId: chapter.id })
      .then((info) => {
        if (active) {
          setSummary(info.summary);
          setUrl(info.sourceUrl);
          setError('');
        }
      })
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : '简介读取失败');
      });
    return () => {
      active = false;
    };
  }, [chapter.id, source, transport, seen, attempt]);
  return (
    <span ref={ref} className="summary-slot">
      {summary && (
        <span className="chapter-summary" title={summary} data-source={url}>
          {summary}
        </span>
      )}
      {error && (
        <button
          className="summary-error"
          title={error}
          onClick={() => setAttempt((value) => value + 1)}
        >
          简介未加载 · 重试
        </button>
      )}
    </span>
  );
}

export function ChapterList({
  story,
  state,
  open,
  transport,
  preparation,
  retryPreparation,
  clearHistory,
  matchedChapterIds = [],
}: {
  story: Story;
  state: ReadingState;
  open: (id: string, restore: boolean) => void;
  transport: ReaderTransport;
  preparation: StoryPreparation | null;
  retryPreparation: () => void;
  clearHistory: () => Promise<void>;
  matchedChapterIds?: string[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    scroll: number;
  } | null>(null);
  const dragged = useRef(false);
  const [axis, setAxis] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState('');
  const matches = new Set(matchedChapterIds);
  const matchSignature = matchedChapterIds.join('|');
  useLayoutEffect(() => {
    const node = scroller.current?.querySelector<HTMLElement>(
      '[data-search-match="true"]',
    );
    const parent = node?.closest<HTMLElement>('.timeline-node');
    if (parent && scroller.current)
      scroller.current.scrollLeft = Math.max(0, parent.offsetLeft - 22);
  }, [story.id, matchSignature]);
  const pending = pendingReadingChapters(story, state.records);
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
          <Cover story={story} transport={transport} retryable />
        </div>
        <div className="book-heading">
          <span className="eyebrow">STORY / {storyTypeLabel(story)}</span>
          <h1>{story.title}</h1>
          {matches.size > 0 && (
            <p className="search-match-label">
              本次搜索命中 {matches.size} 篇，已定位首个匹配篇目。
            </p>
          )}
          <StoryIntro key={story.id} storyId={story.id} transport={transport} />
          <p className="muted">{story.chapters.length} 篇记录 · 从左到右浏览</p>
          <div className="story-preparation" role="status">
            {preparation?.phase === 'ready'
              ? `正文已加载 ${preparation.total} 篇 · 共 ${story.chapters.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0).toLocaleString()} 字`
              : preparation?.phase === 'failed'
                ? `正文已加载 ${preparation.loaded}/${preparation.total} 篇 · ${preparation.failures.length} 篇失败`
                : preparation?.phase === 'paused'
                  ? '正文加载已暂停'
                  : `正在加载正文 ${preparation?.loaded ?? 0}/${story.chapters.length} 篇`}
            {(preparation?.phase === 'failed' ||
              preparation?.phase === 'paused') && (
              <button
                onClick={retryPreparation}
                title={preparation.failures
                  .map((failure) => failure.message)
                  .join('\n')}
              >
                重试正文加载
              </button>
            )}
          </div>
          {story.chapters.some(
            (chapter) =>
              chapter.contentKind === 'video' ||
              chapter.contentKind === 'mixed',
          ) && (
            <p className="data-help muted">
              含视频来源入口；字数与进度只统计文字，纯视频篇目不显示阅读百分比。
            </p>
          )}
          {preparation?.failures.length ? (
            <details className="preparation-failures">
              <summary>查看失败篇目（{preparation.failures.length}）</summary>
              <p>这些篇目尚未计入总字数，整体进度暂时无法确认。</p>
              <ul>
                {preparation.failures.map((failure) => (
                  <li key={failure.chapterId}>
                    <strong>
                      {story.chapters.find(
                        (chapter) => chapter.id === failure.chapterId,
                      )?.title ?? failure.chapterId}
                    </strong>
                    <p>{failure.message}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {pending.length > 0 && (
            <details className="preparation-failures progress-pending">
              <summary>阅读记录待核实（{pending.length} 篇）</summary>
              <p>
                这些篇目的记录来自旧版正文。为保留原有位置与最远已读进度，请打开对应篇目核实；必要时继续阅读后更新，后台字数统计不会覆盖旧记录。
              </p>
              <ul>
                {pending.map((chapter) => (
                  <li key={chapter.id}>
                    <button onClick={() => open(chapter.id, true)}>
                      核实 {chapter.code} {chapter.title}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="story-actions">
            {recent && (
              <button
                className="primary continue"
                onClick={() => open(recent.chapterId, true)}
                title={`继续阅读 ${recentTitle}`}
              >
                继续阅读 <span>{recentTitle}</span> ↗
              </button>
            )}
            <button
              className="story-clear"
              disabled={!recent || clearing}
              aria-expanded={confirmClear}
              onClick={() => {
                setConfirmClear(true);
                setClearMessage('');
              }}
            >
              清除本剧情阅读记录
            </button>
          </div>
          {confirmClear && (
            <div
              className="clear-confirm"
              role="group"
              aria-label="确认清除本剧情阅读记录"
            >
              <p>
                清除《{story.title}
                》的阅读进度和续读位置？其他剧情、内容缓存和字数统计会保留。此操作无法撤销。
              </p>
              <button
                disabled={clearing}
                onClick={() => {
                  setClearing(true);
                  void clearHistory()
                    .then(() => {
                      setConfirmClear(false);
                      setClearMessage('本剧情阅读记录已清除。');
                    })
                    .catch((error: unknown) => {
                      setClearMessage(
                        error instanceof Error
                          ? error.message
                          : '清除失败，请重试。',
                      );
                    })
                    .finally(() => setClearing(false));
                }}
              >
                确认清除此剧情
              </button>
              <button
                disabled={clearing}
                onClick={() => setConfirmClear(false)}
              >
                取消
              </button>
            </div>
          )}
          {clearMessage && (
            <p className="data-help muted" role="status">
              {clearMessage}
            </p>
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
          if (!event.isPrimary || event.button !== 0) return;
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            scroll: event.currentTarget.scrollLeft,
          };
          dragged.current = false;
        }}
        onPointerMove={(event) => {
          if (
            !drag.current ||
            drag.current.pointerId !== event.pointerId ||
            event.buttons !== 1
          )
            return;
          const delta = drag.current.x - event.clientX;
          if (Math.abs(delta) > 5) {
            dragged.current = true;
            if (event.pointerType === 'mouse')
              event.currentTarget.setPointerCapture(event.pointerId);
          }
          // Touch uses native pan-x scrolling; only mouse dragging scrolls here.
          if (dragged.current && event.pointerType === 'mouse')
            event.currentTarget.scrollLeft = drag.current.scroll + delta;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onClickCapture={(event) => {
          if (dragged.current && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
          }
          dragged.current = false;
        }}
      >
        <div className="timeline">
          {story.chapters.map((chapter, index) => (
            <div className="timeline-node" key={chapter.id}>
              <span className="node-dot" />
              <div
                className="chapter-card"
                data-search-match={matches.has(chapter.id) ? 'true' : undefined}
              >
                <button
                  className="chapter-open"
                  onClick={() => open(chapter.id, false)}
                  aria-label={`阅读 ${chapter.code} ${chapter.title}`}
                >
                  <span className="chapter-code">
                    {chapter.code}
                    <span>{String(index + 1).padStart(2, '0')}</span>
                  </span>
                  <strong>{chapter.title}</strong>
                  {matches.has(chapter.id) && (
                    <span className="search-match-label">搜索命中</span>
                  )}
                </button>
                <Summary
                  chapter={chapter}
                  source={story.source}
                  transport={transport}
                />
                <span className="chapter-percent">
                  {chapter.contentKind === 'video' ? (
                    '视频 · 查看来源'
                  ) : (
                    <>
                      已读{' '}
                      {progressLabel(
                        chapterProgress(story, chapter.id, state.records),
                        state.records[chapter.id]?.progressKnown === false,
                      )}
                    </>
                  )}
                </span>
              </div>
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
