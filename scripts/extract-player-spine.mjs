import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { filesUnder, json, loadRuntime, outputRoot, projectRoot, readSkeleton, relative, sha256 } from './player-spine-utils.mjs';
import { extractedRootName, selections } from './player-extract-config.mjs';

const spine = loadRuntime();
const destination = path.join(projectRoot, extractedRootName);
const reports = path.join(projectRoot, 'docs/player-extracted');
const temporary = path.join(projectRoot, '.asset-work/player-extract');
fs.mkdirSync(destination, { recursive: true });
fs.mkdirSync(reports, { recursive: true });
fs.mkdirSync(temporary, { recursive: true });
const cache = new Map();
const manifest = { format: 1, spine: '4.0.17', runtime: '4.0.31', premultipliedAlpha: false, assets: [], inputs: [] };
const packing = { assets: [] };

function input(group) {
  if (cache.has(group)) return cache.get(group);
  const base = path.join(outputRoot, group);
  const file = path.join(base, group + '.json');
  const raw = json(file);
  const parsed = readSkeleton(spine, file, path.join(base, group + '.atlas'));
  const value = { base, raw, ...parsed, bones: new Map(raw.bones.map((bone) => [bone.name, bone])) };
  cache.set(group, value);
  for (const name of filesUnder(base)) manifest.inputs.push({ file: relative(path.join(base, name)), sha256: sha256(path.join(base, name)) });
  return value;
}

function influences(attachment) {
  if (!attachment.vertices) return [];
  const length = attachment.type === 'mesh' ? attachment.uvs.length : attachment.vertexCount * 2;
  if (length === attachment.vertices.length) return [];
  const result = [];
  for (let cursor = 0; cursor < attachment.vertices.length;) {
    const count = attachment.vertices[cursor++];
    for (let index = 0; index < count; index++, cursor += 4) result.push(attachment.vertices[cursor]);
  }
  return result;
}

function remapVertices(attachment, mapping) {
  if (!attachment.vertices) return;
  const length = attachment.type === 'mesh' ? attachment.uvs.length : attachment.vertexCount * 2;
  if (length === attachment.vertices.length) return;
  for (let cursor = 0; cursor < attachment.vertices.length;) {
    const count = attachment.vertices[cursor++];
    for (let index = 0; index < count; index++, cursor += 4) {
      const next = mapping.get(attachment.vertices[cursor]);
      assert.notEqual(next, undefined);
      attachment.vertices[cursor] = next;
    }
  }
}

function measure(data, animations, step = 1 / 15) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const skeleton = new spine.Skeleton(data);
  for (const animation of animations) {
    const count = Math.ceil(animation.duration / step);
    for (let tick = 0; tick <= count; tick++) {
      skeleton.setToSetupPose();
      animation.apply(skeleton, -1, Math.min(tick * step, animation.duration), false, null, 1, spine.MixBlend.replace, spine.MixDirection.mixIn);
      skeleton.updateWorldTransform();
      for (const slot of skeleton.slots) {
        const attachment = slot.getAttachment();
        if (!attachment || !('region' in attachment) || !attachment.region || slot.color.a * attachment.color.a < 0.001) continue;
        const vertices = new Float32Array(attachment.worldVerticesLength ?? 8);
        if (attachment instanceof spine.RegionAttachment) attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
        else attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
        for (let index = 0; index < vertices.length; index += 2) {
          bounds[0] = Math.min(bounds[0], vertices[index]); bounds[1] = Math.min(bounds[1], vertices[index + 1]);
          bounds[2] = Math.max(bounds[2], vertices[index]); bounds[3] = Math.max(bounds[3], vertices[index + 1]);
        }
      }
    }
  }
  assert.ok(bounds.every(Number.isFinite));
  return bounds;
}

for (const selection of selections) {
  const source = input(selection.group);
  const { raw } = source;
  const parentRoot = `${selection.prefix}/root`;
  function branch(name) {
    let bone = source.bones.get(name);
    while (bone && bone.name !== parentRoot && bone.parent !== parentRoot) bone = source.bones.get(bone.parent);
    return bone?.name.slice(selection.prefix.length + 1);
  }
  const allowedRoots = new Set(selection.roots);
  const slotNames = new Set(raw.slots.filter((slot) => {
    if (!slot.name.startsWith(selection.prefix + '/')) return false;
    if (!selection.roots) return true;
    const attachmentBones = Object.values(raw.skins[0].attachments[slot.name] ?? {}).flatMap(influences).map((index) => raw.bones[index].name);
    const names = attachmentBones.length ? attachmentBones : [slot.bone];
    return names.some((name) => allowedRoots.has(branch(name))) && names.every((name) => allowedRoots.has(branch(name)) || name === parentRoot);
  }).map((slot) => slot.name));
  assert.ok(slotNames.size > 0, selection.name);
  const bones = new Set();
  const constraints = new Set();
  function addBone(name) {
    while (name && !bones.has(name)) { bones.add(name); name = source.bones.get(name)?.parent; }
  }
  function addSlot(name) {
    slotNames.add(name);
    const slot = raw.slots.find((item) => item.name === name);
    addBone(slot.bone);
    for (const attachment of Object.values(raw.skins[0].attachments[name] ?? {})) {
      for (const index of influences(attachment)) addBone(raw.bones[index].name);
      if (attachment.end) slotNames.add(attachment.end);
    }
  }
  for (const name of slotNames) addSlot(name);
  let changed = true;
  while (changed) {
    const before = bones.size + constraints.size + slotNames.size;
    for (const type of ['ik', 'transform', 'path']) {
      for (const constraint of raw[type] ?? []) {
        if (!constraint.bones.some((bone) => bones.has(bone))) continue;
        constraints.add(constraint.name);
        constraint.bones.forEach(addBone);
        if (type === 'path') addSlot(constraint.target);
        else addBone(constraint.target);
      }
    }
    for (const name of slotNames) addSlot(name);
    changed = before !== bones.size + constraints.size + slotNames.size;
  }
  const rename = (name) => name.startsWith(selection.prefix + '/') ? name.slice(selection.prefix.length + 1) : name === 'scene' ? 'source_scene' : name;
  const indexMap = new Map();
  const result = { skeleton: { spine: '4.0.17', fps: 30, images: './' }, bones: [{ name: 'export_root' }, { name: 'animation_clock', parent: 'export_root' }], slots: [], ik: [], transform: [], path: [], skins: [{ name: 'default', attachments: {} }], events: {}, animations: {} };
  for (let index = 0; index < raw.bones.length; index++) {
    const original = raw.bones[index];
    if (!bones.has(original.name)) continue;
    indexMap.set(index, result.bones.length);
    result.bones.push({ ...original, name: rename(original.name), parent: original.parent ? rename(original.parent) : 'export_root' });
  }
  assert.equal(new Set(result.bones.map((bone) => bone.name)).size, result.bones.length);
  for (const original of raw.slots) if (slotNames.has(original.name)) result.slots.push({ ...original, name: rename(original.name), bone: rename(original.bone) });
  const orders = [...raw.ik, ...raw.transform, ...raw.path].filter((item) => constraints.has(item.name)).map((item) => item.order).sort((a, b) => a - b);
  for (const type of ['ik', 'transform', 'path']) {
    result[type] = raw[type].filter((item) => constraints.has(item.name)).map((item) => ({ ...item, name: rename(item.name), bones: item.bones.map(rename), target: rename(item.target), order: orders.indexOf(item.order) }));
  }
  const regions = new Set();
  for (const [slot, attachments] of Object.entries(raw.skins[0].attachments)) {
    if (!slotNames.has(slot)) continue;
    const copy = structuredClone(attachments);
    for (const [name, attachment] of Object.entries(copy)) {
      if (['mesh', 'region', 'linkedmesh'].includes(attachment.type ?? 'region')) regions.add(attachment.path ?? name);
      if (attachment.end) attachment.end = rename(attachment.end);
      remapVertices(attachment, indexMap);
    }
    result.skins[0].attachments[rename(slot)] = copy;
  }
  for (const [name, animation] of Object.entries(raw.animations)) {
    if (!name.startsWith(selection.prefix + '/')) continue;
    const filtered = {};
    for (const category of ['bones', 'slots', 'ik', 'transform', 'path']) {
      const keep = category === 'bones' ? bones : category === 'slots' ? slotNames : constraints;
      const entries = Object.entries(animation[category] ?? {}).filter(([key]) => keep.has(key)).map(([key, value]) => [rename(key), structuredClone(value)]);
      if (entries.length) filtered[category] = Object.fromEntries(entries);
    }
    for (const [skin, slots] of Object.entries(animation.deform ?? {})) {
      const entries = Object.entries(slots).filter(([slot]) => slotNames.has(slot)).map(([slot, timelines]) => [rename(slot), structuredClone(timelines)]);
      if (entries.length) (filtered.deform ??= {})[skin] = Object.fromEntries(entries);
    }
    assert.equal(animation.drawOrder?.length ?? 0, 0, 'Handle draw order before extracting');
    assert.equal(animation.events?.length ?? 0, 0, 'Handle event dependencies before extracting');
    if (!Object.keys(filtered).length) continue;
    const duration = source.data.findAnimation(name).duration;
    (filtered.bones ??= {}).animation_clock = { rotate: [{ time: 0, value: 0, curve: 'stepped' }, { time: duration, value: 0 }] };
    result.animations[name.slice(selection.prefix.length + 1)] = filtered;
  }
  assert.ok(result.animations[selection.animation], selection.name);
  result.animations = { loop: structuredClone(result.animations[selection.animation]), ...result.animations };
  // Measure with original atlas pages before packing; local transforms, weights
  // and deforms have not been altered, only names and dependency indices.
  const reader = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(source.atlas));
  let data = reader.readSkeletonData(result);
  const bounds = measure(data, data.animations.filter((animation) => animation.name !== 'loop'));
  const offset = [-Math.round((bounds[0] + bounds[2]) / 2 * 100) / 100, -Math.round(bounds[1] * 100) / 100];
  result.bones[0].x = offset[0]; result.bones[0].y = offset[1];
  const padding = Math.max(16, Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) * 0.04);
  Object.assign(result.skeleton, { x: Math.floor(bounds[0] + offset[0] - padding), y: Math.floor(-padding), width: Math.ceil(bounds[2] - bounds[0] + 2 * padding), height: Math.ceil(bounds[3] - bounds[1] + 2 * padding) });
  const directory = path.join(destination, selection.group, selection.name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, selection.name + '.json'), JSON.stringify(result) + '\n');
  const regionDefinitions = [...regions].sort().map((name) => {
    const region = source.atlas.findRegion(name);
    assert.ok(region, name);
    const rotated = region.degrees === 90 || region.degrees === 270;
    return { name, sourceFile: path.join(source.base, region.page.name), sourcePosition: [region.x, region.y], cropSize: rotated ? [region.height, region.width] : [region.width, region.height], logicalSize: [region.width, region.height], offsets: [region.offsetX, region.offsetY, region.originalWidth, region.originalHeight], degrees: region.degrees };
  });
  packing.assets.push({ name: selection.name, id: `${selection.group}/${selection.name}`, directory, regions: regionDefinitions });
  manifest.assets.push({ id: `${selection.group}/${selection.name}`, label: selection.label, name: selection.name, folder: `${selection.group}/${selection.name}`, source: { group: selection.group, prefix: selection.prefix, roots: selection.roots ?? null, slots: [...slotNames], animations: Object.keys(result.animations).filter((name) => name !== 'loop').map((name) => ({ name, source: selection.prefix + '/' + name })), animation: selection.animation }, offset, bounds: result.skeleton, animations: Object.keys(result.animations), loopSeconds: data.findAnimation(selection.animation).duration, bones: result.bones.length, slots: result.slots.length, regions: regions.size, sourceTextures: [...new Set(regionDefinitions.map((region) => path.basename(region.sourceFile)))] });
  console.log(`${selection.group}/${selection.name}: ${result.slots.length} slots, ${result.bones.length} bones, ${regions.size} regions`);
}
fs.writeFileSync(path.join(temporary, 'packing-input.json'), JSON.stringify(packing));
const packedFile = path.join(temporary, 'packing-result.json');
const packed = spawnSync('python', [path.join(projectRoot, 'scripts/pack-spine-regions.py'), path.join(temporary, 'packing-input.json'), packedFile], { encoding: 'utf8', windowsHide: true });
assert.equal(packed.status, 0, packed.stderr);
const packedResult = json(packedFile);
for (const asset of manifest.assets) {
  const pack = packedResult.assets.find((item) => item.id === asset.id);
  asset.atlasSize = pack.atlasSize;
  const directory = path.join(destination, asset.folder);
  assert.deepEqual(fs.readdirSync(directory).sort(), [asset.name + '.atlas', asset.name + '.json', asset.name + '.png'].sort());
  asset.files = fs.readdirSync(directory).sort().map((file) => ({ file, bytes: fs.statSync(path.join(directory, file)).size, sha256: sha256(path.join(directory, file)) }));
}
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(reports, 'texture-packing.json'), JSON.stringify(packedResult, null, 2) + '\n');
fs.cpSync(path.join(projectRoot, 'scripts/player-extracted-web'), path.join(destination, 'web'), { recursive: true });
const runtimeDirectory = path.join(destination, 'web/runtime');
fs.mkdirSync(runtimeDirectory, { recursive: true });
fs.copyFileSync(path.join(projectRoot, 'node_modules/spine-player-4-0/dist/iife/spine-player.js'), path.join(runtimeDirectory, 'spine-player.js'));
fs.copyFileSync(path.join(projectRoot, 'node_modules/spine-player-4-0/dist/spine-player.css'), path.join(runtimeDirectory, 'spine-player.css'));
fs.copyFileSync(path.join(projectRoot, 'public/licenses/spine-4.0.txt'), path.join(runtimeDirectory, 'LICENSE.txt'));
if (fs.existsSync(path.join(projectRoot, 'docs/PLAYER_EXTRACTED.md'))) {
  const readme = fs.readFileSync(path.join(projectRoot, 'docs/PLAYER_EXTRACTED.md'), 'utf8').split('<!-- ENGINEERING_RECORDS -->')[0].replaceAll('../asserts/player-extracted/', './');
  fs.writeFileSync(path.join(destination, 'README.md'), readme);
}
console.log('Extracted 17 self-contained assets.');
