import type { App } from '@modelcontextprotocol/ext-apps';
import type { ToolName } from '../shared/contracts.js';

export interface ReaderTransport {
  call(name: ToolName, args: Record<string, unknown>): Promise<unknown>;
}
export const previewTransport: ReaderTransport = {
  async call(name, args) {
    const response = await fetch('/api/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
      signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
          ? body.error
          : `本机服务返回 ${response.status}，请重试。`;
      throw new Error(message);
    }
    return body;
  },
};
export function hostTransport(app: App): ReaderTransport {
  return {
    async call(name, args) {
      const result = await app.callServerTool({ name, arguments: args });
      if (result.isError) {
        const text = result.content?.find((item) => item.type === 'text');
        throw new Error(
          text?.type === 'text' ? text.text : '宿主调用失败，请重试。',
        );
      }
      return name === 'reader_image'
        ? result._meta?.readerImage
        : result.structuredContent;
    },
  };
}
