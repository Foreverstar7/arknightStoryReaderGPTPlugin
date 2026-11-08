import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  useApp,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/react';
import { ReaderApp } from './ReaderApp.js';
import { hostTransport, previewTransport } from './transport.js';
import './styles.css';
import { VERSION } from '../shared/version.js';
import { CoverImagesProvider } from './cover-images.js';
import {
  searchInputSchema,
  searchResultSchema,
  type SearchResult,
  type SearchInput,
} from '../shared/search.js';
import { readerFailureSchema } from '../shared/errors.js';
import { SearchFlow } from './SearchFlow.js';

function applyHostContext(context: McpUiHostContext | undefined) {
  const root = document.documentElement;
  if (context?.theme) {
    root.dataset.hostTheme = context.theme;
    // Search can render before ReaderApp loads the saved preference.
    root.dataset.theme ??= 'system';
  }
  if (context?.displayMode) root.dataset.displayMode = context.displayMode;
}

function HostedReader() {
  const searchEntry = document.documentElement.dataset.entry === 'search';
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchFailure, setSearchFailure] = useState('');
  const [retryInput, setRetryInput] = useState<SearchInput>();
  const readingFlush = useRef<() => Promise<void>>(async () => undefined);
  const onFlushReady = useCallback((flush: () => Promise<void>) => {
    readingFlush.current = flush;
  }, []);
  const { app, error } = useApp({
    appInfo: { name: 'Arknights Story Reader', version: VERSION },
    capabilities: {},
    onAppCreated: (instance) => {
      // Lifecycle handlers must be registered before connect(). No model calls/messages.
      instance.ontoolinput = ({ arguments: args }) => {
        if (!searchEntry) return;
        const input = searchInputSchema.safeParse(args);
        if (input.success) setRetryInput(input.data);
      };
      instance.ontoolresult = (result) => {
        const parsed = searchResultSchema.safeParse(result._meta?.readerSearch);
        if (parsed.success) {
          setSearchResult(parsed.data);
          setSearchFailure('');
        } else if (searchEntry && result.isError) {
          const failure = readerFailureSchema.safeParse(
            result._meta?.readerError,
          );
          setSearchFailure(
            failure.success ? failure.data.message : '搜索未完成，请重试。',
          );
        }
      };
      instance.onhostcontextchanged = applyHostContext;
      instance.onteardown = async () => {
        await readingFlush.current();
        return {};
      };
    },
  });
  const transport = useMemo(() => (app ? hostTransport(app) : null), [app]);
  useEffect(() => {
    applyHostContext(app?.getHostContext());
  }, [app]);
  if (error)
    return (
      <main className="startup" role="alert">
        宿主桥接失败：{error.message}。请重新打开阅读器。
      </main>
    );
  if (!transport)
    return (
      <main className="startup" role="status">
        正在连接阅读器宿主…
      </main>
    );
  if (searchEntry)
    return (
      <SearchFlow
        transport={transport}
        initialResult={searchResult}
        initialError={searchFailure}
        retryInput={retryInput}
        onFlushReady={onFlushReady}
        fullscreen={async () => {
          if (!app) return;
          const { mode } = await app.requestDisplayMode({ mode: 'fullscreen' });
          // A host may return a different actual mode, without another context
          // notification. Layout follows that result rather than the request.
          applyHostContext({ displayMode: mode });
        }}
      />
    );
  return (
    <ReaderApp
      transport={transport}
      environment="MCP Apps 宿主"
      onFlushReady={onFlushReady}
    />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('页面缺少应用根节点。');
const previewQuery = new URLSearchParams(location.search).get('search');
const previewSearch = searchInputSchema.safeParse({
  queries: [previewQuery ?? ''],
  by: new URLSearchParams(location.search).get('by') ?? 'story',
});
createRoot(root).render(
  <CoverImagesProvider>
    {window.parent === window ? (
      previewQuery && previewSearch.success ? (
        <SearchFlow transport={previewTransport} input={previewSearch.data} />
      ) : (
        <ReaderApp transport={previewTransport} environment="浏览器开发预览" />
      )
    ) : (
      <HostedReader />
    )}
  </CoverImagesProvider>,
);
