import { z } from 'zod';
import { ReaderError } from '../shared/errors.js';
import type { ReaderImage } from '../shared/contracts.js';
import { prtsPageUrl } from './prts-client.js';

export const CHARACTER_MAP =
  'https://torappu.prts.wiki/assets/avg/character.json';
// Source: current StoryPlayer context loads this explicit variable dictionary.
// Resolve literal entries only; no character-name search or generated aliases.
export const STORY_VARIABLES =
  'https://torappu.prts.wiki/gamedata/latest/story/story_variables.json';
export const LEGACY_LINK = 'Widget:Data_Link';
export const LEGACY_CHAR = 'Widget:Data_Char';
export type ResourceLayer = {
  url: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  centered?: boolean;
  scale?: number;
};
const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const entrySchema = z.object({
  array: z
    .array(
      z.object({
        name: z.string(),
        alias: z.string().optional(),
        group: z.number().int().default(-1),
        image: z.string().optional(),
        face: z.string().optional(),
        body: z.number().int().nonnegative().optional(),
        index: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
  groups: z
    .array(
      z.object({
        mode: z.string(),
        base: z.string().optional(),
        faceRect: point
          .extend({ w: z.number().positive(), h: z.number().positive() })
          .optional(),
      }),
    )
    .default([]),
});
type Entry = z.infer<typeof entrySchema>;
type Item = Entry['array'][number];
const normalizedMaps = new WeakMap<object, Record<string, unknown>>();
export class UnresolvedPortraitReference extends ReaderError {
  constructor(reference: string) {
    super('unsupported', `不支持的 PRTS 立绘引用：${reference}`);
  }
}
export function foldedMap(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') {
    const known = normalizedMaps.get(raw);
    if (known) return known;
  }
  const parsed = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!parsed.success)
    throw new ReaderError('parse', 'PRTS 人物映射格式不兼容。');
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(parsed.data)) {
    const normalized = key.toLowerCase();
    if (Object.hasOwn(result, normalized))
      throw new ReaderError('parse', `PRTS 人物映射有大小写冲突：${key}`);
    result[normalized] = value;
  }
  if (raw && typeof raw === 'object') normalizedMaps.set(raw, result);
  return result;
}
// Whitespace is permitted around the grammar tokens, never inside an ID/alias.
// This recovers audited trailing spaces without turning two different IDs into one.
export function normalizePortraitReference(reference: string): string {
  return reference
    .trim()
    .replace(/\s*([#@$])\s*/gu, '$1')
    .toLowerCase();
}
function referenceParts(raw: unknown, reference: string) {
  const map = foldedMap(raw);
  const normalized = normalizePortraitReference(reference);
  const match =
    /^([a-z0-9_]+(?:-[a-z0-9_.-]+)?)(?:#([1-9]\d*)|@([^$]+))?(?:\$([1-9]\d*))?$/u.exec(
      normalized,
    );
  if (!match?.[1]) throw new UnresolvedPortraitReference(reference);
  let base = match[1];
  let expression: string | undefined;
  if (!Object.hasOwn(map, base)) {
    const keys = Object.keys(map).filter((key) => base.startsWith(`${key}-`));
    if (keys.length > 1)
      throw new ReaderError('parse', 'PRTS 人物引用前缀有歧义。');
    const key = keys[0];
    if (key) {
      expression = base.slice(key.length + 1);
      base = key;
    }
  }
  const body = Number(match[4] ?? '1') - 1;
  const index = Number(match[2] ?? '1') - 1;
  return { map, normalized, base, expression, alias: match[3], body, index };
}
export function characterUrl(key: string): string {
  if (
    !/^[a-zA-Z0-9_/$@#.-]+$/u.test(key) ||
    key.split('/').some((part) => part === '..' || !part)
  )
    throw new ReaderError('parse', 'PRTS 立绘路径不兼容，未猜测文件名。');
  return `https://torappu.prts.wiki/assets/avg/characters/${key.split('/').map(encodeURIComponent).join('/')}.png`;
}
function itemLayers(
  entry: Entry,
  selected: Item,
  reference: string,
): ResourceLayer[] {
  if (selected.group === -1 && selected.image)
    return [{ url: characterUrl(selected.image), x: 0, y: 0 }];
  const group = entry.groups[selected.group];
  if (
    group?.mode !== 'face_overlay' ||
    !group.base ||
    !group.faceRect ||
    !selected.face
  )
    throw new ReaderError(
      'unsupported',
      `PRTS 立绘组合格式尚不兼容：${reference}`,
    );
  return [
    { url: characterUrl(group.base), x: 0, y: 0 },
    {
      url: characterUrl(selected.face),
      x: group.faceRect.x,
      y: group.faceRect.y,
      width: group.faceRect.w,
      height: group.faceRect.h,
    },
  ];
}
function modernSelection(raw: unknown, reference: string, fallback: boolean) {
  const parts = referenceParts(raw, reference);
  if (!Object.hasOwn(parts.map, parts.base)) return null;
  const parsed = entrySchema.safeParse(parts.map[parts.base]);
  if (!parsed.success)
    throw new ReaderError('parse', `PRTS 立绘映射格式不兼容：${reference}`);
  const entry = parsed.data;
  const candidates = entry.array.filter((item, index) =>
    fallback
      ? // body/index are explicit sprite-hub coordinates, not array order. If absent,
        // only the source's named normal alias establishes a reliable default.
        (item.body === parts.body && item.index === 0) ||
        (parts.body === 0 &&
          item.body === undefined &&
          item.alias?.toLowerCase() === 'normal')
      : parts.expression
        ? item.name.toLowerCase() === parts.expression
        : parts.alias
          ? item.alias?.toLowerCase() === parts.alias
          : item.body !== undefined && item.index !== undefined
            ? item.body === parts.body && item.index === parts.index
            : index === parts.index && parts.body === 0,
  );
  if (candidates.length > 1)
    throw new ReaderError('parse', `PRTS 立绘条目有歧义：${reference}`);
  const selected = candidates[0];
  if (!selected) return null;
  return {
    layers: itemLayers(entry, selected, reference),
    selected: `${parts.base}-${selected.name}`,
  };
}
/** Exact-only compatibility export; missing indices never silently select a default. */
export function resolvePortrait(
  raw: unknown,
  reference: string,
): ResourceLayer[] {
  const found = modernSelection(raw, reference, false);
  if (!found)
    throw new ReaderError(
      'resource_missing',
      `PRTS 立绘条目不存在或有歧义：${reference}`,
    );
  return found.layers;
}
export type PortraitPlan = {
  layers: ResourceLayer[];
  portrait: NonNullable<ReaderImage['portrait']>;
};
export function placeholderPortrait(
  reference: string,
  reason: string,
  message: string,
  evidence: string[] = [],
): ReaderImage {
  return {
    width: 240,
    height: 280,
    layers: [],
    resource: reference,
    sourceUrl: evidence[0] ?? CHARACTER_MAP,
    portrait: {
      status: 'placeholder',
      requested: reference,
      reason,
      message,
      evidence,
    },
  };
}
export function resolvePortraitPlan(
  modern: unknown,
  reference: string,
  legacy?: { link: unknown; images: Map<string, string> },
  mode: 'normal' | 'legacy' | 'default' = 'normal',
): PortraitPlan | null {
  const exact =
    mode === 'normal' ? modernSelection(modern, reference, false) : null;
  if (exact)
    return {
      ...exact,
      portrait: {
        status: 'original',
        requested: reference,
        selected: exact.selected,
        reason: 'modern_exact',
        message: '剧情指定立绘',
        evidence: [CHARACTER_MAP],
      },
    };
  if (!legacy) return null;
  const parts = referenceParts(legacy.link, reference);
  const raw = parts.map[parts.base];
  const old = raw === undefined ? null : entrySchema.safeParse(raw);
  if (old && !old.success)
    throw new ReaderError('parse', `PRTS 旧人物映射格式不兼容：${reference}`);
  const entry = old?.success ? old.data : null;
  const selectOld = (fallback: boolean) => {
    const candidates =
      entry?.array.filter((item, index) =>
        fallback
          ? item.name.toLowerCase() === `${parts.base}-1$${parts.body + 1}` ||
            (parts.body === 0 && item.alias?.toLowerCase() === 'normal')
          : parts.expression
            ? item.name.toLowerCase() === `${parts.base}-${parts.expression}`
            : parts.alias
              ? item.alias?.toLowerCase() === parts.alias
              : entry.array.some((item) => /-\d+\$\d+$/u.test(item.name))
                ? item.name.toLowerCase() ===
                  `${parts.base}-${parts.index + 1}$${parts.body + 1}`
                : parts.body === 0 && index === parts.index,
      ) ?? [];
    if (candidates.length > 1)
      throw new ReaderError('parse', 'PRTS 旧立绘条目有歧义。');
    const selected = candidates[0];
    const url = selected
      ? legacy.images.get(selected.name.toLowerCase())
      : undefined;
    return selected && url
      ? { layers: [{ url, x: 0, y: 0 }], selected: selected.name }
      : null;
  };
  const oldExact = mode === 'default' ? null : selectOld(false);
  if (oldExact)
    return {
      ...oldExact,
      portrait: {
        status: 'original',
        requested: reference,
        selected: oldExact.selected,
        reason: 'legacy_exact',
        message: '剧情指定立绘（旧版来源）',
        evidence: [prtsPageUrl(LEGACY_LINK), prtsPageUrl(LEGACY_CHAR)],
      },
    };
  const modernDefault = modernSelection(modern, reference, true);
  const fallback = modernDefault ?? selectOld(true);
  if (!fallback) return null;
  return {
    ...fallback,
    portrait: {
      status: 'default',
      requested: reference,
      selected: fallback.selected,
      reason: 'same_body_default',
      message: '原表情不可用，显示同一角色当前造型的默认立绘。',
      evidence: modernDefault
        ? [CHARACTER_MAP]
        : [prtsPageUrl(LEGACY_LINK), prtsPageUrl(LEGACY_CHAR)],
    },
  };
}
