import { PrtsCatalogCache } from '../storage/prts-catalog.js';
import type { Chapter, Story } from '../shared/contracts.js';
import { ReaderError, type StorySource } from './source.js';
import { readPrtsWiki, type WikiReader } from './prts-client.js';
import { parsePrtsCatalog, PRTS_STORY_TITLE } from './prts-catalog.js';
import { parsePrtsChapter } from './prts-script.js';

export class PrtsSource implements StorySource {
  readonly label = 'PRTS 真实剧情 · 骑兵与猎人 · 图片暂不可用';
  private readonly cache: PrtsCatalogCache;
  private catalogPending: Promise<Story[]> | null = null;
  constructor(
    root: string,
    private readonly readWiki: WikiReader = readPrtsWiki,
  ) {
    this.cache = new PrtsCatalogCache(root);
  }
  async catalog(retentionDays = 7): Promise<Story[]> {
    if (this.catalogPending) return this.catalogPending;
    const read = async () => {
      const cached = await this.cache.get(retentionDays);
      if (cached)
        return parsePrtsCatalog(cached.rootWiki, cached.navigationWiki);
      const rootWiki = await this.readWiki('剧情一览');
      if (!/\{\{剧情导航(?:\||\}\})/u.test(rootWiki))
        throw new ReaderError(
          'parse',
          'PRTS 剧情一览的目录转引已改变，请核对来源。',
        );
      const navigationWiki = await this.readWiki('模板:剧情导航');
      const stories = parsePrtsCatalog(rootWiki, navigationWiki);
      await this.cache.put({ rootWiki, navigationWiki });
      return stories;
    };
    this.catalogPending = read();
    try {
      return await this.catalogPending;
    } finally {
      this.catalogPending = null;
    }
  }
  async chapter(id: string, retentionDays = 7): Promise<Chapter> {
    const story = (await this.catalog(retentionDays))[0];
    const meta = story?.chapters.find((chapter) => chapter.id === id);
    if (!story || !meta || !id.startsWith('prts:'))
      throw new ReaderError('not_found', `该篇目不在本次 PRTS 目录范围：${id}`);
    const pageTitle = id.slice('prts:'.length);
    const wiki = await this.readWiki(pageTitle);
    return parsePrtsChapter(wiki, {
      id,
      storyId: story.id,
      title: meta.title,
      pageTitle,
      group: PRTS_STORY_TITLE,
    });
  }
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }
}
