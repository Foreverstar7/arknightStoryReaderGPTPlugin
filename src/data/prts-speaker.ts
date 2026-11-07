import type { Block, Chapter } from '../shared/contracts.js';
import {
  normalizePortraitReference,
  portraitResourceGroup,
} from './prts-portrait.js';

export type SpeakerBinding = {
  reference: string;
  default: boolean;
  evidenceBlocks: string[];
};

// Keep body/costume IDs distinct; only expression selectors share a group.
// Unsupported/variable references remain unresolved instead of guessing names.
/** Corroborate a mixed scene with consistent single-resource speech in the
 * same chapter and branch container. Never infer identity from focus, another
 * chapter, a different branch, a translated ID or a character-name exception. */
export function chapterSpeakerBindings(chapter: Chapter) {
  const result = new Map<string, SpeakerBinding>();
  function inspect(blocks: Block[]) {
    const known = new Map<string, { groups: Set<string>; blocks: string[] }>();
    for (const block of blocks) {
      if (
        block.kind !== 'speech' ||
        !/\p{L}/u.test(block.name) ||
        /[?？\[\]{}<>|/#:\r\n]/u.test(block.name)
      )
        continue;
      const references = new Set(
        block.scene?.slots.map((slot) =>
          normalizePortraitReference(slot.resource),
        ),
      );
      if (references.size !== 1) continue;
      const reference = references.values().next().value;
      const group = reference ? portraitResourceGroup(reference) : null;
      if (!group) continue;
      const binding = known.get(block.name) ?? {
        groups: new Set<string>(),
        blocks: [],
      };
      binding.groups.add(group);
      binding.blocks.push(block.id);
      known.set(block.name, binding);
    }
    for (const block of blocks) {
      if (block.kind === 'choices') {
        for (const option of block.options) inspect(option.blocks);
        for (const shared of block.shared ?? []) inspect(shared.blocks);
        continue;
      }
      if (block.kind !== 'speech') continue;
      const binding = known.get(block.name);
      if (!binding || binding.groups.size !== 1) continue;
      const references = [
        ...new Set(
          block.scene?.slots.map((slot) =>
            normalizePortraitReference(slot.resource),
          ),
        ),
      ];
      if (references.length < 2) continue;
      const matches = references.filter((reference) => {
        const group = portraitResourceGroup(reference);
        return group !== null && binding.groups.has(group);
      });
      if (matches.length === 1 && matches[0])
        result.set(block.id, {
          reference: matches[0],
          default: false,
          evidenceBlocks: binding.blocks,
        });
      else if (matches.length > 1) {
        const group = binding.groups.values().next().value;
        if (group)
          result.set(block.id, {
            reference: group,
            default: true,
            evidenceBlocks: binding.blocks,
          });
      }
    }
  }
  inspect(chapter.blocks);
  return result;
}
