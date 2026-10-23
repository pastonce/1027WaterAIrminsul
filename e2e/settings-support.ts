import type { Page } from '@playwright/test';

export async function openSettings(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
}

