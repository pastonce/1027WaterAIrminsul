import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { json, loadRuntime, projectRoot, readSkeleton, relative, sha256 } from './player-spine-utils.mjs';

const runtime = loadRuntime();
const sourceRoot = path.join(projectRoot, 'asserts/player-extracted');
const destination = path.join(projectRoot, 'public/asserts/inhabitants');
const assets = {};
const manifest = { format: 1, source: 'asserts/player-extracted', runtime: '4.0', assets: [] };
for (const group of ['nahida', 'aranara', 'crystalfly']) {
  for (const name of fs.readdirSync(path.join(sourceRoot, group)).sort()) {
    const source = path.join(sourceRoot, group, name);
    if (!fs.statSync(source).isDirectory()) continue;
    const folder = path.join(destination, group, name);
    const data = json(path.join(source, `${name}.json`));
    const { atlas, data: skeleton } = readSkeleton(runtime, path.join(source, `${name}.json`), path.join(source, `${name}.atlas`));
    assert.ok(data.skeleton.spine.startsWith('4.0.'));
    assert.equal(atlas.pages.length, 1); assert.equal(atlas.pages[0].name, `${name}.png`);
    assert.ok(skeleton.findAnimation('loop'));
    fs.mkdirSync(folder, { recursive: true });
    const files = ['json', 'atlas', 'png'].map((extension) => {
      const file = `${name}.${extension}`; const input = path.join(source, file); const output = path.join(folder, file);
      fs.copyFileSync(input, output);
      return { file, source: relative(input), bytes: fs.statSync(input).size, sha256: sha256(input) };
    });
    const prefix = `/asserts/inhabitants/${group}/${name}/${name}`;
    const { x: originX, y: originY, width, height } = data.skeleton;
    assets[name] = { id: name, group, json: prefix + '.json', atlas: prefix + '.atlas', texture: prefix + '.png', poster: prefix + '.webp', bounds: { x: originX, y: originY, width, height }, animation: 'loop', source: relative(source), files };
    manifest.assets.push(assets[name]);
    console.log(`${name}: ${skeleton.bones.length} bones, ${skeleton.slots.length} slots, ${files.reduce((total, file) => total + file.bytes, 0)} bytes`);
  }
}
assert.equal(Object.keys(assets).length, 17);
fs.writeFileSync(path.join(projectRoot, 'src/data/inhabitants.generated.json'), JSON.stringify(assets, null, 2) + '\n');
fs.mkdirSync(path.join(projectRoot, 'docs/inhabitants'), { recursive: true });
fs.writeFileSync(path.join(projectRoot, 'docs/inhabitants/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
