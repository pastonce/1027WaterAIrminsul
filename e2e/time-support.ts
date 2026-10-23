import type { Page } from '@playwright/test';
import type { GameSave } from '../src/types/game';

export async function mockServerTime(page: Page, initial: string) {
  const server = { now: Date.parse(initial), mode: 'ok' as 'ok' | 'offline' | 'timeout' | 'html' | 'stale', requests: 0 };
  await page.route('**/api/time?*', async (route) => {
    server.requests++;
    if (server.mode === 'timeout') return;
    if (server.mode === 'offline') { await route.abort('internetdisconnected'); return; }
    if (server.mode === 'html') { await route.fulfill({ contentType: 'text/html', body: '<html>Not an API</html>' }); return; }
    const requestId = new URL(route.request().url()).searchParams.get('requestId');
    await route.fulfill({ json: { version: 1, now: server.now, requestId: server.mode === 'stale' ? 'previous-request' : requestId }, headers: { 'Cache-Control': 'no-store' } });
  });
  return server;
}

export async function seedPlayer(page: Page, save: GameSave) {
  await page.addInitScript((initial) => {
    if (!localStorage.getItem('irminsul.player.v2')) localStorage.setItem('irminsul.player.v2', JSON.stringify(initial));
  }, save);
}

export async function playerSave(page: Page): Promise<GameSave> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('irminsul.player.v2')!) as GameSave);
}
