import { chapterWords } from '../../src/domain/reading.js';
import type {
  Block,
  Chapter,
  ImageInput,
  Leaf,
  ReaderImage,
  Story,
} from '../../src/shared/contracts.js';
import { ReaderError } from '../../src/shared/errors.js';
import {
  coverAssets,
  loadDemoRaster,
  rabbitAsset,
  type DemoImageLoader,
} from './assets.js';

// Website-only placeholder content. Artwork illustrates UI behavior, never the
// plot or cast of the six cover themes. Installed-plugin fixtures stay separate.
const narration = '旁白占位符。此处为演示文字，不对应任何原作剧情。';
const dialogue = '对白占位符。此处用于展示段落排版与阅读位置。';
function blocks(): Block[] {
  return [
    { id: 'arrival', kind: 'narration', text: narration.repeat(3) },
    {
      id: 'report',
      kind: 'speech',
      name: '角色占位符 A',
      portrait: rabbitAsset.id,
      paragraphs: [dialogue.repeat(2), dialogue],
    },
    {
      id: 'reply',
      kind: 'speech',
      name: '角色占位符 B',
      portrait: rabbitAsset.id,
      paragraphs: [dialogue.repeat(2)],
    },
    { id: 'map', kind: 'narration', text: narration.repeat(3) },
    {
      id: 'patience',
      kind: 'speech',
      name: '角色占位符 A',
      portrait: rabbitAsset.id,
      paragraphs: [dialogue.repeat(2), dialogue],
    },
    {
      id: 'city',
      kind: 'cg',
      label: '场景图片占位符 · 线描意象图',
      resource: 'demo-scene',
    },
    { id: 'radio', kind: 'narration', text: narration.repeat(3) },
    {
      id: 'anonymous',
      kind: 'speech',
      name: '？？？',
      paragraphs: [dialogue.repeat(2)],
    },
    {
      id: 'options',
      kind: 'choices',
      options: [
        {
          label: '选项占位符 A',
          blocks: [
            {
              id: 'tower',
              kind: 'speech',
              name: '角色占位符 A',
              portrait: rabbitAsset.id,
              paragraphs: [dialogue.repeat(2)],
            },
          ],
        },
        {
          label: '选项占位符 B',
          blocks: [
            {
              id: 'safety',
              kind: 'speech',
              name: '角色占位符 B',
              portrait: rabbitAsset.id,
              paragraphs: [dialogue.repeat(2)],
            },
          ],
        },
      ],
    },
    { id: 'merge', kind: 'narration', text: narration.repeat(3) },
    {
      id: 'departure',
      kind: 'speech',
      name: '角色占位符 A',
      portrait: rabbitAsset.id,
      paragraphs: [dialogue.repeat(2), dialogue],
    },
    { id: 'end', kind: 'narration', text: narration.repeat(3) },
  ];
}

const groups = [
  { id: 'fixture-mist', count: 6, category: '主线' },
  { id: 'fixture-road', count: 2, category: '主线' },
  { id: 'fixture-lights', count: 2, category: '支线' },
  { id: 'fixture-voyage', count: 3, category: '支线' },
  { id: 'fixture-rain', count: 3, category: '支线' },
  { id: 'fixture-dream', count: 2, category: '支线' },
];
const chapters: Chapter[] = groups.flatMap((group) =>
  Array.from({ length: group.count }, (_, index) => ({
    id: `${group.id}/${index + 1}`,
    storyId: group.id,
    title: `篇目标题占位符 ${String(index + 1).padStart(2, '0')}`,
    revision: 'website-placeholder-v2',
    source: 'fixture',
    imagesAvailable: true,
    blocks: blocks(),
  })),
);
const stories: Story[] = groups.map((group, index) => ({
  id: group.id,
  title: `剧情标题占位符 ${String(index + 1).padStart(2, '0')}`,
  category: group.category,
  type: group.category,
  coverLabel: '封面占位符',
  source: 'fixture',
  imagesAvailable: true,
  chapters: chapters
    .filter((chapter) => chapter.storyId === group.id)
    .map((chapter, index) => ({
      id: chapter.id,
      code: `篇目 ${String(index + 1).padStart(2, '0')}`,
      title: chapter.title,
      summary: '篇目简介占位符。',
      wordCount: chapterWords(chapter),
    })),
}));

export class WebsiteDemoSource {
  readonly label = '占位演示 · 非原作剧情';
  constructor(private readonly loadImage: DemoImageLoader = loadDemoRaster) {}

  async catalog(): Promise<Story[]> {
    return structuredClone(stories);
  }
  async chapter(chapterId: string): Promise<Chapter> {
    const chapter = chapters.find((item) => item.id === chapterId);
    if (!chapter)
      throw new ReaderError('not_found', `未找到演示篇目：${chapterId}`);
    return structuredClone(chapter);
  }
  async image(input: ImageInput): Promise<ReaderImage> {
    const chapter =
      input.kind === 'cover' ? undefined : await this.chapter(input.chapterId);
    const storyId = input.kind === 'cover' ? input.storyId : chapter?.storyId;
    const asset =
      coverAssets[stories.findIndex((story) => story.id === storyId)];
    if (!asset) throw new ReaderError('not_found', '未找到演示封面。');
    let block: Leaf | undefined;
    if (input.kind !== 'cover' && chapter) {
      block = chapter.blocks
        .flatMap((item) =>
          item.kind === 'choices'
            ? [
                ...item.options.flatMap((option) => option.blocks),
                ...(item.shared?.flatMap((shared) => shared.blocks) ?? []),
              ]
            : [item],
        )
        .find((item) => item.id === input.blockId);
      if (
        !block ||
        (input.kind === 'cg' ? block.kind !== 'cg' : block.kind !== 'speech')
      )
        throw new ReaderError('resource_missing', '此演示段落没有对应图片。');
    }
    if (
      input.kind === 'portrait' &&
      block?.kind === 'speech' &&
      !block.portrait
    )
      return {
        width: 160,
        height: 180,
        layers: [],
        resource: 'website-demo:anonymous',
        sourceUrl: rabbitAsset.url,
        sourceLabel: '演示素材',
        portrait: {
          status: 'placeholder',
          requested: block.name,
          reason: 'anonymous-demo',
          message: '匿名角色保留中性占位，不推定身份。',
          evidence: [],
          views: {
            selected: null,
            defaultAvailable: false,
            sceneAvailable: false,
            sceneRelation: 'unconfirmed',
          },
        },
      };
    const selected = input.kind === 'portrait' ? rabbitAsset : asset;
    const raster = await this.loadImage(selected);
    // Preserve the entire 16:9 artwork inside the reader's shared 1560:500
    // banner. This is a website composition, not a claim about PRTS dimensions.
    const scale =
      input.kind === 'cover'
        ? Math.min(1560 / raster.width, 500 / raster.height)
        : 1;
    const width = input.kind === 'cover' ? 1560 : raster.width;
    const height = input.kind === 'cover' ? 500 : raster.height;
    return {
      width,
      height,
      resource: `website-demo:${selected.id}`,
      sourceUrl: selected.url,
      sourceLabel: '演示素材原图',
      ...(input.kind === 'portrait'
        ? ({
            portrait: {
              status: input.portraitView === 'default' ? 'default' : 'original',
              requested: rabbitAsset.id,
              reason: 'website-demo',
              message:
                input.portraitView === 'default'
                  ? '演示角色的默认立绘，两种模式均使用同一张原创示意图。'
                  : '演示场景立绘。',
              evidence: [],
              views: {
                selected: input.portraitView ?? 'scene',
                defaultAvailable: true,
                sceneAvailable: true,
                sceneRelation: 'matched',
              },
            },
          } as const)
        : {}),
      layers: [
        {
          dataUrl: raster.dataUrl,
          sourceUrl: selected.url,
          x: (width - raster.width * scale) / 2,
          y: (height - raster.height * scale) / 2,
          width: raster.width * scale,
          height: raster.height * scale,
        },
      ],
    };
  }
}
