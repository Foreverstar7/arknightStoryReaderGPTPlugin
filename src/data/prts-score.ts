import { z } from 'zod';
import { JsonCache } from '../storage/json-cache.js';
import {
  scoreCatalogSchema,
  type ScoreCatalog,
  type ScoreMovement,
} from '../shared/score.js';
import type { Story } from '../shared/contracts.js';
import { normalizeSearch } from '../domain/search.js';
import { ReaderError } from './source.js';
import { prtsPageUrl, type WikiReader } from './prts-client.js';

// Public score index linked by 关卡一览, checked 2026-11-08. Its repeated
// /概览, /乐章 and /交点 invocations are ordered records; nested style templates
// are not data fields. Recheck these grammars when the index changes. No game
// title, membership, release date or reading order is hardcoded here.
export const SCORE_PAGE = '关卡一览/曲谱';
type Invocation = { start: number; end: number; fields: string[] };
function invocations(text: string, name: string): Invocation[] {
  const result: Invocation[] = [];
  for (const match of text.matchAll(
    new RegExp('\\{\\{\\s*' + name + '(?=[|\\s}])', 'gu'),
  )) {
    let depth = 1;
    let links = 0;
    let start = match.index + match[0].length;
    const fields: string[] = [];
    let end = -1;
    for (let index = start; index < text.length; index++) {
      const pair = text.slice(index, index + 2);
      if (pair === '{{') {
        depth++;
        index++;
      } else if (pair === '}}') {
        depth--;
        index++;
        if (!depth) {
          fields.push(text.slice(start, index - 1).trim());
          end = index + 1;
          break;
        }
      } else if (pair === '[[') {
        links++;
        index++;
      } else if (pair === ']]') {
        links--;
        index++;
      } else if (text[index] === '|' && depth === 1 && links === 0) {
        fields.push(text.slice(start, index).trim());
        start = index + 1;
      }
    }
    if (end < 0 || links !== 0) incompatible('曲谱模板未完整闭合。');
    result.push({ start: match.index, end, fields: fields.filter(Boolean) });
  }
  return result;
}
function incompatible(message: string): never {
  throw new ReaderError('parse', `PRTS ${message}`, prtsPageUrl(SCORE_PAGE));
}
function field(item: Invocation, key: string) {
  const found = item.fields.filter(
    (value) => value.slice(0, value.indexOf('=')).trim() === key,
  );
  if (found.length > 1) incompatible(`曲谱字段「${key}」重复。`);
  return found[0]?.slice((found[0]?.indexOf('=') ?? -1) + 1).trim();
}
function plain(value: string | undefined): string {
  if (!value || /[{}<>\[\]]/u.test(value))
    incompatible('曲谱名称或章节字段改变。');
  return value;
}
const nameKey = (name: string) =>
  normalizeSearch(name).replace(/[\s·・“”「」『』()（）]/gu, '');

/** Presentation metadata only. The canonical reader stories/chapters and their
 * IDs remain the owners of bodies and history. Unmatched source entries stay
 * explicit; neither a missing entry nor a link becomes a new reader story. */
export function parsePrtsScore(wiki: string, stories: Story[]): ScoreCatalog {
  const text = wiki.replace(/\r\n/gu, '\n').replace(/<!--[\s\S]*?-->/gu, '');
  const headings = [...text.matchAll(/^==([^=\n]+)==[ \t]*$/gmu)];
  const overviews = invocations(text, '/概览');
  if (!overviews.length || !headings.length)
    incompatible('曲谱概览为空或结构改变。');
  const byName = new Map<string, Story[]>();
  for (const story of stories) {
    const key = nameKey(story.title);
    byName.set(key, [...(byName.get(key) ?? []), story]);
  }
  const unmatched = new Set<string>();
  const resolve = (name: string) => {
    const matches = byName.get(nameKey(name)) ?? [];
    if (matches.length > 1)
      incompatible(`曲谱名称「${name}」对应多部剧情，无法确定归属。`);
    if (!matches[0]) unmatched.add(name);
    return matches[0];
  };
  const ownership = new Map<string, string>();
  const movements = overviews.map<ScoreMovement & { body: string }>((item) => {
    const code = plain(item.fields[0]);
    const title = plain(item.fields[1]);
    const sectionName = field(item, 'link') ?? title;
    const headingIndex = headings.findIndex(
      (heading) => heading[1]?.trim() === sectionName,
    );
    const heading = headings[headingIndex];
    if (!heading) incompatible(`曲谱乐章「${title}」缺少收录分区。`);
    const body = text.slice(
      heading.index + heading[0].length,
      headings[headingIndex + 1]?.index ?? text.length,
    );
    return {
      id: `score:${code}`,
      code,
      title,
      collection: /仅作收录而非故事线/u.test(body),
      nodes: [],
      body,
    };
  });
  if (new Set(movements.map((item) => item.id)).size !== movements.length)
    incompatible('曲谱乐章代号重复。');
  const byCode = new Map(movements.map((item) => [item.code, item]));
  const addStory = (
    movement: (typeof movements)[number],
    story: Story | undefined,
  ) => {
    if (!story) return;
    if (ownership.has(story.id))
      incompatible(`曲谱重复收录「${story.title}」。`);
    ownership.set(story.id, movement.id);
    movement.nodes.push({ kind: 'story', storyId: story.id });
  };
  const unresolved: {
    movement: (typeof movements)[number];
    index: number;
    title: string;
    code?: string;
    incoming: boolean;
  }[] = [];
  for (const movement of movements) {
    if (movement.code === 'MS') {
      // MS uses its explicit EP links rather than /乐章 invocations. EP numbers
      // map to chapter codes from the canonical source catalog, not a title list.
      const seen = new Set<string>();
      for (const link of movement.body.matchAll(
        /\[\[(?:关卡一览\/主题曲#EP(\d+)|#([^|\]]+))\|[^\]]*\]\]/gu,
      )) {
        if (link[1]) {
          const episode = Number(link[1]);
          const candidates = stories.filter(
            (story) =>
              story.type === '主线' &&
              story.chapters.some((chapter) => {
                const number = /^(?:[A-Z]+)?(\d+)-/u.exec(chapter.code)?.[1];
                return number !== undefined && Number(number) === episode;
              }),
          );
          if (candidates.length > 1)
            incompatible(`曲谱 EP${link[1]} 对应多部主线。`);
          const story = candidates[0];
          if (!story) {
            unmatched.add(`EP${link[1]}`);
            continue;
          }
          if (seen.has(story.id)) continue;
          seen.add(story.id);
          addStory(movement, story);
        } else if (link[2]) {
          unresolved.push({
            movement,
            index: movement.nodes.length,
            title: link[2],
            incoming: false,
          });
          // Reserve its exact position until all member ownership is known.
          movement.nodes.push({
            kind: 'junction',
            key: '',
            targetStoryId: '',
            targetMovementId: '',
            direction: 'outgoing',
          });
        }
      }
      if (!seen.size) incompatible('曲谱主线没有可对应的 EP 章节。');
      continue;
    }
    const records = [
      ...invocations(movement.body, '/乐章').map((item) => ({
        ...item,
        junction: false,
      })),
      ...invocations(movement.body, '/交点').map((item) => ({
        ...item,
        junction: true,
      })),
    ].sort((left, right) => left.start - right.start);
    if (!records.some((item) => !item.junction))
      incompatible(`曲谱乐章「${movement.title}」没有剧情收录字段。`);
    for (const item of records) {
      const title = plain(field(item, '名称'));
      if (!item.junction) {
        if (field(item, '乐章') !== movement.title)
          incompatible(`曲谱「${title}」的乐章字段与分区矛盾。`);
        addStory(movement, resolve(title));
      } else {
        unresolved.push({
          movement,
          index: movement.nodes.length,
          title,
          code: plain(field(item, '故事线')),
          incoming: field(item, '流入') === '1',
        });
        movement.nodes.push({
          kind: 'junction',
          key: '',
          targetStoryId: '',
          targetMovementId: '',
          direction: 'outgoing',
        });
      }
    }
  }
  for (const item of unresolved) {
    const story = resolve(item.title);
    const targetMovement = story ? ownership.get(story.id) : undefined;
    if (!story || !targetMovement) {
      unmatched.add(item.title);
      continue;
    }
    if (item.code && byCode.get(item.code)?.id !== targetMovement)
      incompatible(`曲谱连接点「${item.title}」的目标乐章与收录矛盾。`);
    item.movement.nodes[item.index] = {
      kind: 'junction',
      key: `${item.movement.id}:${item.index}:${story.id}`,
      targetStoryId: story.id,
      targetMovementId: targetMovement,
      direction: item.incoming ? 'incoming' : 'outgoing',
    };
  }
  return scoreCatalogSchema.parse({
    sourceUrl: prtsPageUrl(SCORE_PAGE),
    movements: movements.map(({ body: _body, ...movement }) => ({
      ...movement,
      nodes: movement.nodes.filter(
        (node) => node.kind === 'story' || node.targetStoryId !== '',
      ),
    })),
    unmatchedNames: [...unmatched],
  });
}

export class PrtsScoreData {
  private readonly cache: JsonCache;
  private readonly pending = new Map<string, Promise<string>>();
  constructor(
    root: string,
    private readonly readWiki: WikiReader,
  ) {
    this.cache = new JsonCache(root, 'metadata');
  }
  async get(
    stories: Story[],
    days: number,
    refresh = false,
  ): Promise<ScoreCatalog> {
    return this.cache.run(async () => {
      const key = 'score-v1';
      const cached = refresh
        ? null
        : await this.cache.get(key, z.string(), days);
      if (cached !== null) return parsePrtsScore(cached, stories);
      const requestKey = `${this.cache.requestKey()}:${refresh}`;
      let task = this.pending.get(requestKey);
      if (!task) {
        task = (async () => {
          const wiki = await this.readWiki(SCORE_PAGE);
          parsePrtsScore(wiki, stories);
          this.cache.assertCurrent();
          await this.cache.put(key, wiki);
          return wiki;
        })();
        this.pending.set(requestKey, task);
      }
      try {
        return parsePrtsScore(await task, stories);
      } finally {
        if (this.pending.get(requestKey) === task)
          this.pending.delete(requestKey);
      }
    });
  }
}
