import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const channel = executablePath ? undefined : process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 2,
  reporter: 'list',
  use: { browserName: 'chromium', channel, launchOptions: executablePath ? { executablePath } : undefined, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', testMatch: ['entry-compatibility.spec.ts', 'waking-birthday.spec.ts', 'game.spec.ts', 'backgrounds.spec.ts', 'inhabitants.spec.ts', 'inhabitants-depth.spec.ts', 'inhabitants-fixes.spec.ts', 'nahida-blessing.spec.ts', 'opening.spec.ts', 'stage-loading.spec.ts', 'page-art.spec.ts', 'dialogue-flow.spec.ts', 'speech-playback.spec.ts', 'music-fonts.spec.ts', 'dialogue-themes.spec.ts', 'expressions.spec.ts'], use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-landscape', testMatch: ['entry-compatibility.spec.ts', 'waking-birthday.spec.ts', 'game.spec.ts', 'backgrounds.spec.ts', 'inhabitants.spec.ts', 'inhabitants-depth.spec.ts', 'inhabitants-fixes.spec.ts', 'nahida-blessing.spec.ts', 'opening.spec.ts', 'stage-loading.spec.ts', 'page-art.spec.ts', 'dialogue-flow.spec.ts', 'speech-playback.spec.ts', 'music-fonts.spec.ts', 'dialogue-themes.spec.ts', 'expressions.spec.ts'], use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'production', testMatch: ['entry-compatibility.spec.ts', 'waking-birthday.spec.ts', 'production.spec.ts', 'time.spec.ts', 'backgrounds-production.spec.ts', 'inhabitants-production.spec.ts', 'opening.spec.ts', 'stage-loading.spec.ts', 'page-art.spec.ts', 'dialogue-flow.spec.ts', 'speech-playback.spec.ts', 'music-fonts.spec.ts', 'dialogue-themes.spec.ts', 'expressions.spec.ts'], use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1366, height: 768 } } },
    { name: 'production-mobile-landscape', testMatch: ['entry-compatibility.spec.ts', 'waking-birthday.spec.ts', 'time.spec.ts', 'backgrounds-production.spec.ts', 'inhabitants-production.spec.ts', 'opening.spec.ts', 'stage-loading.spec.ts', 'page-art.spec.ts', 'dialogue-flow.spec.ts', 'speech-playback.spec.ts', 'music-fonts.spec.ts', 'dialogue-themes.spec.ts', 'expressions.spec.ts'], use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ].map((project) => ({ ...project, testMatch: [...project.testMatch, 'interaction-sound.spec.ts', 'easter-eggs.spec.ts', 'birthday-mail.spec.ts'] })),
  webServer: [
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 30000 },
  ],
});
