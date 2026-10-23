import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { json, loadRuntime, pngSize, projectRoot, readSkeleton, relative, sha256 } from './player-spine-utils.mjs';

const source = path.join(projectRoot, 'asserts/player/image_2');
const destination = path.join(projectRoot, 'asserts/background-derived/festival');
const published = path.join(projectRoot, 'public/asserts/backgrounds/festival');
const excluded = 'layer_17_Role';
const keep = (name) => name !== excluded && !name.startsWith(excluded + '/');
const raw = json(path.join(source, 'image_2.json'));
const result = structuredClone(raw);
const mapping = new Map();
result.bones = raw.bones.filter((bone, index) => {
  if (!keep(bone.name)) return false;
  mapping.set(index, mapping.size);
  assert.ok(!bone.parent || keep(bone.parent));
  return true;
});
result.slots = raw.slots.filter((slot) => keep(slot.name));
for (const type of ['ik', 'transform', 'path']) {
  result[type] = raw[type].filter((constraint) => keep(constraint.name));
  for (const constraint of result[type]) assert.ok(constraint.bones.every(keep) && keep(constraint.target));
}
const orders = ['ik', 'transform', 'path'].flatMap((type) => result[type].map((constraint) => constraint.order)).sort((first, second) => first - second);
for (const type of ['ik', 'transform', 'path']) for (const constraint of result[type]) constraint.order = orders.indexOf(constraint.order);
const spine = loadRuntime();
const original = readSkeleton(spine, path.join(source, 'image_2.json'), path.join(source, 'image_2.atlas'));
const regions = new Set();
for (const skin of result.skins) {
  skin.attachments = Object.fromEntries(Object.entries(skin.attachments).filter(([name]) => keep(name)));
  for (const attachments of Object.values(skin.attachments)) {
    for (const [name, attachment] of Object.entries(attachments)) {
      if (['mesh', 'linkedmesh', 'region'].includes(attachment.type ?? 'region')) regions.add(attachment.path ?? name);
      assert.ok(!attachment.end || keep(attachment.end));
      if (!attachment.vertices) continue;
      const unweightedLength = attachment.type === 'mesh' ? attachment.uvs.length : attachment.vertexCount * 2;
      if (attachment.vertices.length === unweightedLength) continue;
      for (let cursor = 0; cursor < attachment.vertices.length;) {
        const count = attachment.vertices[cursor++];
        for (let index = 0; index < count; index++, cursor += 4) {
          const target = mapping.get(attachment.vertices[cursor]);
          assert.notEqual(target, undefined, 'Background depends on removed character');
          attachment.vertices[cursor] = target;
        }
      }
    }
  }
}
result.animations = {};
for (const [name, input] of Object.entries(raw.animations)) {
  if (!keep(name)) continue;
  assert.equal(input.drawOrder?.length ?? 0, 0, 'Review source draw order before deriving');
  assert.equal(input.events?.length ?? 0, 0, 'Review source events before deriving');
  const animation = structuredClone(input);
  for (const category of ['bones', 'slots', 'ik', 'transform', 'path']) {
    if (animation[category]) animation[category] = Object.fromEntries(Object.entries(animation[category]).filter(([key]) => keep(key)));
  }
  for (const [skin, slots] of Object.entries(animation.deform ?? {})) {
    const retained = Object.fromEntries(Object.entries(slots).filter(([slot]) => keep(slot)));
    if (Object.keys(retained).length) animation.deform[skin] = retained;
    else delete animation.deform[skin];
  }
  result.animations[name] = animation;
}
const pages = new Set([...regions].map((name) => {
  const region = original.atlas.findRegion(name);
  assert.ok(region, name);
  return region.page.name;
}));
const atlas = fs.readFileSync(path.join(source, 'image_2.atlas'), 'utf8').trim().split(/\r?\n\s*\r?\n/).filter((section) => pages.has(section.split(/\r?\n/)[0])).join('\n\n') + '\n';
const parsedAtlas = new spine.TextureAtlas(atlas);
assert.equal(parsedAtlas.regions.length, regions.size, 'Retained page includes unused character pixels');
assert.ok(parsedAtlas.regions.every((region) => regions.has(region.name)));
fs.mkdirSync(destination, { recursive: true });
fs.mkdirSync(published, { recursive: true });
fs.writeFileSync(path.join(destination, 'festival.json'), JSON.stringify(result) + '\n');
fs.writeFileSync(path.join(destination, 'festival.atlas'), atlas);
for (const file of ['festival.json', 'festival.atlas']) fs.copyFileSync(path.join(destination, file), path.join(published, file));
for (const page of pages) fs.copyFileSync(path.join(source, page), path.join(published, page));
const data = readSkeleton(spine, path.join(published, 'festival.json'), path.join(published, 'festival.atlas')).data;
assert.equal(data.findAnimation('loop').duration, original.data.findAnimation('loop').duration);
assert.ok(!JSON.stringify(result).includes(excluded));
const inputs = fs.readdirSync(source).sort().map((file) => ({ file: relative(path.join(source, file)), sha256: sha256(path.join(source, file)) }));
const files = ['festival.json', 'festival.atlas', ...pages].map((file) => ({ file, source: relative(path.join(file.endsWith('.png') ? source : destination, file)), bytes: fs.statSync(path.join(published, file)).size, sha256: sha256(path.join(published, file)) }));
const manifest = { format: 1, source: 'asserts/player/image_2', removed: { prefix: excluded, bones: raw.bones.length - result.bones.length, slots: raw.slots.length - result.slots.length, pages: original.atlas.pages.filter((page) => !pages.has(page.name)).map((page) => page.name) }, retained: { bones: result.bones.length, slots: result.slots.length, regions: regions.size, animations: Object.keys(result.animations), loopSeconds: data.findAnimation('loop').duration, bounds: result.skeleton, textureBytes: [...pages].reduce((total, page) => { const [width, height] = pngSize(path.join(source, page)); return total + width * height * 4; }, 0) }, inputs, files };
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ removed: manifest.removed, retained: manifest.retained, publishedBytes: files.reduce((total, file) => total + file.bytes, 0) }, null, 2));
