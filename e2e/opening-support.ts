import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { OPENING_RULES } from '../src/game/opening/choreography';

export async function finishOpening(page: Page, clocked = false) {
  const shell = page.locator('.opening-shell');
  await expect(shell).toHaveAttribute('data-opening-mode', /playing|fallback|complete/);
  const mode = await shell.getAttribute('data-opening-mode');
  if (clocked && mode !== 'complete') {
    if (mode === 'playing' && await shell.getAttribute('data-opening-phase') === 'throw') await page.clock.runFor(OPENING_RULES.arriveMs);
    await expect(shell).toHaveAttribute('data-preload-complete', 'true', { timeout: 65000 });
    for (let step = 0; step < 6 && await shell.getAttribute('data-opening') === 'true'; step++) await page.clock.runFor(1300);
  }
  await expect(shell).toHaveAttribute('data-opening', 'false', { timeout: 75000 });
}
