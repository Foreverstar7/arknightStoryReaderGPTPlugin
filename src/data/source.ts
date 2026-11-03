import type {
  Chapter,
  Story,
  ImageInput,
  ReaderImage,
} from '../shared/contracts.js';

export type ImageTarget =
  { kind: 'portrait'; resources: string[] } | { kind: 'cg'; resource?: string };

export interface StorySource {
  readonly label: string;
  catalog(retentionDays?: number): Promise<Story[]>;
  chapter(chapterId: string, retentionDays?: number): Promise<Chapter>;
  isCurrentRevision?(revision: string): boolean;
  reparseCached?(chapter: Chapter): Chapter | null;
  chapterInfo?(
    chapterId: string,
    retentionDays: number,
  ): Promise<{ summary?: string; sourceUrl?: string }>;
  image?(
    input: ImageInput,
    target: ImageTarget | undefined,
    retentionDays: number,
  ): Promise<ReaderImage>;
  expire?(retentionDays: number): Promise<void>;
}

export { ReaderError } from '../shared/errors.js';
