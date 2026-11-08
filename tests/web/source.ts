import type { Page } from '@playwright/test';
import { readingStateSchema } from '../../src/shared/contracts.js';
export const title = '原创网页取样';
export const chapterPages = ['WX-1 双岔/BEG', 'WX-2 回声/NBT'];
export function chapterWiki(index: number, prefix = '') {
  const lines =
    index === 0
      ? [
          '[Character(name="unit#1")]',
          '[name="记录员"]这是原创测试正文，不对应游戏剧情。',
          ...Array.from(
            { length: 22 },
            (_, i) =>
              `[name="${i % 2 ? '记录员' : ''}"]第${i + 1}段：` +
              '雨后的街道恢复安静，远处的灯光照亮纸上的记录。'.repeat(9),
          ),
          '[Decision(options="北边;南边", values="1;2")]',
          '[Predicate(references="1")]',
          '[name="记录员"]北边分支。',
          '[Predicate(references="2")]',
          '[name="旅人"]南边分支。',
          '[Predicate(references="1;2")]',
          '[name="记录员"]共同后续只出现一次。',
          '[Image(image="web_cg")]',
          '[name="？？？"]保留匿名显示，不猜身份。',
          '[Dialog]',
          '取样结束。',
        ]
      : [
          '[name="旅人"]短篇的字数应当与长篇分别加权。',
          '[Dialog]',
          '两章的百分比不能直接平均。',
        ];
  return `{{剧情模拟器|图片数据={{Widget:Data_Image}}|文本路径=original/web-test|剧情类型=支线|剧情分组=${title}|文本数据=\n${prefix}${lines.join('\n')}\n}}\n{{剧情导航}}`;
}
export async function installSource(page: Page) {
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1560;
    c.height = 500;
    const ctx = c.getContext('2d');
    if (!ctx) throw Error('Canvas unavailable');
    ctx.fillStyle = '#1d303c';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#c5a45e';
    ctx.fillRect(80, 80, 500, 8);
    return c.toDataURL('image/png').split(',')[1];
  });
  if (!png) throw new Error('Missing original test image');
  const data = {
    failed: new Set<string>(),
    corrupt: new Set<string>(),
    calls: [] as string[],
    revisionPrefix: '',
    pages: new Map([
      ['剧情一览', '{{剧情导航|nocat=yes}}'],
      [
        '模板:剧情导航',
        `{| class="wikitable"\n! [[剧情一览|活动剧情一览]]\n|-\n! width="120px"|${title}\n! width="40px"|支线\n| [[${chapterPages[0]}|WX-1 双岔]]{{dot}}[[${chapterPages[1]}|WX-2 回声]]\n|}`,
      ],
      [title, '{{活动信息|标题图文件名=web-cover.png}}'],
      ['模板:活动信息/quote', `==${title}==\n<poem>原创导语占位测试。</poem>`],
      [
        'Widget:Data_Image',
        'web_cg,https://media.prts.wiki/original-web-cg.png',
      ],
      ['Widget:Data_Link', '{}'],
      [
        'Widget:Data_Char',
        'unit-1$1,https://media.prts.wiki/original-web-portrait.png',
      ],
    ]),
  };
  await page
    .context()
    .route(
      /https:\/\/(?:(?:m\.)?prts\.wiki|media\.prts\.wiki|torappu\.prts\.wiki)\//u,
      async (route) => {
        const url = new URL(route.request().url());
        data.calls.push(url.href);
        const headers = { 'access-control-allow-origin': '*' };
        if (url.pathname === '/api.php') {
          const name = url.searchParams.get('titles') ?? '';
          if (url.searchParams.get('origin') !== '*')
            throw new Error('Missing public CORS parameter');
          if (data.failed.has(name)) {
            await route.fulfill({
              status: 503,
              headers,
              body: 'Temporary test failure',
            });
            return;
          }
          if (data.corrupt.has(name)) {
            await route.fulfill({
              headers,
              contentType: 'text/html',
              body: '<html>Source incompatible</html>',
            });
            return;
          }
          if (url.searchParams.get('prop') === 'imageinfo') {
            await route.fulfill({
              headers,
              json: {
                query: {
                  pages: {
                    '1': {
                      imageinfo: [
                        {
                          url: 'https://media.prts.wiki/original-web-cover.png',
                        },
                      ],
                    },
                  },
                },
              },
            });
            return;
          }
          const index = chapterPages.indexOf(name);
          const content =
            index < 0
              ? data.pages.get(name)
              : chapterWiki(index, data.revisionPrefix);
          await route.fulfill({
            headers,
            json: {
              query: {
                pages: [
                  content === undefined
                    ? { title: name, missing: true }
                    : {
                        title: name,
                        revisions: [{ slots: { main: { content } } }],
                      },
                ],
              },
            },
          });
          return;
        }
        if (url.pathname.endsWith('character.json')) {
          await route.fulfill({
            headers,
            json: {
              unit: {
                array: [
                  {
                    name: 'calm',
                    body: 0,
                    index: 0,
                    group: -1,
                    image: 'original-web/unit',
                  },
                ],
                groups: [],
              },
            },
          });
          return;
        }
        if (url.pathname.endsWith('story_variables.json')) {
          await route.fulfill({ headers, json: {} });
          return;
        }
        await route.fulfill({
          headers,
          contentType: 'image/png',
          body: Buffer.from(png, 'base64'),
        });
      },
    );
  return data;
}
export async function storedState(page: Page) {
  const raw: unknown = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open('arknights-story-reader.web.v1');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const q = db.transaction('reading').objectStore('reading').get('state');
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
    } finally {
      db.close();
    }
  });
  return readingStateSchema.parse(raw);
}
