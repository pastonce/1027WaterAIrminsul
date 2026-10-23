import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
mkdirSync(path.join(root, 'public/asserts/expressions'), { recursive: true });
for (let asset = 0; asset < 10; asset++) {
  const source = `asserts/表情包/${asset}.png`;
  const bytes = readFileSync(path.join(root, source));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid expression PNG: ${source}`);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (width !== 340 || height !== 340) throw new Error(`Unexpected expression size: ${source}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const filename = `${asset}-${sha256.slice(0, 12)}.png`;
  const file = `public/asserts/expressions/${filename}`;
  copyFileSync(path.join(root, source), path.join(root, file));
  files.push({ asset, source, file, src: `/asserts/expressions/${filename}`, bytes: bytes.length, sha256, width, height });
}
writeFileSync(path.join(root, 'src/data/expressionAssets.generated.json'), JSON.stringify(Object.fromEntries(files.map((file) => [file.asset, file.src])), null, 2) + '\n');
writeFileSync(path.join(root, 'docs/expression-assets.manifest.json'), JSON.stringify({ files, publishedBytes: files.reduce((sum, file) => sum + file.bytes, 0) }, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, publishedBytes: files.reduce((sum, file) => sum + file.bytes, 0) }));
