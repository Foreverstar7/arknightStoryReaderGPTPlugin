import { chapterWords } from '../domain/reading.js';
import type { Block, Chapter, Story } from '../shared/contracts.js';
import { ReaderError, type StorySource } from './source.js';
import type { ScoreCatalog } from '../shared/score.js';

// Original writing for development, deliberately distinct from PRTS/game dialogue.
function blocks(index: number): Block[] {
  const scene: Block[] = [
    {
      id: 'arrival',
      kind: 'narration',
      text: '雨停后，街道尽头的灯依次亮起。履带碾过潮湿的路面，留下两条缓慢延伸的印迹。远处的声音隔着雾传来，听不清说话的人究竟在什么地方。',
    },
    {
      id: 'report',
      kind: 'speech',
      name: '记录员',
      portrait: 'fixture-archivist',
      paragraphs: [
        '先在这里停一下。前面的路口还没有确认安全，我们需要等侦察队的消息。',
        '你可以看一下刚才送来的记录。几份报告使用了同一个地点名称，但标记的方向并不一致。',
      ],
    },
    {
      id: 'reply',
      kind: 'speech',
      name: '旅人',
      paragraphs: ['先把它们按记录时间排好。也许他们看到的是不同的道路。'],
    },
    {
      id: 'map',
      kind: 'narration',
      text: '桌上的纸页被风掀起一角。记录员伸手压住它，沿着地图边缘重新整理折痕。灯光落在她的手边，也照亮了那行被反复修改的注记。',
    },
    {
      id: 'patience',
      kind: 'speech',
      name: '记录员',
      portrait: 'fixture-archivist',
      paragraphs: [
        '先确认每一条消息来自哪里，再把能确定的部分连起来。',
        '这段时间大家都很疲惫，但还没有人放弃。我们也可以再耐心一点。',
      ],
    },
    { id: 'city', kind: 'cg', label: '雾中的城市 · 原创构图示意' },
    {
      id: 'radio',
      kind: 'narration',
      text: '通讯器响了一声。没有人立刻回答，房间里短暂地安静下来，只有细小的电流声在桌面附近起伏。几秒后，一个陌生的声音终于从噪声中浮现。',
    },
    {
      id: 'anonymous',
      kind: 'speech',
      name: '？？？',
      paragraphs: [
        '我们已经走到约定的位置。这里没有路标，但能看见一座很高的钟楼。',
        '雾散之前，请先留在开阔的地方。',
      ],
    },
    {
      id: 'options',
      kind: 'choices',
      options: [
        {
          label: '先询问钟楼的位置。',
          blocks: [
            {
              id: 'tower',
              kind: 'narration',
              text: '记录员将地图转了半圈，在纸上标出钟楼的大致方向。她等待通讯器那端给出第二个可以辨认的地点。',
            },
          ],
        },
        {
          label: '先确认队伍是否安全。',
          blocks: [
            {
              id: 'safety',
              kind: 'narration',
              text: '通讯器里传来短促的回应。所有人都在，物资也没有遗失。记录员放下笔，示意身旁的人把补给重新分好。',
            },
          ],
        },
      ],
    },
    {
      id: 'merge',
      kind: 'narration',
      text: '两份消息终于在地图上指向了同一个路口。那不是他们原本计划经过的地方，却与昨夜留下的记录完全吻合。',
    },
    {
      id: 'departure',
      kind: 'speech',
      name: '记录员',
      portrait: 'fixture-archivist',
      paragraphs: [
        '现在，我们知道该往哪里走了。接下来按原来的分组前进，彼此保持能够看见的距离。',
        '抵达目的地很重要，但我们也要一起到达。',
      ],
    },
    {
      id: 'end',
      kind: 'narration',
      text: `第${index + 1}段记录在这里暂告一段落。纸页被合上时，天边已经露出一线浅色。新的声音从道路另一端传来，等待中的人抬起头，朝那片正在变亮的天空望去。`,
    },
  ];
  return scene;
}

const groups = [
  {
    id: 'fixture-mist',
    title: '雾中来信',
    category: '主线',
    type: '篇章样例',
    coverLabel: 'PROLOGUE',
    titles: [
      '一封未寄出的信',
      '钟楼的方向',
      '路口 · 行动前',
      '路口 · 行动后',
      '微光',
      '走向清晨',
    ],
  },
  {
    id: 'fixture-road',
    title: '长路回声',
    category: '主线',
    type: '篇章样例',
    coverLabel: 'ECHOES',
    titles: ['远行者', '道路尽头'],
  },
  {
    id: 'fixture-lights',
    title: '灯火与归途',
    category: '活动剧情',
    type: '活动样例',
    coverLabel: 'AFTER RAIN',
    titles: ['归途', '最后一盏灯'],
  },
];
const chapters: Chapter[] = groups.flatMap((group) =>
  group.titles.map((title, index) => ({
    id: `${group.id}/${index + 1}`,
    storyId: group.id,
    title,
    revision: 'original-fixture-v1',
    source: 'fixture',
    blocks: blocks(index),
  })),
);
const stories: Story[] = groups.map((group) => ({
  id: group.id,
  title: group.title,
  category: group.category,
  type: group.type,
  coverLabel: group.coverLabel,
  source: 'fixture',
  chapters: chapters
    .filter((chapter) => chapter.storyId === group.id)
    .map((chapter, index) => ({
      id: chapter.id,
      code: `档案 ${String(index + 1).padStart(2, '0')}`,
      title: chapter.title,
      ...(index % 2 === 0
        ? { summary: '循着尚未清晰的线索，重新翻开这段记录。' }
        : {}),
      wordCount: chapterWords(chapter),
    })),
}));

export class FixtureSource implements StorySource {
  async storyInfo() {
    return {
      summary:
        '原创剧情导语示意：旅人翻开沿途记录，循着尚未清晰的线索继续前行。',
    };
  }
  async appearances() {
    return chapters.map((chapter) => ({
      chapterId: chapter.id,
      names: [
        ...new Set(
          chapter.blocks.flatMap((block) =>
            block.kind === 'speech' ? [block.name] : [],
          ),
        ),
      ],
      sourceUrl: 'https://example.invalid/original-fixture',
    }));
  }
  readonly label = '原创 fixture · 非游戏剧情';
  async catalog(): Promise<Story[]> {
    return structuredClone(stories);
  }
  async score(): Promise<ScoreCatalog> {
    return {
      sourceUrl: 'https://example.invalid/original-fixture',
      unmatchedNames: [],
      movements: [
        {
          id: 'fixture-score:fog',
          code: 'FOG',
          title: '雾中档案',
          collection: false,
          nodes: [
            { kind: 'story', storyId: 'fixture-mist' },
            {
              kind: 'junction',
              key: 'fog:road',
              targetStoryId: 'fixture-road',
              targetMovementId: 'fixture-score:road',
              direction: 'outgoing',
            },
            { kind: 'story', storyId: 'fixture-lights' },
          ],
        },
        {
          id: 'fixture-score:road',
          code: 'ROAD',
          title: '远行记录',
          collection: false,
          nodes: [
            { kind: 'story', storyId: 'fixture-road' },
            {
              kind: 'junction',
              key: 'road:lights',
              targetStoryId: 'fixture-lights',
              targetMovementId: 'fixture-score:fog',
              direction: 'incoming',
            },
          ],
        },
      ],
    };
  }
  async chapter(chapterId: string): Promise<Chapter> {
    const chapter = chapters.find((item) => item.id === chapterId);
    if (!chapter)
      throw new ReaderError('not_found', `未找到篇目：${chapterId}`);
    return structuredClone(chapter);
  }
}
