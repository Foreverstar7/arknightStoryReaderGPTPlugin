import { createHash } from 'node:crypto';
import type { Chapter } from '../src/shared/contracts.js';

export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');

/** Object field order is irrelevant; array order, absent fields and all values matter. */
export function fingerprint(value: unknown): string {
  return sha256(
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b, 'en')),
          )
        : item,
    ),
  );
}

export function chapterFingerprint(chapter: Chapter, words: number): string {
  // Raw input is hashed separately. Per-open private tokens are never baseline data.
  const { original, historyToken, ...content } = chapter;
  return fingerprint({ ...content, words });
}

export function compareFingerprints(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key])
    .sort();
}

/** Independent source-line census from the 0.1.21 audit. No production scanner,
 * flow, block grouping or word-count function is used. Unknown tails are reported,
 * so new visible syntax cannot quietly disappear from this check. */
export function sourceWordCensus(wiki: string) {
  const script = /\|文本数据\s*=([\s\S]*?)^\}\}\s*$/mu.exec(wiki)?.[1];
  if (script === undefined)
    throw new Error('Missing source text for word census');
  const count = (text: string) =>
    [
      ...text
        .replace(/<\/?(?:color|size|b|i|u)(?:=[^>]+)?>/giu, '')
        .replace(/<br\s*\/?>/giu, '\n')
        .replace(/\\n/gu, '\n')
        .replace(/\{@nbs\}/giu, ' ')
        .replace(/\{@s\}/giu, '')
        .replace(/\s/gu, ''),
    ].length;
  let words = 0;
  const unclassified: number[] = [];
  for (const [index, raw] of script.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const speech = /^\[name\s*=\s*(?:"[^"]*"|'[^']*')\]\s*(.*)$/iu.exec(line);
    if (speech) {
      words += count(speech[1] ?? '');
      continue;
    }
    const command = /^\[(\w+)(?:\((.*)\))?\s*\]\s*(.*)$/iu.exec(line);
    if (command) {
      const name = command[1]?.toLowerCase();
      const args = command[2] ?? '';
      const tail = command[3] ?? '';
      if (name === 'multiline' || name === 'dialog' || name === 'aside')
        words += count(tail);
      else if (name === 'decision')
        words += count(
          (args.match(/options\s*=\s*"((?:\\.|[^"\\])*)"/iu)?.[1] ?? '')
            .split(';')
            .map((option) => option.replace(/^&/u, ''))
            .join(''),
        );
      else if (
        (name === 'sticker' || name === 'subtitle') &&
        !/hidelog\s*=\s*true/iu.test(args)
      )
        words += count(
          args.match(/text\s*=\s*"((?:\\.|[^"\\])*)"/iu)?.[1] ?? '',
        );
      else if (name === 'animtext' || name === 'spellsticker')
        for (const segment of tail.matchAll(/<p=\d+>(.*?)<\/>/gu))
          words += count(segment[1] ?? '');
      else if (tail && name !== 'header') unclassified.push(index + 1);
      continue;
    }
    if (/^\[\w+(?:\s*=.*?)?\]$/u.test(line)) continue;
    if (line.startsWith('[')) unclassified.push(index + 1);
    words += count(line);
  }
  return { words, unclassified };
}
