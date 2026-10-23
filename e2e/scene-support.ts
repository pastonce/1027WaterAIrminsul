import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FOREST_ENTRANCE_SECONDS } from '../src/game/backgrounds/entrance';

export async function finishSceneEntrance(page: Page, clocked = false) {
  if (!await page.locator('.scenery-forest').count()) return;
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/, { timeout: 20000 });
  if (clocked) await page.clock.runFor(Math.ceil(FOREST_ENTRANCE_SECONDS * 1000) + 100);
  await expect(page.getByTestId('dream-scene')).toHaveAttribute('data-ground-entrance', '0');
}
