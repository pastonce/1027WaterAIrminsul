import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { timePlugin } from './server/timePlugin';
import pageAssets from './src/data/pageAssets.generated.json' with { type: 'json' };
import fonts from './src/data/fonts.generated.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), timePlugin(), { name: 'page-art-icon', transformIndexHtml: (html) => html.replace('/__site-icon__.png', pageAssets.icon).replace('/__site-font__.woff2', fonts.common) }],
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
