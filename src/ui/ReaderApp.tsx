import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  chapterSchema,
  readingStateSchema,
  snapshotSchema,
  type Chapter,
  type ReadingRecord,
  type RecordInput,
  type Settings,
  type Snapshot,
  type Story,
} from '../shared/contracts.js';
import {
  chapterProgress,
  progressLabel,
  storyProgress,
} from '../domain/reading.js';
import type { ReaderTransport } from './transport.js';
import { Library } from './components/Library.js';
import { ChapterList } from './components/ChapterList.js';
import { Reader } from './components/Reader.js';
import { SettingsPanel } from './components/SettingsPanel.js';

type Route =
  | { page: 'library' }
  | { page: 'chapters'; story: Story }
  | {
      page: 'reader';
      story: Story;
      chapter: Chapter;
      position?: ReadingRecord['last'];
      key: number;
    };
type Motion = 'home' | 'chapters' | 'read' | 'next' | 'previous';
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}

export function ReaderApp({
  transport,
  environment,
  onFlushReady,
}: {
  transport: ReaderTransport;
  environment: string;
  onFlushReady?: (flush: () => Promise<void>) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [route, setRoute] = useState<Route>({ page: 'library' });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const flush = useRef<() => Promise<void>>(async () => undefined);
  const key = useRef(0);
  const navigation = useRef(0);
  const transition = useRef<ViewTransition | null>(null);
  const fallbackAnimation = useRef<Animation | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const registerFlush = useCallback((value: () => Promise<void>) => {
    flush.current = value;
  }, []);
  useEffect(() => {
    onFlushReady?.(() => flush.current());
    return () => onFlushReady?.(async () => undefined);
  }, [onFlushReady]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setBusy(true);
      setError('');
      try {
        const data = snapshotSchema.parse(
          await transport.call('reader_snapshot', {}),
        );
        if (cancelled) return;
        setSnapshot(data);
        const recent = data.state.recentChapterId
          ? data.state.records[data.state.recentChapterId]
          : undefined;
        const story = data.stories.find(
          (story) => story.id === recent?.storyId,
        );
        if (recent && story) {
          const chapter = chapterSchema.parse(
            await transport.call('reader_chapter', {
              chapterId: recent.chapterId,
            }),
          );
          if (!cancelled)
            setRoute({
              page: 'reader',
              story,
              chapter,
              position: recent.last,
              key: ++key.current,
            });
        }
      } catch (error) {
        if (!cancelled) setError(errorText(error));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [transport, reload]);

  useEffect(() => {
    document.documentElement.dataset.theme =
      snapshot?.state.settings.theme ?? 'system';
  }, [snapshot?.state.settings.theme]);

  async function save(input: RecordInput) {
    try {
      const state = readingStateSchema.parse(
        await transport.call('reader_record', input),
      );
      setSnapshot((current) => (current ? { ...current, state } : current));
    } catch (error) {
      setError(`阅读位置保存失败：${errorText(error)}`);
      throw error;
    }
  }
  async function changeRoute(next: Route, motion?: Motion, data?: Snapshot) {
    const navigationId = navigation.current;
    const previous = transition.current;
    previous?.skipTransition();
    fallbackAnimation.current?.cancel();
    if (previous) await previous.finished.catch(() => undefined);
    if (navigation.current !== navigationId) return;
    // This notice is outside the transition content, so it must not enter an old snapshot.
    flushSync(() => setBusy(false));
    const kind =
      motion ??
      (next.page === 'library'
        ? 'home'
        : next.page === 'chapters'
          ? 'chapters'
          : 'read');
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const commit = () => {
      if (navigation.current !== navigationId) return;
      flushSync(() => {
        if (data) setSnapshot(data);
        setBusy(false);
        setRoute(next);
      });
      updateTransitionBounds();
    };
    if (reduced) {
      commit();
      return;
    }
    document.documentElement.dataset.navigation = kind;
    updateTransitionBounds();
    document.documentElement.dataset.coverTransition = String(
      (route.page === 'library' && next.page === 'chapters') ||
        (route.page === 'chapters' && next.page === 'library'),
    );
    if (!document.startViewTransition) {
      const turning = kind === 'next' || kind === 'previous';
      commit();
      const incoming = turning
        ? stage.current?.querySelector<HTMLElement>('.reader-scroll')
        : stage.current;
      // Without snapshot support use a small flat slide; never rebuild a 3D sheet.
      const x = kind === 'previous' ? -8 : kind === 'next' ? 8 : 0;
      fallbackAnimation.current =
        incoming?.animate(
          [
            {
              transform: `translate(${x}px, ${turning ? 0 : 8}px)`,
            },
            { transform: 'translate(0, 0)' },
          ],
          {
            duration: 220,
            easing: 'cubic-bezier(.2,.7,.25,1)',
          },
        ) ?? null;
      return;
    }
    const active = document.startViewTransition(commit);
    transition.current = active;
    void active.finished
      .catch(() => undefined)
      .finally(() => {
        if (transition.current === active) transition.current = null;
      });
  }
  function updateTransitionBounds() {
    document.documentElement.style.setProperty(
      '--reader-stage-top',
      `${Math.ceil(stage.current?.getBoundingClientRect().top ?? 0)}px`,
    );
  }
  async function browse(next: Route) {
    const id = ++navigation.current;
    await flush.current();
    if (navigation.current !== id) return;
    if (
      route.page === next.page &&
      (next.page === 'library' ||
        (route.page === 'chapters' &&
          next.page === 'chapters' &&
          route.story.id === next.story.id))
    ) {
      setBusy(false);
      return;
    }
    await changeRoute(next);
  }
  async function open(
    chapterId: string,
    restore: boolean,
    refresh = false,
    motion?: Motion,
  ) {
    if (!snapshot) return;
    if (
      !refresh &&
      restore &&
      route.page === 'reader' &&
      route.chapter.id === chapterId
    ) {
      ++navigation.current;
      transition.current?.skipTransition();
      fallbackAnimation.current?.cancel();
      setBusy(false);
      return;
    }
    const story = snapshot.stories.find((story) =>
      story.chapters.some((chapter) => chapter.id === chapterId),
    );
    if (!story) {
      setError('该篇目已不在当前目录中。');
      return;
    }
    const navigationId = ++navigation.current;
    setError('');
    setBusy(true);
    try {
      await flush.current();
      if (navigation.current !== navigationId) return;
      const chapter = chapterSchema.parse(
        await transport.call('reader_chapter', { chapterId, refresh }),
      );
      if (navigation.current !== navigationId) return;
      // Read current state after flushing, so a just-saved position is authoritative.
      const data = snapshotSchema.parse(
        await transport.call('reader_snapshot', {}),
      );
      if (navigation.current !== navigationId) return;
      const position = restore
        ? data.state.records[chapterId]?.last
        : undefined;
      // Commit data, chrome, position and page together inside the new snapshot.
      await changeRoute(
        {
          page: 'reader',
          story,
          chapter,
          position,
          key: ++key.current,
        },
        motion,
        data,
      );
    } catch (error) {
      if (navigation.current === navigationId) setError(errorText(error));
    } finally {
      if (navigation.current === navigationId) setBusy(false);
    }
  }
  async function updateSettings(settings: Settings) {
    await flush.current();
    const state = readingStateSchema.parse(
      await transport.call('reader_settings', settings),
    );
    setSnapshot((current) => (current ? { ...current, state } : current));
  }
  const recentId = snapshot?.state.recentChapterId;
  const recentStory = snapshot?.stories.find((story) =>
    story.chapters.some((chapter) => chapter.id === recentId),
  );
  const recentTitle = recentStory?.chapters.find(
    (chapter) => chapter.id === recentId,
  )?.title;
  const chapterNavigationStory =
    route.page === 'library' ? recentStory : route.story;

  return (
    <div className="app-shell" aria-busy={busy}>
      <header className="topbar">
        <nav aria-label="阅读器导航">
          <button
            aria-current={route.page === 'library' ? 'page' : undefined}
            onClick={() => void browse({ page: 'library' })}
          >
            ⌂ 主页
          </button>
          {chapterNavigationStory && (
            <button
              aria-current={route.page === 'chapters' ? 'page' : undefined}
              onClick={() => {
                void browse({
                  page: 'chapters',
                  story: chapterNavigationStory,
                });
              }}
              title={`篇章目录：${chapterNavigationStory.title}`}
            >
              篇章目录
            </button>
          )}
          {recentId && recentTitle && (
            <button
              className="recent-button"
              title={`最近阅读：${recentTitle}`}
              aria-label={`最近阅读：${recentTitle}`}
              onClick={() => void open(recentId, true)}
            >
              <span>最近阅读</span>
              <strong>{recentTitle}</strong>
              <span>↗</span>
            </button>
          )}
        </nav>
        <div className="top-tools">
          {snapshot && route.page === 'reader' && (
            <span className="progress">
              本篇已读{' '}
              <b>
                {progressLabel(
                  chapterProgress(
                    route.story,
                    route.chapter.id,
                    snapshot.state.records,
                  ),
                )}
              </b>
              <span> · </span>全剧情已读{' '}
              <b>
                {progressLabel(
                  storyProgress(route.story, snapshot.state.records),
                )}
              </b>
            </span>
          )}
          <button
            aria-label="设置"
            disabled={!snapshot}
            onClick={() => setSettingsOpen(true)}
          >
            ⚙ 设置
          </button>
        </div>
      </header>
      <div className="source-note">
        {snapshot?.sourceLabel ?? '原创 fixture · 非游戏剧情'}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              setError('');
              if (!snapshot) setReload((value) => value + 1);
              else if (route.page === 'reader')
                void open(route.chapter.id, true);
            }}
          >
            重试
          </button>
        </div>
      )}
      <div className="stage" ref={stage}>
        {!snapshot && (
          <main className="startup" role="status">
            {busy ? '正在打开剧情档案…' : '阅读器暂时不可用，请重试。'}
          </main>
        )}
        {snapshot && route.page === 'library' && (
          <Library
            stories={snapshot.stories}
            state={snapshot.state}
            open={(story) => void browse({ page: 'chapters', story })}
          />
        )}
        {snapshot && route.page === 'chapters' && (
          <ChapterList
            story={route.story}
            state={snapshot.state}
            open={(id, restore) => void open(id, restore)}
          />
        )}
        {snapshot && route.page === 'reader' && (
          <Reader
            key={route.key}
            story={route.story}
            chapter={route.chapter}
            initialPosition={route.position}
            autoImages={snapshot.state.settings.autoImages}
            open={(id, restore, direction) =>
              void open(id, restore, false, direction)
            }
            save={save}
            registerFlush={registerFlush}
          />
        )}
        {busy && snapshot && (
          <div className="loading-notice" role="status">
            正在读取篇目…
          </div>
        )}
      </div>
      {snapshot && settingsOpen && (
        <SettingsPanel
          state={snapshot.state}
          stories={snapshot.stories}
          environment={environment}
          close={() => setSettingsOpen(false)}
          update={updateSettings}
          clearCache={async (scope) => {
            await flush.current();
            await transport.call('reader_clear_cache', { scope });
          }}
          clearHistory={async () => {
            await flush.current();
            const state = readingStateSchema.parse(
              await transport.call('reader_clear_history', {}),
            );
            setSnapshot({ ...snapshot, state });
            setRoute({ page: 'library' });
          }}
          refresh={
            route.page === 'reader'
              ? () => open(route.chapter.id, true, true)
              : undefined
          }
          resume={(id) => void open(id, true)}
        />
      )}
    </div>
  );
}
