import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { FixtureSource } from '../../src/data/fixture.js';
import { ReaderService } from '../../src/server/service.js';
import { CacheCoordinator } from '../../src/storage/cache-coordinator.js';
import { toolRequestSchema } from '../../src/shared/contracts.js';
import { ReaderError } from '../../src/data/source.js';
import { storyProgress } from '../../src/domain/reading.js';

test('white progress rings and text-only story loading preserve unread state, provide weighted progress and fit themes/viewports', async ({
  page,
}) => {
  const base = path.resolve('.ai/local/story-preparation-browser');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'ring-'));
  const fixture = new FixtureSource();
  const fetched: string[] = [];
  let inflight = 0;
  let maximum = 0;
  let images = 0;
  let fail = true;
  const service = new ReaderService(
    {
      label: fixture.label,
      catalog: async () =>
        (await fixture.catalog()).map((story) => ({
          ...story,
          chapters: story.chapters.map((chapter) => ({
            ...chapter,
            wordCount: null,
          })),
        })),
      chapter: async (id) => {
        fetched.push(id);
        maximum = Math.max(maximum, ++inflight);
        try {
          await new Promise((resolve) => setTimeout(resolve, 35));
          if (fail && id === 'fixture-mist/2')
            throw new ReaderError('network', '隔离断网样例');
          return await fixture.chapter(id);
        } finally {
          inflight--;
        }
      },
      image: async () => {
        images++;
        throw new Error('must not fetch images while preparing text');
      },
    },
    root,
  );
  await page.route('**/api/tools', async (route) => {
    const input = toolRequestSchema.parse(route.request().postDataJSON());
    try {
      await route.fulfill({
        json: await service.call(input.name, input.arguments),
      });
    } catch (error) {
      await route.fulfill({
        status: 400,
        json: {
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof ReaderError ? error.code : 'invalid_input',
        },
      });
    }
  });
  try {
    await page.goto('/');
    const ring = page.getByRole('progressbar', { name: '雾中来信阅读进度' });
    await expect(ring).toHaveAttribute('aria-valuenow', '0');
    await expect(ring).toHaveText('0%');
    expect(fetched).toHaveLength(0);
    await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
    await expect(page.locator('.story-preparation')).toContainText(
      '5/6 篇 · 1 篇失败',
    );
    expect(maximum).toBe(2);
    expect(fetched).toHaveLength(6);
    expect(fetched.every((id) => id.startsWith('fixture-mist/'))).toBe(true);
    expect(images).toBe(0);
    expect((await service.records.read()).records).toEqual({});
    expect((await service.records.read()).recentChapterId).toBeNull();
    fail = false;
    await page.getByRole('button', { name: '重试正文加载' }).click();
    await expect(page.locator('.story-preparation')).toContainText(
      '正文已加载 6 篇',
    );
    expect(fetched.slice(6)).toEqual(['fixture-mist/2']);
    expect(images).toBe(0);
    await page
      .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
      .click();
    const reader = page.getByRole('main', { name: '剧情正文' });
    await reader.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(
        async () =>
          (await service.records.read()).records['fixture-mist/1']?.complete,
      )
      .toBe(true);
    await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
    const data = await service.snapshot();
    const story = data.stories.find((story) => story.id === 'fixture-mist');
    expect(story).toBeDefined();
    if (!story) throw new Error('Fixture story missing');
    const expected = storyProgress(story, data.state.records);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(100);
    await expect(ring).toHaveAttribute('aria-valuenow', String(expected));
    await expect(ring.locator('.progress-ring-arc')).toHaveAttribute(
      'stroke-dasharray',
      `${expected} 100`,
    );
    await mkdir('.ai/local/screenshots', { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('combobox', { name: /^主题/ }).selectOption(theme);
      await page.keyboard.press('Escape');
      for (const viewport of [
        { width: 320, height: 760 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
        { width: 1024, height: 400 },
      ]) {
        await page.setViewportSize(viewport);
        await ring.scrollIntoViewIfNeeded();
        await expect(ring).toBeVisible();
        expect(
          await ring
            .locator('.progress-ring-base')
            .evaluate((element) => getComputedStyle(element).fill),
        ).toBe('rgb(255, 255, 255)');
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `.ai/local/screenshots/story-ring-${theme}-${viewport.width}x${viewport.height}.png`,
        });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '打开剧情：雾中来信' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.story-preparation')).toContainText(
      '正文已加载 6 篇',
    );
    expect(images).toBe(0);
  } finally {
    await page.close();
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});

test('clearing content cancels the queued story load and fences in-flight bodies until explicit retry', async ({
  page,
}) => {
  const base = path.resolve('.ai/local/story-preparation-browser');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'cancel-'));
  const fixture = new FixtureSource();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetched: string[] = [];
  let finished = 0;
  const service = new ReaderService(
    {
      label: fixture.label,
      catalog: () => fixture.catalog(),
      chapter: async (id) => {
        fetched.push(id);
        await gate;
        return fixture.chapter(id);
      },
    },
    root,
  );
  await page.route('**/api/tools', async (route) => {
    const input = toolRequestSchema.parse(route.request().postDataJSON());
    try {
      await route.fulfill({
        json: await service.call(input.name, input.arguments),
      });
    } catch (error) {
      await route.fulfill({
        status: 400,
        json: {
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof ReaderError ? error.code : 'invalid_input',
        },
      });
    } finally {
      if (input.name === 'reader_prepare_chapter') finished++;
    }
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
    await expect.poll(() => fetched.length).toBe(2);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page
      .getByRole('button', { name: '清理全部内容缓存', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: '阅读设置' })).toContainText(
      '阅读记录已保留',
    );
    release();
    await expect.poll(() => finished).toBe(2);
    expect(fetched).toHaveLength(2);
    expect(await service.cache.get('fixture-mist/1', 7)).toBeNull();
    expect((await service.records.read()).records).toEqual({});
    await page.keyboard.press('Escape');
    await expect(page.locator('.story-preparation')).toContainText(
      '正文加载已暂停',
    );
    await page.getByRole('button', { name: '重试正文加载' }).click();
    await expect(page.locator('.story-preparation')).toContainText(
      '正文已加载 6 篇',
    );
  } finally {
    release();
    await page.close();
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
