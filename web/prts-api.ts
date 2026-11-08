import { z } from 'zod';
import { ReaderError } from '../src/shared/errors.js';
import { PRTS_ORIGIN, prtsPageUrl } from '../src/data/prts-client.js';
import { limitedBytes } from '../src/data/prts-resource-source.js';

// PRTS redirects mobile callers of the canonical API to this advertised origin
// without CORS headers. Direct requests here return the same public API for
// desktop and mobile callers; recheck both if the source changes its routing.
const browserApi = new URL('/api.php', 'https://m.prts.wiki');
const allowedHosts = new Set([
  'prts.wiki',
  browserApi.hostname,
  'media.prts.wiki',
  'torappu.prts.wiki',
]);
/** Requests go directly from the visitor to the known source, never through a proxy. */
export const browserPrtsFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (
    url.protocol !== 'https:' ||
    !allowedHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    return Promise.reject(
      new ReaderError('unsupported', '该资源不属于已支持的 PRTS 来源。'),
    );
  if (
    (url.origin === PRTS_ORIGIN || url.origin === browserApi.origin) &&
    url.pathname === browserApi.pathname
  ) {
    url.host = browserApi.host;
    url.searchParams.set('origin', '*');
  }
  return fetch(url, { ...init, credentials: 'omit', mode: 'cors' });
};
const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), info: z.string().optional() }),
});
const pageSchema = z.object({
  query: z.object({
    pages: z
      .array(
        z.object({
          missing: z.boolean().optional(),
          invalid: z.boolean().optional(),
          revisions: z
            .array(
              z.object({
                slots: z.object({ main: z.object({ content: z.string() }) }),
              }),
            )
            .optional(),
        }),
      )
      .length(1),
  }),
});
/** Read the same Wiki source text as action=raw, via the source's public CORS API. */
export async function readBrowserWiki(title: string): Promise<string> {
  const sourceUrl = prtsPageUrl(title);
  const url = new URL('/api.php', PRTS_ORIGIN);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    titles: title,
    origin: '*',
  }).toString();
  let response: Response;
  try {
    response = await browserPrtsFetch(url, {
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
  } catch (cause) {
    throw new ReaderError(
      'network',
      `无法读取 PRTS「${title}」，请检查网络后重试。`,
      sourceUrl,
      { cause },
    );
  }
  if (!response.ok)
    throw new ReaderError(
      response.status === 404 ? 'not_found' : 'network',
      `PRTS「${title}」返回 HTTP ${response.status}。`,
      sourceUrl,
    );
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ReaderError(
      'parse',
      'PRTS API 未返回 JSON，未把错误页面当作正文。',
      sourceUrl,
    );
  // 4 MB JSON envelope budget; decoded Wiki retains the desktop's 2 MB limit.
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder().decode(await limitedBytes(response, 4000000)),
    );
  } catch (cause) {
    if (cause instanceof ReaderError) throw cause;
    throw new ReaderError('parse', 'PRTS API 数据无法读取。', sourceUrl, {
      cause,
    });
  }
  const error = apiErrorSchema.safeParse(raw);
  if (error.success)
    throw new ReaderError(
      'network',
      `PRTS API 请求失败（${error.data.error.code}），请稍后重试。`,
      sourceUrl,
    );
  const decoded = pageSchema.safeParse(raw);
  if (!decoded.success)
    throw new ReaderError(
      'parse',
      'PRTS API 正文结构不兼容，未覆盖已有阅读记录。',
      sourceUrl,
    );
  const page = decoded.data.query.pages[0];
  if (!page || page.invalid)
    throw new ReaderError('parse', 'PRTS 没有返回有效篇目。', sourceUrl);
  if (page.missing)
    throw new ReaderError('not_found', `PRTS 页面不存在：${title}`, sourceUrl);
  const wiki = page.revisions?.[0]?.slots.main.content;
  if (
    page.revisions?.length !== 1 ||
    wiki === undefined ||
    new TextEncoder().encode(wiki).byteLength > 2000000
  )
    throw new ReaderError(
      'parse',
      'PRTS 未返回唯一且符合大小限制的原始正文。',
      sourceUrl,
    );
  return wiki;
}
