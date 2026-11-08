import type { Page } from '@playwright/test';

/** Actual Chromium touch input, rather than synthetic DOM events. */
export async function nativeSwipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [from],
    });
    for (let i = 1; i <= 10; i++) {
      // Decelerate before lifting: a constant-speed release can leave a native
      // fling active, consuming the next tap as a scroll stop instead of click.
      const travel = 1 - (1 - i / 10) ** 3;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: from.x + (to.x - from.x) * travel,
            y: from.y + (to.y - from.y) * travel,
          },
        ],
      });
      await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}
