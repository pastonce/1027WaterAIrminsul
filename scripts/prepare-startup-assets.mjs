import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = resolve('public');
const files = {};
const manifest = [];
async function walk(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((first, second) => first.name.localeCompare(second.name, 'en'))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!/\.(?:png|jpe?g|webp|svg|json|atlas|woff2)$/i.test(entry.name) || path.includes(`${sep}music${sep}`)) continue;
    const bytes = await readFile(path);
    const url = '/' + relative(root, path).split(sep).join('/');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    files[url] = bytes.length;
    manifest.push({ url, bytes: bytes.length, sha256 });
  }
}
await walk(resolve(root, 'asserts'));
const revision = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16);
await writeFile('src/data/startupAssets.generated.json', JSON.stringify({ revision, files }, null, 2) + '\n');
await writeFile('docs/startup-assets.manifest.json', JSON.stringify({ revision, files: manifest }, null, 2) + '\n');
console.log(`Startup catalog ${revision}: ${manifest.length} files, ${Object.values(files).reduce((sum, bytes) => sum + bytes, 0)} bytes`);
