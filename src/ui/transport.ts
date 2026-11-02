import type { App } from '@modelcontextprotocol/ext-apps';
import type { ToolName } from '../shared/contracts.js';
import { ReaderError, readerFailureSchema } from '../shared/errors.js';

export interface ReaderTransport {
  call(name: ToolName, args: Record<string, unknown>): Promise<unknown>;
}
export const previewTransport: ReaderTransport = {
  async call(name, args) {
    let response: Response;
    try {
      response = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, arguments: args }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ReaderError(
        'network',
        '无法连接本机阅读器服务或请求超时，请重试。',
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ReaderError(
        response.ok ? 'parse' : 'network',
        `本机服务返回了无法读取的结果（HTTP ${response.status}）。`,
      );
    }
    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
          ? body.error
          : `本机服务返回 ${response.status}，请重试。`;
      const failure = readerFailureSchema.safeParse({
        ...(typeof body === 'object' && body !== null ? body : {}),
        message,
      });
      throw new ReaderError(
        failure.success
          ? failure.data.code
          : response.status >= 500
            ? 'network'
            : 'unknown',
        message,
        failure.success ? failure.data.sourceUrl : undefined,
      );
    }
    return body;
  },
};
export function hostTransport(
  app: Pick<App, 'callServerTool'>,
): ReaderTransport {
  return {
    async call(name, args) {
      let result;
      try {
        result = await app.callServerTool({ name, arguments: args });
      } catch {
        throw new ReaderError(
          // A rejected bridge call may be a protocol/host error, not a source outage.
          'unknown',
          '宿主未能完成阅读器调用，请检查本机服务后重试。',
        );
      }
      if (result.isError) {
        const failure = readerFailureSchema.safeParse(
          result._meta?.readerError,
        );
        if (failure.success)
          throw new ReaderError(
            failure.data.code,
            failure.data.message,
            failure.data.sourceUrl,
          );
        const text = result.content?.find((item) => item.type === 'text');
        throw new ReaderError(
          'unknown',
          text?.type === 'text' ? text.text : '宿主调用失败，请重试。',
        );
      }
      return name === 'reader_image'
        ? result._meta?.readerImage
        : result.structuredContent;
    },
  };
}
