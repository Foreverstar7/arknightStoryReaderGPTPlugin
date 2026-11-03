import { CacheCoordinator } from '../../src/storage/cache-coordinator.js';
import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { FixtureSource } from '../../src/data/fixture.js';
import { ReaderError } from '../../src/data/source.js';
import { ReaderService } from '../../src/server/service.js';
import { toolRequestSchema, type Chapter } from '../../src/shared/contracts.js';

test('S4 refresh/restart resumes migrated position, preserves furthest on reread, skips unread chapters and never refills cleared text on scroll', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const base = path.resolve('.ai/local/s4-browser');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'migration-'));
  const fixture = new FixtureSource();
  const original = await fixture.chapter('fixture-mist/1');
  let current: Chapter = { ...original, revision: 's4-original-v1' };
  let offline = false;
  const fetched: string[] = [];
  const source = {
    label: fixture.label,
    catalog: async () =>
      (await fixture.catalog()).map((story) => ({
        ...story,
        chapters: story.chapters.map((chapter) =>
          chapter.id === original.id
            ? { ...chapter, wordCount: null }
            : chapter,
        ),
      })),
    chapter: async (id: string) => {
      fetched.push(id);
      if (offline)
        throw new ReaderError('network', '测试断网：已有缓存应可读取');
      return id === original.id
        ? structuredClone(current)
        : fixture.chapter(id);
    },
  };
  let service = new ReaderService(source, root);
  await page.route('**/api/tools', async (route) => {
    const request = toolRequestSchema.parse(route.request().postDataJSON());
    try {
      await route.fulfill({
        json: await service.call(request.name, request.arguments),
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
    await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
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
          (await service.records.read()).records[original.id]?.complete,
      )
      .toBe(true);
    const targetScroll = await reader.evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.35;
      return element.scrollTop;
    });
    await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '剧情档案', exact: true }),
    ).toBeVisible();
    const before = (await service.records.read()).records[original.id];
    expect(before?.complete).toBe(true);
    await page
      .getByRole('button', { name: '最近阅读：一封未寄出的信' })
      .click();
    await expect
      .poll(() => reader.evaluate((element) => element.scrollTop))
      .toBeCloseTo(targetScroll, 0);
    // Another cached chapter provides a concrete refresh-isolation check.
    const second = await service.chapter('fixture-mist/2');
    const secondBefore = JSON.stringify(await service.cache.get(second.id, 7));
    current = {
      ...current,
      revision: 's4-original-v2',
      blocks: [
        ...current.blocks,
        {
          id: 's4-postscript',
          kind: 'narration',
          text: '新修订补充的后记，需要读到新的结尾。'.repeat(25),
        },
      ],
    };
    const callsBeforeRefresh = fetched.length;
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '刷新本章 ↻', exact: true }).click();
    await expect(page.locator('.revision-notice')).toContainText(
      '已恢复到原段落',
    );
    await page.keyboard.press('Escape');
    await expect
      .poll(() => reader.evaluate((element) => element.scrollTop))
      .toBeCloseTo(targetScroll, 0);
    const migrated = (await service.records.read()).records[original.id];
    expect(migrated?.last.blockId).toBe(before?.last.blockId);
    expect(migrated?.complete).toBe(false);
    expect(migrated?.migration?.previous.complete).toBe(true);
    expect(fetched.slice(callsBeforeRefresh)).toEqual([original.id]);
    expect(JSON.stringify(await service.cache.get(second.id, 7))).toBe(
      secondBefore,
    );
    // A new service instance actually loses all in-process indexes.
    offline = true;
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '刷新本章 ↻', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText(
      '测试断网',
    );
    expect((await service.cache.get(original.id, 7))?.revision).toBe(
      current.revision,
    );
    await page.keyboard.press('Escape');
    service = new ReaderService(source, root);
    const beforeRestart = fetched.length;
    await page.reload();
    await expect
      .poll(() => reader.evaluate((element) => element.scrollTop))
      .toBeCloseTo(targetScroll, 0);
    expect(fetched).toHaveLength(beforeRestart);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await reader.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(
        async () =>
          (await service.records.read()).records[original.id]?.complete,
      )
      .toBe(true);
    const complete = (await service.records.read()).records[original.id]
      ?.furthestWords;
    await reader.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page
      .getByRole('button', { name: '清理全部内容缓存', exact: true })
      .click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText(
      '阅读记录已保留',
    );
    await page.keyboard.press('Escape');
    await reader.evaluate((element) => {
      element.scrollTop = 600;
    });
    await expect
      .poll(
        async () =>
          (await service.records.read()).records[original.id]?.last.blockId,
      )
      .not.toBe(original.blocks[0]?.id);
    expect(fetched).toHaveLength(beforeRestart);
    expect(await service.cache.get(original.id, 7)).toBeNull();
    expect(
      (await service.records.read()).records[original.id]?.furthestWords,
    ).toBe(complete);
    offline = false;
    await page.getByRole('button', { name: '篇章目录', exact: true }).click();
    await page
      .getByRole('button', { name: '阅读 档案 03 路口 · 行动前' })
      .click();
    await expect(
      page.getByRole('heading', { name: '路口 · 行动前', exact: true }),
    ).toBeVisible();
    const state = await service.records.read();
    expect(state.records['fixture-mist/2']).toBeUndefined();
    expect(state.records[original.id]?.complete).toBe(true);
    expect(state.recentChapterId).toBe('fixture-mist/3');
  } finally {
    await page.close();
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});

test('S4 missing legacy source shows honest revision progress and a usable notice at all supported sizes/themes', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const base = path.resolve('.ai/local/s4-browser');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'legacy-'));
  const source = new FixtureSource();
  const service = new ReaderService(source, root);
  await service.records.change((state) => ({
    ...state,
    recentChapterId: 'fixture-mist/1',
    records: {
      'fixture-mist/1': {
        chapterId: 'fixture-mist/1',
        storyId: 'fixture-mist',
        revision: 'unavailable-original-revision',
        last: { blockId: 'gone', fraction: 0.5 },
        furthestWords: 1000,
        totalWords: 1200,
        complete: false,
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    },
  }));
  await page.route('**/api/tools', async (route) => {
    const request = toolRequestSchema.parse(route.request().postDataJSON());
    await route.fulfill({
      json: await service.call(request.name, request.arguments),
    });
  });
  try {
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      for (const viewport of [
        { width: 320, height: 760 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
        { width: 1024, height: 400 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto('/');
        await expect(page.locator('.revision-notice')).toContainText(
          '原位置无法确认',
        );
        await expect(page.locator('.revision-notice')).toBeVisible();
        await expect(page.locator('.progress')).toContainText('修订进度待核实');
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
        const saved = (await service.records.read()).records['fixture-mist/1'];
        expect(saved?.migration?.previous.last.blockId).toBe('gone');
        expect(saved?.migration?.previous.furthestWords).toBe(1000);
        await page.screenshot({
          path: `.ai/local/screenshots/s4-revision-${theme}-${viewport.width}x${viewport.height}.png`,
        });
        await page.getByRole('button', { name: '设置', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(
          page.getByRole('dialog', { name: '阅读设置' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
  } finally {
    await page.close();
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
