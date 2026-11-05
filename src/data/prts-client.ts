import { ReaderError } from './source.js';

export const PRTS_ORIGIN = 'https://prts.wiki';
// Public Wiki and StoryPlayer asset origins; not configurable user URLs.
// Recheck the player's explicit mapping links if PRTS moves its asset service.
export const PRTS_ASSET_ORIGIN = 'https://torappu.prts.wiki';
export function prtsPageUrl(title: string): string {
  return `${PRTS_ORIGIN}/w/${encodeURIComponent(title.replaceAll('_', ' ')).replaceAll('%2F', '/')}`;
}
export type WikiReader = (title: string) => Promise<string>;

/** Public GET only: no cookies, credentials, login state or arbitrary remote URLs. */
export async function readPrtsWiki(
  title: string,
  request: typeof fetch = fetch,
): Promise<string> {
  const url = `${prtsPageUrl(title)}?action=raw`;
  let response: Response;
  try {
    response = await request(url, {
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
      headers: { Accept: 'text/x-wiki,text/plain;q=0.9' },
    });
  } catch {
    throw new ReaderError(
      'network',
      `无法连接 PRTS「${title}」（20 秒超时或网络失败），请重试。`,
    );
  }
  if (response.status === 404)
    throw new ReaderError(
      'not_found',
      `PRTS 原始页不存在：${title}（HTTP 404）。`,
    );
  if (!response.ok)
    throw new ReaderError(
      'network',
      `PRTS「${title}」返回 HTTP ${response.status}，请稍后重试。`,
    );
  if (!response.headers.get('content-type')?.includes('text/x-wiki')) {
    throw new ReaderError(
      'parse',
      `PRTS「${title}」没有返回 Wiki 原始文本，未将错误页面当作正文。`,
    );
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ReaderError(
      'network',
      `PRTS「${title}」原始文本传输中断，请重试。`,
    );
  }
  if (Buffer.byteLength(text) > 2_000_000)
    throw new ReaderError(
      'parse',
      `PRTS「${title}」超出单页取数上限，请核对页面结构。`,
    );
  return text;
}
