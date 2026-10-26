import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Read-only: a candidate list must be reviewed before any removal.
const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'public');
const urls = new Set();
const missing = new Set();
const examples = [];
const add = (url) => { if (typeof url === 'string' && url.startsWith('/asserts/')) urls.add(url); };
const collect = (value) => {
  if (typeof value === 'string') add(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
};
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Asset symlink requires review: ${path}`);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
try {
  const { startupPlan } = await server.ssrLoadModule('/src/game/assets/startupPlan.ts');
  const { STAGE_LOADING_ART } = await server.ssrLoadModule('/src/data/stageLoading.ts');
  for (const variant of [0, 1]) {
    const choices = Object.fromEntries(Object.entries(STAGE_LOADING_ART).filter(([, arts]) => arts.length).map(([stage, arts]) => [stage, arts[Math.min(variant, arts.length - 1)].id]));
    for (const [width, height] of [[2560, 1440], [1440, 900], [844, 390], [568, 320]]) {
      for (const reduced of [false, true]) {
        for (const stage of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
          const plan = startupPlan(choices, width, height, 1, reduced, stage);
          plan.files.forEach((file) => add(file.url));
          if (variant === 1 && stage === 'A' && (width === 1440 && !reduced || width === 844)) examples.push({ width, height, reduced, files: plan.files.length, bytes: plan.bytes });
        }
      }
    }
  }
  const { BACKGROUND_ASSETS } = await server.ssrLoadModule('/src/data/backgrounds.ts');
  for (const background of Object.values(BACKGROUND_ASSETS)) if (background.hiding) add(background.hiding.foreground.replace('hiding-foreground.webp', 'hiding-band-0.webp'));
} finally { await server.close(); }

// Literal assets also include fallbacks, font unicode subsets and cursor files.
// Keep all tree registration variants used by local geometry verification.
for (const path of await walk(resolve(root, 'src'))) {
  if (path.endsWith('startupAssets.generated.json') || !/\.(?:ts|tsx|css|json|md)$/.test(path)) continue;
  const content = await readFile(path, 'utf8');
  if (path.endsWith('.generated.json')) collect(JSON.parse(content));
  for (const [url] of content.matchAll(/\/asserts\/[^\s'"`<>(){}]+/g)) {
    if (url.endsWith('/hiding-foreground.webp')) continue; // Naming template only.
    if (await stat(resolve(publicRoot, '.' + url)).then((file) => file.isFile(), () => false)) add(url);
  }
}
add('/asserts/cursor/COPYRIGHT.txt');
add('/asserts/sfx/CREDITS.txt');
for (const url of urls) if (!await stat(resolve(publicRoot, '.' + url)).then((file) => file.isFile(), () => false)) missing.add(url);
const files = await Promise.all((await walk(resolve(publicRoot, 'asserts'))).map(async (path) => ({ path: relative(root, path).split(sep).join('/'), url: '/' + relative(publicRoot, path).split(sep).join('/'), bytes: (await stat(path)).size })));
const candidates = files.filter((file) => !urls.has(file.url));
const report = { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), retained: files.length - candidates.length, missing: [...missing], candidates, examples };
if (process.argv.includes('--report')) {
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await writeFile(resolve(root, 'artifacts/release-assets.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
if (missing.size || candidates.length) process.exitCode = 1;
