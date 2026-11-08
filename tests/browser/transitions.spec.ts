import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ request }) => {
  // A prior test may have persisted an explicit theme. Media emulation only
  // exercises both themes when the reader is following the system preference.
  await request.post('/api/tools', {
    data: {
      name: 'reader_settings',
      arguments: { autoImages: false, retentionDays: 7, theme: 'system' },
    },
  });
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`source note stays pixel-stable while entering and leaving the chapter directory (${colorScheme})`, async ({
    page,
    request,
  }) => {
    await request.post('/api/tools', {
      data: { name: 'reader_clear_history', arguments: {} },
    });
    await page.setViewportSize({ width: 1116, height: 720 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: '剧情档案', exact: true }),
    ).toBeVisible();
    const note = page.locator('.source-note');
    const reference = await note.screenshot({
      path: `.ai/local/screenshots/source-note-reference-${colorScheme}.png`,
    });
    const steps = [
      { button: '打开剧情：雾中来信', animation: 'page-enter' },
      { button: '阅读 档案 01 一封未寄出的信', animation: 'reader-reveal' },
      { button: '篇章目录', animation: 'page-enter' },
      { button: '⌂ 主页', animation: 'home-enter' },
    ];
    await mkdir('.ai/local/screenshots', { recursive: true });
    for (const [index, step] of steps.entries()) {
      await page
        .getByRole('button', { name: step.button, exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            document
              .getAnimations()
              .filter((animation) => animation instanceof CSSAnimation)
              .map((animation) => animation.animationName),
          ),
        )
        .toContain(step.animation);
      for (const progress of [0.2, 0.5, 0.8]) {
        await page.evaluate((fraction) => {
          for (const animation of document.getAnimations()) {
            animation.pause();
            const duration = animation.effect?.getTiming().duration;
            if (typeof duration === 'number')
              animation.currentTime = duration * fraction;
          }
        }, progress);
        // Page/cover snapshots must never cover or rasterize the persistent source label.
        const current = await note.screenshot({
          path: `.ai/local/screenshots/source-note-current-${colorScheme}.png`,
          animations: 'allow',
        });
        await page.screenshot({
          path: `.ai/local/screenshots/chrome-${colorScheme}-${index}-${progress}.png`,
          animations: 'allow',
        });
        expect(
          current.equals(reference),
          `source note changed during ${step.button} at ${progress}`,
        ).toBe(true);
      }
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.play();
      });
      await page.evaluate(async () => {
        await Promise.allSettled(
          document.getAnimations().map((animation) => animation.finished),
        );
      });
    }
  });
}

test('slow recent/chapter navigation keeps the outgoing page visible without a full-page loading flash', async ({
  page,
  request,
}) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  let release = () => {};
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/tools', async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (
      body &&
      typeof body === 'object' &&
      'name' in body &&
      body.name === 'reader_chapter'
    )
      await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: '最近阅读：一封未寄出的信' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'true');
  await mkdir('.ai/local/screenshots', { recursive: true });
  try {
    await page.screenshot({
      path: '.ai/local/screenshots/recent-wait.png',
      animations: 'allow',
    });
    expect(await page.locator('.loading-overlay').count()).toBe(0);
    expect(
      await page
        .getByRole('heading', { name: '剧情档案', exact: true })
        .isVisible(),
    ).toBe(true);
  } finally {
    release();
  }
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSAnimation)
          .map((animation) => animation.animationName),
      ),
    )
    .toContain('reader-reveal');
  const captures = await page.evaluate(() => {
    const result: (string | null)[] = [];
    for (const animation of document.getAnimations()) {
      animation.pause();
      const duration = animation.effect?.getTiming().duration;
      if (typeof duration === 'number') animation.currentTime = duration * 0.35;
      if (animation.effect instanceof KeyframeEffect)
        result.push(animation.effect.pseudoElement);
    }
    return result;
  });
  // Ordinary navigation must not extract a second sheet or lingering library covers.
  expect(
    captures.some(
      (capture) =>
        capture?.includes('reader-sheet') || capture?.includes('cover-'),
    ),
  ).toBe(false);
  await page.screenshot({
    path: '.ai/local/screenshots/recent-reveal.png',
    animations: 'allow',
  });
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.play();
  });
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.locator('.reading-index button').nth(1).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'true');
  try {
    expect(await page.locator('.loading-overlay').count()).toBe(0);
    expect(
      await page
        .getByRole('heading', { name: '一封未寄出的信', exact: true })
        .isVisible(),
    ).toBe(true);
    // A pending request must not block a newer navigation or replace it when it completes.
    await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '剧情档案', exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
});

test('opposite horizontal waves reveal the new chapter while both sheets stay flat and opaque', async ({
  page,
  request,
}) => {
  // Freeze real wave starts before polling. A 440 ms animation can finish
  // between expect.poll's backoff samples; retain the actual CSS/keyframes.
  await page.addInitScript(() => {
    document.addEventListener('animationstart', (event) => {
      if (!event.animationName.startsWith('reader-wave-')) return;
      for (const animation of document.getAnimations()) animation.pause();
    });
  });
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  const reader = page.getByRole('main', { name: '剧情正文' });
  await expect(reader).toBeVisible();
  for (const direction of ['next', 'previous'] as const) {
    await reader.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page
      .getByRole('button', {
        name: direction === 'next' ? /^下一篇：/ : /^上一篇：/,
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .getAnimations()
            .filter((animation) => animation instanceof CSSAnimation)
            .map((animation) => animation.animationName),
        ),
      )
      .toContain(`reader-wave-${direction}`);
    let lastEdge: number | undefined;
    for (const fraction of [0.2, 0.5, 0.8]) {
      const sheet = await page.evaluate((progress) => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          const duration = animation.effect?.getTiming().duration;
          if (typeof duration === 'number')
            animation.currentTime = duration * progress;
        }
        const style = getComputedStyle(
          document.documentElement,
          '::view-transition-new(reader-sheet)',
        );
        const old = getComputedStyle(
          document.documentElement,
          '::view-transition-old(reader-sheet)',
        );
        return {
          opacity: Number(style.opacity),
          oldOpacity: Number(old.opacity),
          transform: style.transform,
          oldTransform: old.transform,
          mask: style.maskImage,
          edge: Number.parseFloat(style.getPropertyValue('--reader-wave-edge')),
        };
      }, fraction);
      expect(sheet.opacity).toBe(1);
      expect(sheet.oldOpacity).toBe(1);
      expect(sheet.transform).toBe('none');
      expect(sheet.oldTransform).toBe('none');
      expect(sheet.mask).toContain('linear-gradient');
      if (lastEdge !== undefined) {
        if (direction === 'next') expect(sheet.edge).toBeLessThan(lastEdge);
        else expect(sheet.edge).toBeGreaterThan(lastEdge);
      }
      lastEdge = sheet.edge;
      await page.screenshot({
        path: `.ai/local/screenshots/wave-${direction}-${fraction}.png`,
        animations: 'allow',
      });
    }
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.play();
    });
    await page.evaluate(async () => {
      await Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      );
    });
    await expect
      .poll(() => reader.evaluate((element) => element.scrollTop))
      .toBe(0);
  }
});

test('Web Animations fallback stays flat and supports interruption without a stale page', async ({
  page,
  request,
}) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await page.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', {
      value: undefined,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  const reader = page.getByRole('main', { name: '剧情正文' });
  await expect(reader).toBeVisible();
  await reader.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: /^下一篇：/ }).click();
  await expect(
    page.getByRole('heading', { name: '钟楼的方向', exact: true }),
  ).toBeVisible();
  await reader.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: /^上一篇：/ }).click();
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
  await expect(page.getByRole('main', { name: '剧情正文' })).toHaveCount(0);
});
