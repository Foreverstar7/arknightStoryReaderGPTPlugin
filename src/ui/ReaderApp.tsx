import {
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import {
  type Chapter,
  type ReadingRecord,
  type RecordInput,
  type Settings,
  type Snapshot,
  type Story,
} from '../shared/contracts.js';
import {
  chapterProgress,
  chapterWords,
  chapterContentKind,
  progressLabel,
  storyProgress,
} from '../domain/reading.js';
import type { ReaderTransport } from './transport.js';
import { ReaderError } from '../shared/errors.js';
import {
  Library,
  captureLibraryPosition,
  type LibraryPosition,
} from './components/Library.js';
import { ChapterList } from './components/ChapterList.js';
import { Reader } from './components/Reader.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { CoverImagesContext } from './cover-images.js';
import { useStoryPreparation } from './useStoryPreparation.js';
import { useCatalogRefresh } from './useCatalogRefresh.js';
import { readerSnapshotReducer } from './snapshot-state.js';

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
  const [snapshot, updateSnapshot] = useReducer(readerSnapshotReducer, null);
  const [route, setRoute] = useState<Route>({ page: 'library' });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const retry = useRef<() => void>(() => setReload((value) => value + 1));
  const flush = useRef<() => Promise<void>>(async () => undefined);
  const clearingHistory = useRef(false);
  const historyGeneration = useRef(0);
  const coverImages = useContext(CoverImagesContext);
  const key = useRef(0);
  const navigation = useRef(0);
  const transition = useRef<ViewTransition | null>(null);
  const fallbackAnimation = useRef<Animation | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const libraryPosition = useRef<LibraryPosition | null>(null);
  // The route retains the outgoing screen during transitions, and stays usable
  // if a refreshed catalog removes its story. Live metadata comes from snapshot.
  const activeStory =
    route.page === 'library'
      ? undefined
      : (snapshot?.stories.find((story) => story.id === route.story.id) ??
        route.story);
  const preparation = useStoryPreparation(activeStory, transport, (count) => {
    updateSnapshot({ type: 'count', count });
  });
  const acceptSnapshot = useCallback(
    (data: Snapshot) => updateSnapshot({ type: 'snapshot', data }),
    [],
  );
  const catalogRefresh = useCatalogRefresh(transport, (data) => {
    const library =
      stage.current?.querySelector<HTMLElement>('.library-scroll');
    if (route.page === 'library' && library)
      libraryPosition.current = captureLibraryPosition(library);
    updateSnapshot({ type: 'catalog', data });
  });
  const refreshCatalog = catalogRefresh.refresh;
  const registerFlush = useCallback((value: () => Promise<void>) => {
    flush.current = value;
  }, []);
  useEffect(() => {
    onFlushReady?.(() => flush.current());
    return () => onFlushReady?.(async () => undefined);
  }, [onFlushReady]);

  useEffect(() => {
    let cancelled = false;
    const initialNavigation = navigation.current;
    async function initialize() {
      setBusy(true);
      setError('');
      // Run together: a warm cache renders immediately; cold loads share the
      // source's pending catalog fetch instead of downloading the directory twice.
      const cached = transport.call('reader_snapshot', {});
      const fresh = refreshCatalog();
      try {
        const data = await cached.catch(async (error: unknown) => {
          const recovered = await fresh;
          if (!recovered) throw error;
          return recovered;
        });
        if (cancelled) return;
        updateSnapshot({ type: 'initialize', data });
        const recent = data.state.recentChapterId
          ? data.state.records[data.state.recentChapterId]
          : undefined;
        const story = data.stories.find(
          (story) => story.id === recent?.storyId,
        );
        if (recent && story && navigation.current === initialNavigation) {
          const chapter = await transport.call('reader_chapter', {
            chapterId: recent.chapterId,
          });
          const refreshed = await transport.call('reader_snapshot', {});
          if (!cancelled && navigation.current === initialNavigation) {
            acceptSnapshot(refreshed);
            setRoute({
              page: 'reader',
              story,
              chapter,
              position: refreshed.state.records[chapter.id]?.last,
              key: ++key.current,
            });
          }
        }
      } catch (error) {
        if (!cancelled && navigation.current === initialNavigation)
          setError(errorText(error));
      } finally {
        if (!cancelled && navigation.current === initialNavigation)
          setBusy(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [transport, reload, acceptSnapshot, refreshCatalog]);

  useEffect(() => {
    document.documentElement.dataset.theme =
      snapshot?.state.settings.theme ?? 'system';
  }, [snapshot?.state.settings.theme]);

  async function save(input: RecordInput) {
    if (clearingHistory.current) return;
    const generation = historyGeneration.current;
    try {
      const state = await transport.call('reader_record', input);
      if (generation === historyGeneration.current)
        updateSnapshot({ type: 'reading', state });
    } catch (error) {
      setError(`阅读位置保存失败：${errorText(error)}`);
      retry.current =
        error instanceof ReaderError && error.code === 'conflict'
          ? () => {
              void open(input.chapterId, true, true).catch(() => undefined);
            }
          : () => {
              void flush.current();
            };
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
      const library =
        stage.current?.querySelector<HTMLElement>('.library-scroll');
      if (route.page === 'library' && next.page !== 'library' && library)
        libraryPosition.current = captureLibraryPosition(library);
      flushSync(() => {
        if (data) acceptSnapshot(data);
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
    retry.current = () => {
      void open(chapterId, restore, refresh, motion).catch(() => undefined);
    };
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
      const chapter = await transport.call('reader_chapter', {
        chapterId,
        refresh,
      });
      if (navigation.current !== navigationId) return;
      // Read current state after flushing, so a just-saved position is authoritative.
      const data = await transport.call('reader_snapshot', {});
      if (navigation.current !== navigationId) return;
      const position = restore
        ? data.state.records[chapterId]?.last
        : undefined;
      setError('');
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
      if (navigation.current === navigationId) {
        setError(errorText(error));
        if (refresh) throw error;
      }
    } finally {
      if (navigation.current === navigationId) setBusy(false);
    }
  }
  async function updateSettings(settings: Settings) {
    await flush.current();
    const state = await transport.call('reader_settings', settings);
    updateSnapshot({ type: 'reading', state });
  }
  async function clearHistory(storyId?: string) {
    ++navigation.current;
    await flush.current();
    clearingHistory.current = true;
    ++historyGeneration.current;
    try {
      const state = await transport.call(
        'reader_clear_history',
        storyId ? { storyId } : {},
      );
      flushSync(() => {
        updateSnapshot({ type: 'reading', state });
        setBusy(false);
        if (!storyId) setRoute({ page: 'library' });
      });
    } finally {
      clearingHistory.current = false;
    }
  }
  const recentId = snapshot?.state.recentChapterId;
  const recentStory = snapshot?.stories.find((story) =>
    story.chapters.some((chapter) => chapter.id === recentId),
  );
  const recentTitle = recentStory?.chapters.find(
    (chapter) => chapter.id === recentId,
  )?.title;
  const chapterNavigationStory =
    route.page === 'library' ? recentStory : activeStory;
  const currentRecord =
    route.page === 'reader'
      ? snapshot?.state.records[route.chapter.id]
      : undefined;
  const migration = currentRecord?.migration;

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
              {chapterContentKind(route.chapter) === 'video' ? (
                '本篇视频'
              ) : (
                <>
                  本篇已读{' '}
                  <b>
                    {progressLabel(
                      chapterProgress(
                        route.story,
                        route.chapter.id,
                        snapshot.state.records,
                        chapterWords(route.chapter),
                      ),
                      snapshot.state.records[route.chapter.id]
                        ?.progressKnown === false,
                    )}
                  </b>
                </>
              )}
              <span> · </span>全剧情已读{' '}
              <b>
                {progressLabel(
                  storyProgress(
                    activeStory ?? route.story,
                    snapshot.state.records,
                  ),
                  route.story.chapters.some(
                    (chapter) =>
                      snapshot.state.records[chapter.id]?.progressKnown ===
                      false,
                  ),
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
        {snapshot?.sourceLabel ?? '正在核对剧情来源…'}
      </div>
      {migration && (
        <div className="revision-notice" role="status">
          正文已更新，
          {migration.position === 'matched'
            ? '已恢复到原段落'
            : migration.position === 'preceding'
              ? '原段落已改动，已恢复到前一个可确认段落'
              : '原位置无法确认，已从篇首打开'}
          。 原定位和进度已保留；无法确认的进度会显示待核实，读到篇末后确认。
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              setError('');
              retry.current();
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
        {snapshot && (
          <Library
            transport={transport}
            stories={snapshot.stories}
            state={snapshot.state}
            active={route.page === 'library'}
            initialPosition={libraryPosition.current}
            refreshStatus={catalogRefresh.status}
            refresh={() => void refreshCatalog()}
            open={(story) => void browse({ page: 'chapters', story })}
          />
        )}
        {snapshot && route.page === 'chapters' && (
          <ChapterList
            key={route.story.id}
            transport={transport}
            story={activeStory ?? route.story}
            state={snapshot.state}
            preparation={preparation.status}
            retryPreparation={preparation.retry}
            clearHistory={() => clearHistory(route.story.id)}
            open={(id, restore) => void open(id, restore)}
          />
        )}
        {snapshot && route.page === 'reader' && (
          <Reader
            transport={transport}
            key={route.key}
            story={activeStory ?? route.story}
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
            if (scope === 'all') {
              preparation.stop();
              catalogRefresh.cancel();
            }
            await transport.call('reader_clear_cache', { scope });
            coverImages?.clear();
          }}
          clearHistory={() => clearHistory()}
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
