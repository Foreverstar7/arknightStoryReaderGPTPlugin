import { createRoot } from 'react-dom/client';
import { ReaderApp } from '../../src/ui/ReaderApp.js';
import { CoverImagesProvider } from '../../src/ui/cover-images.js';
import { BrowserDemoTransport, DEMO_STORAGE_KEY } from './browser-transport.js';
import '../../src/ui/styles.css';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('原创样例缺少根节点。');
const container = rootElement;
const root = createRoot(container);
let flush: () => Promise<void> = async () => undefined;
let generation = 0;
function failure(error: unknown) {
  root.render(
    <main className="startup">
      <div role="alert">
        {error instanceof Error ? error.message : '原创样例打开失败。'}
      </div>
      <button onClick={() => void start()}>重试</button>
      <button onClick={() => void reset()}>重置样例记录</button>
    </main>,
  );
}
async function start() {
  try {
    const transport = await BrowserDemoTransport.create(sessionStorage);
    root.render(
      <CoverImagesProvider key={++generation}>
        <ReaderApp
          transport={transport}
          environment="网站占位样例 · 独立会话记录 · 不连接插件或 PRTS"
          resumeOnStart={false}
          onFlushReady={(value) => {
            flush = value;
          }}
        />
      </CoverImagesProvider>,
    );
  } catch (error) {
    failure(error);
  }
}
async function reset() {
  try {
    // Reset explicitly discards demo records. A quota/permission error on the
    // last save must not prevent removing the broken sample state.
    await flush().catch(() => undefined);
    root.render(null);
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
    await start();
  } catch (error) {
    failure(error);
  }
}
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent)
    return;
  if (event.data?.type === 'reader-demo:reset') void reset();
  if (event.data?.type === 'reader-demo:flush') void flush();
});
window.addEventListener('pagehide', () => {
  void flush();
});
void start();
