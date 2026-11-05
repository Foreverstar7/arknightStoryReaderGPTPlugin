import { z } from 'zod';
import { ReaderError } from '../shared/errors.js';
import { PRTS_ORIGIN, PRTS_ASSET_ORIGIN, prtsPageUrl } from './prts-client.js';
import { CHARACTER_MAP, STORY_VARIABLES } from './prts-portrait.js';

const imageHosts = new Set([
  'media.prts.wiki',
  new URL(PRTS_ASSET_ORIGIN).hostname,
]);
export const portraitMapSchema = z.record(z.string(), z.unknown());

export function parseImageIndex(wiki: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of wiki.trim().split(/\r?\n/u)) {
    const comma = line.indexOf(',');
    const key = line.slice(0, comma).trim().toLowerCase();
    const url = line.slice(comma + 1).trim();
    if (comma < 1 || !key || result.has(key) || !safeImageUrl(url))
      throw new ReaderError('parse', 'PRTS 图片索引格式改变或存在重复资源。');
    result.set(key, url);
  }
  return result;
}
export function safeImageUrl(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      imageHosts.has(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}

export async function publicResponse(
  url: string,
  request: typeof fetch = fetch,
): Promise<Response> {
  let response;
  try {
    response = await request(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ReaderError('network', `PRTS 资源连接失败或超时：${url}`, url);
  }
  if (response.status === 404)
    throw new ReaderError(
      'resource_missing',
      `PRTS 资源不存在（HTTP 404）：${url}`,
      url,
    );
  if (!response.ok)
    throw new ReaderError(
      'network',
      `PRTS 资源返回 HTTP ${response.status}：${url}`,
      url,
    );
  return response;
}
export async function limitedBytes(
  response: Response,
  limit: number,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (!response.body) throw new Error();
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit)
        throw new ReaderError('parse', 'PRTS 单个资源超过取数上限。');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    throw new ReaderError('network', 'PRTS 资源传输中断，请重试。');
  }
  return Buffer.concat(chunks);
}

/** Both published dictionaries have the same envelope and byte budget.
 * Keep source-specific diagnostics; source and cache decoding remain boundaries. */
export async function readPortraitMap(
  url: typeof CHARACTER_MAP | typeof STORY_VARIABLES,
  request: typeof fetch,
) {
  const bytes = await limitedBytes(
    await publicResponse(url, request),
    4_000_000,
  );
  try {
    return portraitMapSchema.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    if (url === STORY_VARIABLES)
      throw new ReaderError(
        'parse',
        'PRTS 剧情变量表格式不兼容。',
        STORY_VARIABLES,
      );
    throw new ReaderError('parse', 'PRTS 人物映射没有返回兼容 JSON。');
  }
}

export async function readFileImageUrl(
  filename: string,
  request: typeof fetch,
): Promise<string> {
  const api = new URL('/api.php', PRTS_ORIGIN);
  api.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url',
    titles: `File:${filename}`,
  }).toString();
  const bytes = await limitedBytes(
    await publicResponse(api.href, request),
    100_000,
  );
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ReaderError('parse', 'PRTS 文件信息不是 JSON。');
  }
  const data = z
    .object({
      query: z.object({
        pages: z.record(
          z.string(),
          z.object({
            missing: z.union([z.string(), z.boolean()]).optional(),
            imageinfo: z.array(z.object({ url: z.string().url() })).optional(),
          }),
        ),
      }),
    })
    .safeParse(raw);
  if (!data.success) throw new ReaderError('parse', 'PRTS 文件信息格式改变。');
  const pages = Object.values(data.data.query.pages);
  const page = pages[0];
  const sourceUrl = prtsPageUrl(`File:${filename}`);
  if (pages.length !== 1 || !page)
    throw new ReaderError(
      'parse',
      'PRTS 文件信息没有返回唯一文件条目。',
      sourceUrl,
    );
  if (Object.hasOwn(page, 'missing'))
    throw new ReaderError(
      'resource_missing',
      `PRTS 文件信息确认资源缺失：${filename}`,
      sourceUrl,
    );
  const info = page.imageinfo?.[0];
  if (page.imageinfo?.length !== 1 || !info || !safeImageUrl(info.url))
    throw new ReaderError(
      'parse',
      'PRTS 文件信息缺少唯一且受支持的图片地址。',
      sourceUrl,
    );
  return info.url;
}
