import { expect, type Page } from '@playwright/test';

export async function selectTheme(page: Page, theme: 'light' | 'dark') {
  const follow = page.getByRole('switch', {
    name: '主题跟随系统',
    exact: true,
  });
  if ((await follow.getAttribute('aria-checked')) === 'true') {
    await follow.click();
    await expect(follow).toBeEnabled();
  }
  const dark = page.getByRole('switch', { name: '深色模式', exact: true });
  await expect(dark).toBeEnabled();
  if (
    ((await dark.getAttribute('aria-checked')) === 'true') !==
    (theme === 'dark')
  )
    await dark.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(dark).toBeEnabled();
}
