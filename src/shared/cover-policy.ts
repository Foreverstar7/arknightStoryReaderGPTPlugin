import type { ReaderImage, Story } from './contracts.js';

// These two source groups have the same display name and no single cover asset.
// User-approved application titles and original art, keyed by unchanged catalog IDs.
// Recheck these IDs/membership if 剧情一览 regrouping changes; never match by title.
// See docs/requirements.md and .ai/DECISIONS.md; this is not PRTS image attribution.
export function supplementCover(story: Pick<Story, 'id' | 'source'>) {
  if (story.source !== 'prts') return undefined;
  switch (story.id) {
    case 'prts:主线剧情/特殊 · 剧情':
      return { title: '主线补充剧情', art: 'main' } as const;
    case 'prts:活动剧情/特殊 · 剧情':
      return { title: '活动补充剧情', art: 'event' } as const;
    default:
      return undefined;
  }
}

// Source-maintenance probes still need the application title without UI assets.
export function textCoverTitle(story: Pick<Story, 'id' | 'source'>) {
  return supplementCover(story)?.title;
}

// Approved originals only, not a blanket allowance for unknown aspect ratios.
// Source methods are assigned by the verified metadata readers. Recheck sizes when
// PRTS replaces these files; preserve the shared 1560:500 frame and whole original.
export function coverPresentation(image: ReaderImage) {
  if (image.width === 1560 && image.height === 500) return 'banner';
  if (
    (image.attribution?.method === 'main-chapter-index' &&
      image.width === 512 &&
      image.height === 512) ||
    (image.attribution?.method === 'contingency-logo' &&
      image.width === 463 &&
      image.height === 121)
  )
    return 'contain';
  return 'deferred';
}
