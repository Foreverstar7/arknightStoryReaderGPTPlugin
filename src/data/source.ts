import type {
  Chapter,
  Story,
  ImageInput,
  ReaderImage,
  CgComposition,
} from '../shared/contracts.js';
import type { SpeakerBinding } from './prts-speaker.js';
import type { Appearance } from '../shared/search.js';

export type ImageTarget =
  | {
      kind: 'portrait';
      resources: string[];
      speaker?: string;
      speakerBinding?: SpeakerBinding;
    }
  | { kind: 'cg'; resource?: string; composition?: CgComposition };

export interface StorySource {
  readonly label: string;
  catalog(retentionDays?: number, refresh?: boolean): Promise<Story[]>;
  chapter(chapterId: string, retentionDays?: number): Promise<Chapter>;
  isCurrentRevision?(revision: string): boolean;
  reparseCached?(chapter: Chapter): Chapter | null;
  appearances?(retentionDays: number, refresh?: boolean): Promise<Appearance[]>;
  storyInfo?(
    storyId: string,
    retentionDays: number,
    refresh?: boolean,
  ): Promise<{ summary?: string; sourceUrl?: string }>;
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
