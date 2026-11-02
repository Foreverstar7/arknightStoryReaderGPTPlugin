import type { Story } from '../shared/contracts.js';

const categories = [
  '主线',
  '支线',
  '故事集',
  '集成战略',
  '生息演算',
  '四月辑录',
  '其他',
] as const;

function categoryFor(story: Story) {
  if (story.type === '剧情') return '故事集';
  return (
    categories.find((category) => category === story.type) ??
    (story.source === 'fixture'
      ? categories.find((category) => category === story.category)
      : undefined) ??
    '其他'
  );
}

// Group only the presentation: source order, objects and stable IDs stay intact.
export function groupStories(stories: Story[]) {
  return categories
    .map((category) => ({
      category,
      stories: stories.filter((story) => categoryFor(story) === category),
    }))
    .filter((group) => group.stories.length > 0);
}

export function storyTypeLabel(story: Story) {
  if (story.type === '剧情') return '故事集';
  if (story.type === '特殊')
    return story.title === '特殊 · 剧情' ? '特殊剧情' : story.title;
  return story.type;
}
