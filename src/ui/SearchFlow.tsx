import { useCallback, useEffect, useRef, useState } from 'react';
import { ReaderApp } from './ReaderApp.js';
import { SearchResults } from './components/SearchResults.js';
import type { ReaderTransport } from './transport.js';
import type { SearchInput, SearchResult } from '../shared/search.js';

export function SearchFlow({
  transport,
  initialResult,
  initialError,
  retryInput,
  input,
  fullscreen,
  onFlushReady,
}: {
  transport: ReaderTransport;
  initialResult?: SearchResult | null;
  initialError?: string;
  retryInput?: SearchInput;
  input?: SearchInput;
  fullscreen?: () => Promise<unknown>;
  onFlushReady?: (flush: () => Promise<void>) => void;
}) {
  const [result, setResult] = useState<SearchResult | null>(
    initialResult ?? null,
  );
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
          refreshing={loading}
          refresh={() => {
            if (args) void search(args);
          }}
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
          open={(id) => {
            setSelected(id);
            if (fullscreen) void fullscreen().catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
