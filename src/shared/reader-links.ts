import { z } from 'zod';

// This is the identity explicitly supplied by the installed distribution's MCP
// manifest, not an inferred cache path or a guessed host-context property.
export const readerPluginTargetSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/u);

export type ReaderLinkTarget = {
  storyId: string;
  matchedChapterIds: string[];
};
export type ReaderLinkRequest =
  { target: ReaderLinkTarget | null } | { error: string };
export type ReaderNavigationRequest = ReaderLinkRequest & { sequence: number };

export function readerStoryPath(
  target: ReaderLinkTarget,
  activation?: string,
): string {
  const query = new URLSearchParams();
  for (const id of new Set(target.matchedChapterIds)) query.append('match', id);
  if (activation) query.set('activation', activation);
  const search = query.toString();
  return `/stories/${encodeURIComponent(target.storyId)}${search ? `?${search}` : ''}`;
}

export function readerSidebarUrl(
  pluginTarget: string,
  target: ReaderLinkTarget,
) {
  readerPluginTargetSchema.parse(pluginTarget);
  const [plugin, marketplace] = pluginTarget.split('@');
  // The distribution schema above requires both segments.
  if (!plugin || !marketplace) throw new Error('阅读器安装来源无效。');
  const url = new URL(
    `codex://plugins/${encodeURIComponent(plugin)}@${encodeURIComponent(marketplace)}/app/reader_open`,
  );
  // Hosts can suppress identical context updates. Each click is a navigation
  // even when its story equals the link used before reading a chapter.
  url.searchParams.set('path', readerStoryPath(target, crypto.randomUUID()));
  return url.href;
}

const deepLinkState = z.union([
  z.object({ url: z.string() }),
  // The official Extensions SDK accepts this older desktop payload as well.
  // See openai/mcp-extensions/typescript/src/app/deep-link.ts.
  z
    .object({
      path: z.array(z.string()),
      query: z.array(z.tuple([z.string(), z.string()])),
    })
    .transform(({ path, query }) => {
      const search = new URLSearchParams(query).toString();
      return {
        url: `/${path.map(encodeURIComponent).join('/')}${search ? `?${search}` : ''}`,
      };
    }),
]);

export function readerLinkRequest(
  value: unknown,
): ReaderLinkRequest | undefined {
  if (value == null) return undefined;
  const invalid = { error: '剧情链接无效，请重新从搜索卡片打开。' };
  const parsed = deepLinkState.safeParse(value);
  if (!parsed.success) return invalid;
  const path = parsed.data.url;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('#'))
    return invalid;
  try {
    const url = new URL(path, 'https://reader.invalid');
    const pathname = path.split('?')[0];
    if (pathname === '/' && !url.search) return { target: null };
    const match = /^\/stories\/([^/]+)$/u.exec(pathname ?? '');
    if (!match?.[1]) return invalid;
    const storyId = decodeURIComponent(match[1]);
    const ids = url.searchParams.getAll('match');
    const activation = url.searchParams.get('activation');
    if (
      !storyId.trim() ||
      ids.some((id) => !id.trim()) ||
      (activation !== null && !z.uuid().safeParse(activation).success) ||
      url.searchParams.getAll('activation').length > 1 ||
      [...url.searchParams.keys()].some(
        (key) => key !== 'match' && key !== 'activation',
      )
    )
      return invalid;
    return {
      target: { storyId, matchedChapterIds: [...new Set(ids)] },
    };
  } catch {
    return invalid;
  }
}
