import type { Chapter, Story } from '../shared/contracts.js';

export interface StorySource {
  readonly label: string;
  catalog(): Promise<Story[]>;
  chapter(chapterId: string): Promise<Chapter>;
}

export class ReaderError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'network'
      | 'parse'
      | 'resource_missing'
      | 'storage'
      | 'conflict',
    message: string,
  ) {
    super(message);
  }
}
