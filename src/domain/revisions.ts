import { createHash } from 'node:crypto';
import type {
  Block,
  Chapter,
  ReadingLayout,
  ReadingRecord,
} from '../shared/contracts.js';
import { blockWords } from './reading.js';

// Hash body/branch structure, not speaker art, scene commands or source line numbers.
// Whole speech paragraphs matter: PRTS block IDs only hash the first utterance.
function body(block: Block): unknown {
  switch (block.kind) {
    case 'speech':
      return [block.kind, block.name, block.paragraphs];
    case 'narration':
      return [block.kind, block.text];
    case 'cg':
      return [block.kind, block.resource ?? block.label];
    case 'video':
      return [block.kind, block.sourceUrl];
    case 'choices':
      return [
        block.kind,
        block.options.map((option) => [option.label, option.blocks.map(body)]),
        (block.shared ?? []).map((group) => [
          group.labels,
          group.blocks.map(body),
        ]),
        ...(block.when ? [block.when] : []),
      ];
  }
}
export function readingLayout(chapter: Chapter): ReadingLayout {
  const blocks = chapter.blocks.map((block) => ({
    id: block.id,
    words: blockWords(block),
    signature: createHash('sha256')
      .update(JSON.stringify(body(block)))
      .digest('hex'),
  }));
  return {
    id: chapter.id,
    storyId: chapter.storyId,
    revision: chapter.revision,
    totalWords: blocks.reduce((sum, block) => sum + block.words, 0),
    blocks,
  };
}
export function wordsAt(
  layout: ReadingLayout,
  anchor: ReadingRecord['last'],
): number {
  const index = layout.blocks.findIndex((block) => block.id === anchor.blockId);
  const block = layout.blocks[index];
  if (!block) return 0;
  return (
    layout.blocks.slice(0, index).reduce((sum, item) => sum + item.words, 0) +
    Math.floor(block.words * anchor.fraction)
  );
}
export function anchorAt(
  layout: ReadingLayout,
  words: number,
): ReadingRecord['last'] {
  let remaining = Math.max(0, words);
  for (const block of layout.blocks) {
    if (block.words > 0 && remaining <= block.words)
      return { blockId: block.id, fraction: remaining / block.words };
    remaining -= block.words;
  }
  return { blockId: layout.blocks.at(-1)?.id ?? '', fraction: 1 };
}
function matches(old: ReadingLayout, next: ReadingLayout): Map<number, number> {
  const result = new Map<number, number>();
  if (
    old.blocks.length === next.blocks.length &&
    old.blocks.every(
      (block, index) => block.signature === next.blocks[index]?.signature,
    )
  ) {
    old.blocks.forEach((_, index) => result.set(index, index));
    return result;
  }
  const before = new Map<string, number[]>();
  const after = new Map<string, number[]>();
  old.blocks.forEach((block, index) =>
    before.set(block.signature, [
      ...(before.get(block.signature) ?? []),
      index,
    ]),
  );
  next.blocks.forEach((block, index) =>
    after.set(block.signature, [...(after.get(block.signature) ?? []), index]),
  );
  // Repeated text can change occurrence IDs after insertions. Without a unique
  // match, conservatively return to earlier confirmed text rather than guess.
  for (const [signature, indexes] of before) {
    const candidates = after.get(signature);
    if (indexes.length === 1 && candidates?.length === 1) {
      const a = indexes[0];
      const b = candidates[0];
      if (a !== undefined && b !== undefined) result.set(a, b);
    }
  }
  return result;
}
function relocate(
  old: ReadingLayout | undefined,
  next: ReadingLayout,
  anchor: ReadingRecord['last'],
  matched: Map<number, number>,
) {
  const index =
    old?.blocks.findIndex((block) => block.id === anchor.blockId) ?? -1;
  for (let previous = index; previous >= 0; previous--) {
    const target = matched.get(previous);
    const block = target === undefined ? undefined : next.blocks[target];
    if (block)
      return {
        anchor: {
          blockId: block.id,
          fraction: previous === index ? anchor.fraction : 1,
        },
        method:
          previous === index ? ('matched' as const) : ('preceding' as const),
      };
  }
  return {
    anchor: { blockId: next.blocks[0]?.id ?? '', fraction: 0 },
    method: 'start' as const,
  };
}
export function migrateRecord(
  record: ReadingRecord,
  next: ReadingLayout,
  cachedOld?: ReadingLayout,
): ReadingRecord {
  if (record.revision === next.revision)
    return {
      ...record,
      layout: next,
      furthest: record.furthest ?? anchorAt(next, record.furthestWords),
    };
  const old =
    record.layout?.revision === record.revision
      ? record.layout
      : cachedOld?.revision === record.revision
        ? cachedOld
        : undefined;
  const matched = old ? matches(old, next) : new Map<number, number>();
  const last = relocate(old, next, record.last, matched);
  const furthest = relocate(
    old,
    next,
    record.furthest ??
      (old ? anchorAt(old, record.furthestWords) : record.last),
    matched,
  );
  const remaining = new Map<string, number>();
  for (const block of old?.blocks ?? [])
    if (block.words > 0)
      remaining.set(block.signature, (remaining.get(block.signature) ?? 0) + 1);
  const complete =
    record.complete &&
    old !== undefined &&
    next.blocks.every((block) => {
      if (block.words === 0) return true;
      const count = remaining.get(block.signature) ?? 0;
      remaining.set(block.signature, count - 1);
      return count > 0;
    });
  return {
    ...record,
    revision: next.revision,
    layout: next,
    totalWords: next.totalWords,
    last: last.anchor,
    furthest: complete ? anchorAt(next, next.totalWords) : furthest.anchor,
    furthestWords: complete ? next.totalWords : wordsAt(next, furthest.anchor),
    complete,
    progressKnown:
      complete ||
      (record.progressKnown !== false &&
        (furthest.method !== 'start' ||
          (old !== undefined && record.furthestWords === 0))),
    migration: {
      position: last.method,
      previous:
        record.progressKnown === false && record.migration
          ? record.migration.previous
          : {
              revision: record.revision,
              last: record.last,
              furthestWords: record.furthestWords,
              complete: record.complete,
              totalWords: record.totalWords,
              updatedAt: record.updatedAt,
            },
    },
  };
}
