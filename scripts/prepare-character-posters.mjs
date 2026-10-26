import { createServer } from 'node:http';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Offline only: render the same local Spine viewport, never ship another runtime canvas.
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jobs = [
  { id: 'dream', json: '/asserts/characters/dream/shouye_caoshen.json', atlas: '/asserts/characters/dream/shouye_caoshen.atlas', texture: '/asserts/characters/dream/shouye_caoshen.png', animation: 'loop' },
  { id: 'reality', json: '/asserts/characters/reality/naxida.json', atlas: '/asserts/characters/reality/naxida.atlas', texture: '/asserts/characters/reality/naxida.3807ce40.png', animation: 'animation' },
];
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<html><body></body></html>'); return; }
    const prefix = pathname.startsWith('/asserts/characters/') ? 'public' : pathname.startsWith('/node_modules/spine-player-4-0/dist/') ? '' : null;
    if (prefix === null) { response.writeHead(404).end(); return; }
    const file = path.resolve(root, prefix, '.' + pathname);
    if (!file.startsWith(root) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.atlas': 'text/plain', '.png': 'image/png' };
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream'); createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const manifest = { version: 1, runtime: 'spine-player-4-0', method: 'Original animation at 0.7 seconds, original auto viewport with 8% padding, transparent 640px height WebP quality .88.', files: [] };
const posters = {};
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 }); await page.goto(base);
  await page.addStyleTag({ url: `${base}/node_modules/spine-player-4-0/dist/spine-player.css` });
  await page.addScriptTag({ url: `${base}/node_modules/spine-player-4-0/dist/iife/spine-player.js` });
  for (const job of jobs) {
    const data = JSON.parse(readFileSync(path.join(root, 'public', job.json), 'utf8'));
    const height = 640; const width = Math.round(height * data.skeleton.width / data.skeleton.height);
    const image = await page.evaluate(async ({ job, width, height }) => {
      const host = document.createElement('div'); host.style.cssText = `position:relative;width:${width}px;height:${height}px`; document.body.append(host);
      let player;
      try {
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Character poster timed out')), 20000);
          player = new spine.SpinePlayer(host, {
            jsonUrl: job.json, atlasUrl: job.atlas, animation: job.animation, premultipliedAlpha: false,
            rawDataURIs: job.id === 'reality' ? { '/asserts/characters/reality/naxida.png': job.texture } : {},
            alpha: true, backgroundColor: '#00000000', preserveDrawingBuffer: true, showControls: false, showLoading: false,
            viewport: { padLeft: '8%', padRight: '8%', padTop: '8%', padBottom: '8%', transitionTime: 0 },
            success: (loaded) => { loaded.setAnimation(job.animation, true); loaded.animationState.getCurrent(0).trackTime = .7; loaded.animationState.apply(loaded.skeleton); loaded.skeleton.updateWorldTransform(); loaded.pause(); },
            draw: (loaded) => {
              clearTimeout(timeout);
              const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
              const context = canvas.getContext('2d'); context.drawImage(loaded.canvas, 0, 0, width, height);
              const alpha = context.getImageData(0, 0, width, height).data;
              let visible = 0; for (let offset = 3; offset < alpha.length; offset += 4) if (alpha[offset]) visible++;
              if (visible < width * height * .01) { reject(new Error('Empty character poster')); return; }
              resolve({ data: canvas.toDataURL('image/webp', .88).split(',')[1], width, height, visible });
            },
            error: (_, message) => { clearTimeout(timeout); reject(new Error(message)); },
          });
        });
      } finally { const gl = player?.context?.gl; player?.dispose(); gl?.getExtension('WEBGL_lose_context')?.loseContext(); host.remove(); }
    }, { job, width, height });
    const bytes = Buffer.from(image.data, 'base64');
    const url = `/asserts/characters/${job.id}/poster-${hash(bytes).slice(0, 12)}.webp`;
    mkdirSync(path.dirname(path.join(root, 'public', url)), { recursive: true }); writeFileSync(path.join(root, 'public', url), bytes);
    posters[job.id] = url;
    manifest.files.push({ id: job.id, url, bytes: bytes.length, sha256: hash(bytes), width: image.width, height: image.height, visiblePixels: image.visible, sources: [job.json, job.atlas, job.texture].map((source) => { const input = readFileSync(path.join(root, 'public', source)); return { path: 'public' + source, sha256: hash(input), bytes: input.length }; }) });
    console.log(`${job.id}: ${bytes.length} bytes`);
  }
  writeFileSync(path.join(root, 'src/data/characterPosters.generated.json'), JSON.stringify(posters, null, 2) + '\n');
  writeFileSync(path.join(root, 'docs/character-posters.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
