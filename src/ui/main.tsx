import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { ReaderApp } from './ReaderApp.js';
import { hostTransport, previewTransport } from './transport.js';
import './styles.css';
import { VERSION } from '../shared/version.js';

function HostedReader() {
  const readingFlush = useRef<() => Promise<void>>(async () => undefined);
  const onFlushReady = useCallback((flush: () => Promise<void>) => {
    readingFlush.current = flush;
  }, []);
  const { app, error } = useApp({
    appInfo: { name: 'Arknights Story Reader', version: VERSION },
    capabilities: {},
    onAppCreated: (instance) => {
      // Lifecycle handlers must be registered before connect(). No model calls/messages.
      instance.ontoolinput = () => undefined;
      instance.ontoolresult = () => undefined;
      instance.onhostcontextchanged = (context) => {
        if (context.theme)
          document.documentElement.dataset.hostTheme = context.theme;
      };
      instance.onteardown = async () => {
        await readingFlush.current();
        return {};
      };
    },
  });
  const transport = useMemo(() => (app ? hostTransport(app) : null), [app]);
  useEffect(() => {
    const theme = app?.getHostContext()?.theme;
    if (theme) document.documentElement.dataset.hostTheme = theme;
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
createRoot(root).render(
  window.parent === window ? (
    <ReaderApp transport={previewTransport} environment="浏览器开发预览" />
  ) : (
    <HostedReader />
  ),
);
