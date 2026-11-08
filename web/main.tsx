import './polyfills.js';
import { createRoot } from 'react-dom/client';
import { ReaderApp } from '../src/ui/ReaderApp.js';
import { CoverImagesProvider } from '../src/ui/cover-images.js';
import { BrowserReaderTransport } from './transport.js';
import '../src/ui/styles.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('网页阅读器缺少根节点。');
const transport = new BrowserReaderTransport();
let flush: () => Promise<void> = async () => undefined;
const initialStoryId =
  new URLSearchParams(location.search).get('story') ?? undefined;
function saveBeforeLeaving() {
  void flush().catch(() => {
    /* Reader save queue retains its failure for the next visible retry. */
  });
}
window.addEventListener('pagehide', saveBeforeLeaving);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveBeforeLeaving();
});
createRoot(container).render(
  <div className="web-layout">
    <div className="web-bar">
      <span>非官方 · 网页阅读</span>
      <a href="../">项目介绍</a>
    </div>
    <div className="web-reader">
      <CoverImagesProvider>
        <ReaderApp
          transport={transport}
          environment={`网页版 · ${__WEB_BUILD__}`}
          initialStoryId={initialStoryId}
          onFlushReady={(value) => {
            flush = value;
          }}
        />
      </CoverImagesProvider>
    </div>
  </div>,
);
