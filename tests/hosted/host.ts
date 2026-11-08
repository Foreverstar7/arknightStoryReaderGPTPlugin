import {
  AppBridge,
  PostMessageTransport,
  McpUiToolResultNotificationSchema,
  type McpUiDisplayMode,
} from '@modelcontextprotocol/ext-apps/app-bridge';

function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error(`Missing host control: ${id}`);
  return node;
}
const frame = element('app', HTMLIFrameElement);
const status = element('status', HTMLOutputElement);
const sizes = element('sizes', HTMLOutputElement);
const query = element('query', HTMLInputElement);
const by = element('by', HTMLSelectElement);
const params = new URLSearchParams(location.search);
let mode: McpUiDisplayMode =
  params.get('mode') === 'fullscreen' ? 'fullscreen' : 'inline';
let theme: 'light' | 'dark' = params.get('theme') === 'dark' ? 'dark' : 'light';
let inputSent = false;
const measurements: { width?: number; height?: number }[] = [];
document.body.dataset.mode = mode;
const bridge = new AppBridge(
  null,
  { name: 'original-iframe-check', version: '1.0.0' },
  { serverTools: {} },
  {
    hostContext: {
      displayMode: mode,
      theme,
      availableDisplayModes: ['inline', 'fullscreen'],
    },
  },
);
async function callTool(name: string, args: object) {
  const response = await fetch('/tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
  if (!response.ok)
    throw new Error(`Original fixture failed: ${response.status}`);
  return McpUiToolResultNotificationSchema.shape.params.parse(
    await response.json(),
  );
}
bridge.oncalltool = ({ name, arguments: args }) => callTool(name, args ?? {});
function displayMode(next: McpUiDisplayMode) {
  mode = next;
  document.body.dataset.mode = next;
  if (next === 'fullscreen') frame.style.removeProperty('height');
  bridge.setHostContext({ displayMode: next });
}
bridge.onrequestdisplaymode = async ({ mode: requested }) => {
  if (!element('deny', HTMLInputElement).checked) {
    mode = requested;
    document.body.dataset.mode = mode;
    if (mode === 'fullscreen') frame.style.removeProperty('height');
    // Also test hosts that return the actual mode without a separate notification.
    if (!params.has('responseOnly'))
      bridge.setHostContext({ displayMode: mode });
  }
  return { mode };
};
bridge.onsizechange = (size) => {
  measurements.push(size);
  sizes.value = JSON.stringify(measurements);
  // The only inline height source is the app SDK's size-changed notification.
  // Never measure the child DOM here or impose an accommodating fixed height.
  if (mode === 'inline' && size.height !== undefined)
    frame.style.height = `${Math.min(size.height, Number(params.get('cap') ?? Infinity))}px`;
};
async function deliver(failure = false) {
  const args = {
    queries: [query.value],
    by: by.value,
    limit: Number(params.get('limit') ?? 6),
  };
  if (!inputSent) {
    await bridge.sendToolInput({ arguments: args });
    inputSent = true;
  }
  await bridge.sendToolResult(
    failure
      ? {
          isError: true,
          content: [{ type: 'text', text: '原创搜索模拟网络失败，请重试。' }],
          _meta: {
            readerError: {
              code: 'network',
              message: '原创搜索模拟网络失败，请重试。',
            },
          },
        }
      : await callTool('reader_search', args),
  );
}
bridge.oninitialized = () => {
  status.value = 'MCP iframe 已初始化';
  if (params.has('delay'))
    setTimeout(
      () => {
        void deliver().catch(failed);
      },
      Number(params.get('delay')),
    );
};
function failed(cause: unknown) {
  status.value = `验证宿主错误：${cause instanceof Error ? cause.message : String(cause)}`;
}
element('deliver', HTMLButtonElement).onclick = () => {
  void deliver().catch(failed);
};
element('failure', HTMLButtonElement).onclick = () => {
  void deliver(true).catch(failed);
};
element('inline', HTMLButtonElement).onclick = () => displayMode('inline');
element('fullscreen', HTMLButtonElement).onclick = () =>
  displayMode('fullscreen');
element('theme', HTMLButtonElement).onclick = () => {
  theme = theme === 'light' ? 'dark' : 'light';
  bridge.setHostContext({ theme });
};
const child = frame.contentWindow;
if (!child) throw new Error('Missing iframe window');
await bridge.connect(new PostMessageTransport(child, child));
frame.src = `/resource?entry=${params.get('entry') === 'reader' ? 'reader' : 'search'}`;
