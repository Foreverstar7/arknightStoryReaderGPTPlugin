import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  chapterSchema,
  imageResultSchema,
  imageInputSchema,
  snapshotSchema,
  toolRequestSchema,
} from '../../src/shared/contracts.js';
import { placeholderPortrait } from '../../src/data/prts-portrait.js';

test.use({ hasTouch: true });

async function call(request: APIRequestContext, name: string, args: object) {
  const result = await request.post('/api/tools', {
    data: { name, arguments: args },
  });
  expect(result.ok()).toBe(true);
  return result.json();
}
async function open(page: Page, request: APIRequestContext, id: string) {
  const data = snapshotSchema.parse(await call(request, 'reader_snapshot', {}));
  const story = data.stories.find((story) =>
    story.chapters.some((chapter) => chapter.id === id),
  );
  const meta = story?.chapters.find((chapter) => chapter.id === id);
  if (!story || !meta) throw new Error(`Missing sample ${id}`);
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await page
    .locator(`[data-story-id="${story.id}"]`)
    .getByRole('button', { name: `打开剧情：${story.title}`, exact: true })
    .click();
  await page
    .getByRole('button', {
      name: `阅读 ${meta.code} ${meta.title}`,
      exact: true,
    })
    .click();
  // PRTS requests allow 20 s; wait for the chapter instead of failing mid-load.
  await expect(
    page.getByRole('heading', { name: meta.title, exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  return chapterSchema.parse(
    await call(request, 'reader_chapter', { chapterId: id }),
  );
}
test.beforeEach(async ({ request, page }) => {
  await call(request, 'reader_clear_history', {});
  await call(request, 'reader_settings', {
    autoImages: false,
    theme: 'system',
    retentionDays: 7,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
});

test('real repaired legacy, whitespace and variable portraits plus ambiguous scenes use explicit original/placeholder states', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const cases = [
    { id: 'prts:0-10 困境/BEG', match: (ref: string) => /\s/u.test(ref) },
    {
      id: 'prts:BW-ST1 向左向右/NBT',
      match: (ref: string) =>
        ref.startsWith('avg_npc_598_1') || ref.startsWith('avg_npc_604_1'),
    },
    {
      id: 'prts:隐藏剧情/剧情',
      match: (ref: string) => ref.startsWith('$ill_amiya_normal'),
    },
  ];
  for (const sample of cases) {
    const chapter = await open(page, request, sample.id);
    const leaves = chapter.blocks.flatMap((block) =>
      block.kind === 'choices'
        ? [
            ...block.options.flatMap((option) => option.blocks),
            ...(block.shared?.flatMap((group) => group.blocks) ?? []),
          ]
        : [block],
    );
    const speech = leaves.find(
      (block) =>
        block.kind === 'speech' &&
        new Set(block.scene?.slots.map((slot) => slot.resource)).size === 1 &&
        block.scene?.slots.some((slot) => sample.match(slot.resource)),
    );
    if (!speech || speech.kind !== 'speech')
      throw new Error(`No target speech ${sample.id}`);
    const name = page.locator(`[id="name-${speech.id}"]`);
    await name.focus();
    const portraitResponse = page.waitForResponse(
      (response) => {
        if (!response.url().endsWith('/api/tools')) return false;
        const input = toolRequestSchema.parse(
          response.request().postDataJSON(),
        );
        if (input.name !== 'reader_image') return false;
        const target = imageInputSchema.parse(input.arguments);
        return (
          target.kind === 'portrait' &&
          target.chapterId === sample.id &&
          target.blockId === speech.id
        );
      },
      { timeout: 60_000 },
    );
    await page.keyboard.press('Enter');
    expect((await portraitResponse).ok()).toBe(true);
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.locator('[data-portrait-state="original"]'),
    ).toBeVisible();
    await expect(dialog).toHaveAccessibleName(`${speech.name} 立绘`);
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('radio', { name: '场景立绘', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('link', { name: 'PRTS', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(name).toBeFocused();
    await name.tap();
    await expect(dialog).toBeVisible();
    await page.locator('.source-note').tap();
    await expect(dialog).toHaveCount(0);
    const ambiguous = leaves.find(
      (block) =>
        block.kind === 'speech' &&
        /^[?？]+$/u.test(block.name) &&
        new Set(block.scene?.slots.map((slot) => slot.resource)).size > 1,
    );
    if (ambiguous) {
      await page.locator(`[id="name-${ambiguous.id}"]`).click();
      await expect(
        page.getByRole('dialog').getByText('暂无可显示的立绘', { exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    }
  }
});

test('confirmed wife/scene mismatch stays labelled while default and original scene views remain independently selectable', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  const chapter = await open(page, request, 'prts:BW-ST2 隔墙有你/NBT');
  const reaction = chapter.blocks.find(
    (block) =>
      block.kind === 'speech' &&
      block.name === '妻' &&
      block.paragraphs.some((text) => text.includes('刚刚就说了')),
  );
  if (!reaction || reaction.kind !== 'speech')
    throw new Error('Missing live reaction sample');
  await page.locator(`[id="name-${reaction.id}"]`).click();
  const dialog = page.getByRole('dialog', { name: '妻 立绘', exact: true });
  const normal = dialog.getByRole('radio', { name: '默认立绘', exact: true });
  const scene = dialog.getByRole('radio', { name: '场景立绘', exact: true });
  const image = dialog.locator('.source-image');
  await expect(normal).toBeChecked({ timeout: 30_000 });
  await expect(image).toHaveAttribute('data-portrait-view', 'default');
  const defaultBytes = await image
    .locator('image')
    .first()
    .getAttribute('href');
  const warning = dialog.getByText('场景立绘与发言人不一致', { exact: true });
  await expect(warning).toBeInViewport();
  await dialog.screenshot({ path: test.info().outputPath('wife-default.png') });
  await dialog.getByText('场景立绘', { exact: true }).click();
  await expect(scene).toBeChecked();
  await expect(image).toHaveAttribute('data-portrait-view', 'scene');
  await expect(image).toHaveAttribute('data-portrait-relation', 'mismatch');
  expect(await image.locator('image').first().getAttribute('href')).not.toBe(
    defaultBytes,
  );
  await expect(warning).toBeInViewport();
  await dialog.screenshot({ path: test.info().outputPath('wife-scene.png') });
  await scene.press('ArrowLeft');
  await expect(normal).toBeChecked();
  await expect(image).toHaveAttribute('data-portrait-view', 'default');
  expect(await image.locator('image').first().getAttribute('href')).toBe(
    defaultBytes,
  );
});

test('same-chapter evidence resolves NPC portraits throughout the prologue mixed scenes without name exceptions', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const chapter = await open(page, request, 'prts:W2G/BEG');
  for (const name of ['全副武装的男性', '医疗干员']) {
    const blocks = chapter.blocks.filter(
      (block) =>
        block.kind === 'speech' &&
        block.name === name &&
        new Set(block.scene?.slots.map((slot) => slot.resource)).size > 1,
    );
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const input = {
        kind: 'portrait',
        chapterId: chapter.id,
        blockId: block.id,
      };
      const result = imageResultSchema.parse(
        await call(request, 'reader_image', input),
      );
      expect(result.portrait?.status).toBe('original');
      expect(result.portrait?.reason).toBe('chapter_single_scene');
      expect(
        result.portrait?.evidence.some((url) => url.includes('W2G/BEG')),
      ).toBe(true);
    }
    const target = blocks[0];
    if (!target) throw new Error('Missing NPC sample');
    await page.locator(`[id="name-${target.id}"]`).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('dialog').locator('[data-portrait-state="original"]'),
    ).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: `.ai/local/screenshots/prologue-${name}.png`,
    });
    await page.keyboard.press('Escape');
  }
});

test('real omitted CGItem and cggroup render composed SVGs on demand and keep all tiles', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const audit = z
    .object({
      cgOmissions: z.object({
        occurrenceList: z.array(
          z.object({ chapterId: z.string(), command: z.string() }),
        ),
      }),
    })
    .parse(
      JSON.parse(
        await readFile('tests/fixtures/prts-image-baseline.json', 'utf8'),
      ),
    );
  for (const command of ['cgitem', 'largebg', 'verticalbg']) {
    const id = audit.cgOmissions.occurrenceList.find(
      (item) => item.command === command,
    )?.chapterId;
    if (!id) throw Error('No sample');
    const chapter = await open(page, request, id);
    const cg = chapter.blocks.find(
      (block) =>
        block.kind === 'cg' &&
        block.composition &&
        (command === 'cgitem'
          ? block.composition.layers.length >= 2
          : block.composition.description.includes(
              command === 'largebg' ? '横向' : '纵向',
            )),
    );
    if (!cg || cg.kind !== 'cg' || !cg.composition)
      throw Error(`No composite ${command}`);
    const wrap = page.locator(`[data-block="${cg.id}"]`);
    await wrap.scrollIntoViewIfNeeded();
    await expect(wrap.locator('.source-image')).toHaveCount(0);
    await wrap.getByRole('button', { name: '查看 CG' }).click();
    // Several original layers may still be downloading after the default 5 s.
    // Allow the real request to settle; network/parse failures still fail this check.
    await expect(wrap.getByRole('img')).toBeVisible({ timeout: 30_000 });
    await expect(wrap.locator('image')).toHaveCount(
      cg.composition.layers.length,
    );
    if (command !== 'cgitem')
      await expect(wrap.getByRole('img')).toHaveAttribute(
        'viewBox',
        `0 0 ${cg.composition.width} ${cg.composition.height}`,
      );
    for (const image of await wrap.locator('image').all())
      expect(
        await image.evaluate(async (node) => {
          const image = new Image();
          image.src = node.getAttribute('href') ?? '';
          await image.decode();
          return image.naturalWidth > 0;
        }),
      ).toBe(true);
    await mkdir('.ai/local/screenshots', { recursive: true });
    await page.screenshot({
      path: `.ai/local/screenshots/body-images-real-${command}.png`,
    });
  }
});

test('injected default, unavailable and network portraits stay distinct and only network failures can retry', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await open(page, request, 'prts:GT-1 日正当中/BEG');
  const button = page
    .getByRole('button', { name: '查看 格拉尼 的立绘' })
    .first();
  await button.click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  const data = await page
    .getByRole('dialog')
    .locator('image')
    .first()
    .getAttribute('href');
  if (!data) throw Error('No sample');
  await page.keyboard.press('Escape');
  const real = imageResultSchema.parse({
    width: 800,
    height: 1000,
    layers: [
      {
        dataUrl: data,
        sourceUrl: 'https://media.prts.wiki/test.png',
        x: 0,
        y: 0,
        width: 800,
        height: 1000,
      },
    ],
    resource: 'original-test',
    sourceUrl: 'https://prts.wiki/w/Widget:Data_Link',
    portrait: {
      status: 'default',
      requested: 'test#99',
      selected: 'test#1',
      reason: 'injected_ui_default',
      message: '原表情不可用，显示同一角色当前造型的默认立绘。',
      evidence: [],
    },
  });
  let mode: 'default' | 'placeholder' | 'network' = 'placeholder';
  let retried = false;
  await page.route('**/api/tools', async (route) => {
    const body: unknown = route.request().postDataJSON();
    const parsed = z
      .object({
        name: z.string(),
        arguments: z.object({
          kind: z.string().optional(),
          refresh: z.boolean().optional(),
        }),
      })
      .safeParse(body);
    if (
      parsed.success &&
      parsed.data.name === 'reader_image' &&
      parsed.data.arguments.kind === 'portrait'
    ) {
      retried ||= parsed.data.arguments.refresh === true;
      if (mode === 'network')
        await route.fulfill({
          status: 503,
          json: { code: 'network', error: '注入的真实网络错误状态' },
        });
      else
        await route.fulfill({
          json:
            mode === 'default'
              ? real
              : placeholderPortrait(
                  '',
                  'ambiguous_scene',
                  '此处有多种场景立绘，无法确认姓名对应资源。',
                ),
        });
    } else await route.continue();
  });
  for (const theme of ['light', 'dark'] as const)
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.setViewportSize(viewport);
      for (const state of ['placeholder', 'default', 'network'] as const) {
        mode = state;
        retried = false;
        await button.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(
          dialog
            .locator(
              `[data-${state === 'network' ? 'error-code="network"' : `portrait-state="${state}"`}]`,
            )
            .first(),
        ).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        }
        await page.screenshot({
          path: `.ai/local/screenshots/body-${state}-${theme}-${viewport.width}x${viewport.height}.png`,
        });
        if (state === 'network') {
          await expect(dialog.getByRole('img')).toHaveCount(0);
          await dialog
            .getByRole('button', { name: '重试图片', exact: true })
            .focus();
          await page.keyboard.press('Space');
          await expect.poll(() => retried).toBe(true);
        } else {
          await expect(dialog.getByRole('button')).toHaveCount(0);
          await expect(dialog.locator('.image-source')).toBeVisible();
          if (state === 'placeholder') {
            await expect(dialog.getByRole('img')).toHaveCount(0);
            await expect(dialog.locator('.portrait-placeholder p')).toHaveText(
              '暂无可显示的立绘',
            );
          } else {
            await expect(dialog.locator('.portrait-resolution')).toHaveCount(0);
          }
        }
        await page.keyboard.press('Escape');
        await expect(button).toBeFocused();
      }
    }
});

test('4-1 Amiya and Kaltsit use exact sourced identity in a two-character scene without changing dialogue', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const chapter = await open(page, request, 'prts:4-1 免费拥抱/BEG');
  const amiya = chapter.blocks.find(
    (block) =>
      block.kind === 'speech' &&
      block.name === '阿米娅' &&
      block.paragraphs.some((text) => text.trim() === '我，我……'),
  );
  const kaltsit = chapter.blocks.find(
    (block) =>
      block.kind === 'speech' &&
      block.name === '凯尔希' &&
      (block.scene?.slots.length ?? 0) > 1,
  );
  for (const [block, expected] of [
    [amiya, 'char_002_amiya_1'],
    [kaltsit, 'char_003_kalts_1'],
  ] as const) {
    if (!block || block.kind !== 'speech')
      throw Error('Missing real two-character sample');
    const image = imageResultSchema.parse(
      await call(request, 'reader_image', {
        kind: 'portrait',
        chapterId: chapter.id,
        blockId: block.id,
      }),
    );
    expect(image.portrait?.status).toBe('original');
    expect(image.resource).toBe(expected);
    const button = page.locator('[id="name-' + block.id + '"]');
    await button.click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.locator('[data-portrait-state="original"]'),
    ).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'PRTS', exact: true }),
    ).toBeVisible();
    await expect(button).toHaveText(block.name);
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  }
  if (!amiya) throw Error('Missing screenshot sample');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await page.locator('[id="name-' + amiya.id + '"]').tap();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.locator('[data-portrait-state="original"]'),
      ).toBeVisible();
      await mkdir('.ai/local/screenshots', { recursive: true });
      await page.screenshot({
        path:
          '.ai/local/screenshots/portrait-identity-' +
          theme +
          '-' +
          viewport.width +
          'x' +
          viewport.height +
          '.png',
      });
      await page.locator('.source-note').tap();
      await expect(dialog).toHaveCount(0);
    }
  }
});
