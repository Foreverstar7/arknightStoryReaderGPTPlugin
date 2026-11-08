import type { Block, Chapter } from '../shared/contracts.js';
import {
  normalizePortraitReference,
  portraitResourceGroup,
} from './prts-portrait.js';

export type SpeakerBinding = {
  reference: string;
  default: boolean;
  evidenceBlocks: string[];
  // A reaction can retain another character's image without depicting its speaker.
  absentFromScene?: true;
};

type Evidence = { blockId: string; group: string; owner: string };
type EvidenceSet = { all: Evidence[]; anchored: Evidence[] };
type Speech = Extract<Block, { kind: 'speech' }>;
const validName = (name: string) =>
  /\p{L}/u.test(name) && !/[?？\[\]{}<>|/#:\r\n]/u.test(name);
const sceneReferences = (block: Speech) => [
  ...new Set(
    block.scene?.slots.map((slot) => normalizePortraitReference(slot.resource)),
  ),
];

// Keep body/costume IDs distinct; only expression selectors share a group.
// Unsupported/variable references remain unresolved instead of guessing names.
/** Corroborate a mixed scene with consistent single-resource speech in the
 * same chapter and branch container. Never infer identity from focus, another
 * chapter, a different branch, a translated ID or a character-name exception. */
export function chapterSpeakerBindings(chapter: Chapter) {
  const result = new Map<string, SpeakerBinding>();
  function inspect(blocks: Block[]) {
    const known = new Map<string, EvidenceSet>();
    let signature = '';
    let owner = '';
    for (const block of blocks) {
      if (block.kind === 'choices') {
        signature = '';
        owner = '';
        continue;
      }
      if (block.kind !== 'speech') continue;
      const references = sceneReferences(block);
      // Only changes to the displayed resources begin a new image context.
      // Focus, narration and another speaker's reaction do not change identity.
      const next = JSON.stringify([...references].sort());
      if (next !== signature) {
        signature = next;
        owner = block.name;
      }
      if (references.length !== 1 || !references[0] || !validName(block.name))
        continue;
      const group = portraitResourceGroup(references[0]);
      if (!group) continue;
      const binding: EvidenceSet = known.get(block.name) ?? {
        all: [],
        anchored: [],
      };
      const entry = { blockId: block.id, group, owner };
      binding.all.push(entry);
      if (owner === block.name) binding.anchored.push(entry);
      known.set(block.name, binding);
    }
    const identities = new Map<
      string,
      { group: string; blocks: string[]; independentlyShown: boolean }
    >();
    for (const [name, evidence] of known) {
      const groups = new Set(evidence.all.map((entry) => entry.group));
      const first = evidence.all[0];
      if (groups.size === 1 && first) {
        identities.set(name, {
          group: first.group,
          blocks: evidence.all.map((entry) => entry.blockId),
          independentlyShown: evidence.anchored.some(
            (entry) => entry.group === first.group,
          ),
        });
        continue;
      }
      const anchored = evidence.anchored[0];
      if (
        !anchored ||
        new Set(evidence.anchored.map((entry) => entry.group)).size !== 1
      )
        continue;
      // Relax a conflict only when every alternative comes from an unchanged
      // image context anchored to a different, consistently identified speaker.
      // Two independently shown identities/costumes remain genuinely ambiguous.
      const unexplained = evidence.all.some((entry) => {
        if (entry.group === anchored.group) return false;
        const other = known.get(entry.owner)?.anchored ?? [];
        const otherGroups = new Set(other.map((item) => item.group));
        return (
          entry.owner === name ||
          !validName(entry.owner) ||
          otherGroups.size !== 1 ||
          !otherGroups.has(entry.group)
        );
      });
      if (!unexplained)
        identities.set(name, {
          group: anchored.group,
          blocks: evidence.anchored.map((entry) => entry.blockId),
          independentlyShown: true,
        });
    }
    for (const block of blocks) {
      if (block.kind === 'choices') {
        for (const option of block.options) inspect(option.blocks);
        for (const shared of block.shared ?? []) inspect(shared.blocks);
        continue;
      }
      if (block.kind !== 'speech') continue;
      const binding = identities.get(block.name);
      if (!binding) continue;
      const references = sceneReferences(block);
      const currentGroup = references[0]
        ? portraitResourceGroup(references[0])
        : null;
      if (
        (references.length === 0 && binding.independentlyShown) ||
        (references.length === 1 &&
          currentGroup &&
          currentGroup !== binding.group)
      ) {
        result.set(block.id, {
          reference: binding.group,
          default: false,
          evidenceBlocks: binding.blocks,
          absentFromScene: true,
        });
        continue;
      }
      if (references.length < 2) continue;
      const matches = references.filter((reference) => {
        const group = portraitResourceGroup(reference);
        return group !== null && group === binding.group;
      });
      if (matches.length === 1 && matches[0])
        result.set(block.id, {
          reference: matches[0],
          default: false,
          evidenceBlocks: binding.blocks,
        });
      else if (matches.length > 1) {
        result.set(block.id, {
          reference: binding.group,
          default: true,
          evidenceBlocks: binding.blocks,
        });
      }
    }
  }
  inspect(chapter.blocks);
  return result;
}
