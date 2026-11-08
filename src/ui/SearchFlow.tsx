import { useCallback, useEffect, useRef, useState } from 'react';
import { ReaderApp } from './ReaderApp.js';
import { SearchResults } from './components/SearchResults.js';
import type { ReaderTransport } from './transport.js';
import type {
  SearchCard,
  SearchInput,
  SearchResult,
} from '../shared/search.js';

export function SearchFlow({
  transport,
  initialResult,
  initialError,
  retryInput,
  input,
  fullscreen,
  openSidebar,
  onFlushReady,
}: {
  transport: ReaderTransport;
  initialResult?: SearchResult | null;
  initialError?: string;
  retryInput?: SearchInput;
  input?: SearchInput;
  fullscreen?: () => Promise<unknown>;
  openSidebar?: (card: SearchCard) => Promise<boolean>;
  onFlushReady?: (flush: () => Promise<void>) => void;
}) {
  const [result, setResult] = useState<SearchResult | null>(
    initialResult ?? null,
  );
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openFailure, setOpenFailure] = useState<{
    id: string;
    message: string;
  }>();
  const openingRef = useRef(false);
  const openGeneration = useRef(0);
  const flush = useRef<() => Promise<void>>(async () => undefined);
  const generation = useRef(0);
  const registerFlush = useCallback(
    (value: () => Promise<void>) => {
      flush.current = value;
      onFlushReady?.(value);
    },
    [onFlushReady],
  );
  useEffect(() => {
    if (initialResult) {
      setResult(initialResult);
      setSelected(undefined);
      setError('');
      setOpenFailure(undefined);
      ++openGeneration.current;
      openingRef.current = false;
      setOpening(false);
    }
  }, [initialResult]);
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);
  const search = useCallback(
    async (args: SearchInput, append = false) => {
      const run = ++generation.current;
      setLoading(true);
      setError('');
      try {
        const next = await transport.call('reader_search', args);
        if (generation.current === run)
          setResult((old) =>
            append && old
              ? {
                  ...next,
                  offset: 0,
                  results: [...old.results, ...next.results],
                }
              : next,
          );
      } catch (cause) {
        if (generation.current === run)
          setError(
            cause instanceof Error ? cause.message : '搜索失败，请重试。',
          );
      } finally {
        if (generation.current === run) setLoading(false);
      }
    },
    [transport],
  );
  useEffect(() => {
    if (input) void search(input);
    return () => {
      ++generation.current;
      ++openGeneration.current;
    };
  }, [input, search]);
  const args = result
    ? {
        by: result.by,
        queries: result.queries,
        offset: 0,
        limit: 6,
        refresh: true,
      }
    : (retryInput ?? input);
  function openInPlace(id: string) {
    setOpenFailure(undefined);
    setSelected(id);
    if (fullscreen) void fullscreen().catch(() => undefined);
  }
  async function openCard(id: string) {
    const card = result?.results.find((item) => item.id === id);
    if (!card || openingRef.current) return;
    const run = ++openGeneration.current;
    openingRef.current = true;
    setOpening(true);
    setOpenFailure(undefined);
    try {
      const opened = await openSidebar?.(card);
      if (run === openGeneration.current && !opened) openInPlace(id);
    } catch (cause) {
      if (run === openGeneration.current)
        setOpenFailure({
          id,
          message:
            cause instanceof Error
              ? cause.message
              : '侧栏阅读器打开失败，请重试。',
        });
    } finally {
      if (run === openGeneration.current) {
        openingRef.current = false;
        setOpening(false);
      }
    }
  }
  if (selected)
    return (
      <div className="search-reader">
        <div className="search-return">
          <button
            onClick={() => {
              void flush
                .current()
                .then(() => setSelected(undefined))
                .catch((cause: unknown) =>
                  setError(
                    cause instanceof Error ? cause.message : '位置保存失败。',
                  ),
                );
            }}
          >
            ← 返回搜索结果
          </button>
          {error && <span role="alert">{error}</span>}
        </div>
        <ReaderApp
          key={selected}
          transport={transport}
          environment="剧情搜索入口"
          initialStoryId={selected}
          matchedChapterIds={result?.results
            .find((card) => card.id === selected)
            ?.matchedChapters.map((chapter) => chapter.id)}
          onFlushReady={registerFlush}
        />
      </div>
    );
  return (
    <div className="search-flow">
      {openFailure && (
        <div className="search-error" role="alert">
          {openFailure.message}{' '}
          <button
            disabled={opening}
            onClick={() => void openCard(openFailure.id)}
          >
            重试打开
          </button>{' '}
          <button
            disabled={opening}
            onClick={() => openInPlace(openFailure.id)}
          >
            在当前窗口打开
          </button>
        </div>
      )}
      {error && (
        <div className="search-error" role="alert">
          {error}{' '}
          {args && <button onClick={() => void search(args)}>重试搜索</button>}
        </div>
      )}
      {!result && !error && (
        <main className="startup" role="status">
          正在查找剧情…
        </main>
      )}
      {result && (
        <SearchResults
          result={result}
          transport={transport}
          loading={loading}
          opening={opening}
          more={() => {
            if (args)
              void search(
                {
                  ...args,
                  offset: result.offset + result.results.length,
                  refresh: false,
                },
                true,
              );
          }}
          open={(id) => void openCard(id)}
        />
      )}
    </div>
  );
}
