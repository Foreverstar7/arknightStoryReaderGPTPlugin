import type {
  ChapterCount,
  ReadingState,
  Snapshot,
} from '../shared/contracts.js';
import { applyChapterCount, mergeStoryCounts } from './story-counts.js';

type SnapshotUpdate =
  | { type: 'initialize' | 'snapshot' | 'catalog'; data: Snapshot }
  | { type: 'reading'; state: ReadingState }
  | { type: 'count'; count: ChapterCount };

/** Public catalog/counts and private reading state have distinct update owners.
 * Navigation still decides when a snapshot is committed with the new screen.
 */
export function readerSnapshotReducer(
  current: Snapshot | null,
  update: SnapshotUpdate,
): Snapshot | null {
  switch (update.type) {
    case 'initialize':
      return current ?? update.data;
    case 'snapshot':
      // Ordinary snapshots supply current records/counts, not a newer catalog.
      return {
        ...update.data,
        stories: mergeStoryCounts(
          current?.stories ?? update.data.stories,
          update.data.stories,
        ),
      };
    case 'catalog':
      // A late catalog response must not restore old records or settings.
      return {
        ...(current ?? update.data),
        stories: mergeStoryCounts(update.data.stories, current?.stories ?? []),
      };
    case 'reading':
      return current ? { ...current, state: update.state } : current;
    case 'count':
      return current
        ? {
            ...current,
            stories: applyChapterCount(current.stories, update.count),
          }
        : current;
  }
}
