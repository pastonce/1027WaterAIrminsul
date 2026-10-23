import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve('dist');
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push({ path, bytes: (await stat(path)).size });
  }
}
await walk(root);
const failures = [];
if (files.length > 20000) failures.push('Pages Free 单站超过 20000 文件');
for (const file of files) if (file.bytes > 25 * 1024 * 1024) failures.push(`超过25MiB: ${relative(root, file.path)}`);
for (const path of ['functions/api/time.ts', 'server/timeEndpoint.ts', 'dist/_routes.json']) await stat(path).catch(() => failures.push(`缺失: ${path}`));
const catalog = JSON.parse(await readFile('src/data/startupAssets.generated.json', 'utf8'));
for (const [url, bytes] of Object.entries(catalog.files)) {
  const file = files.find((file) => file.path === resolve(root, '.' + url));
  if (!file || file.bytes !== bytes) failures.push(`发布资源缺失或过期: ${url}`);
}
console.log(JSON.stringify({ files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), largest: [...files].sort((first, second) => second.bytes - first.bytes).slice(0, 3).map((file) => ({ path: relative(root, file.path), bytes: file.bytes })), failures }, null, 2));
if (failures.length) process.exitCode = 1;
