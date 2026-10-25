import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = 'asserts/Tree of Wisdom/TreeofWisdom.skel';
const bytes = readFileSync(fileURLToPath(new URL(`../${source}`, import.meta.url)));
const skeleton = JSON.parse(bytes.toString('utf8'));
if (skeleton.skeleton.spine !== '4.2.38' || skeleton.bones.some((bone) => bone.parent && bone.parent !== 'root')) throw new Error('Unexpected wisdom tree skeleton');
if (['ik', 'transform', 'path', 'physics'].some((type) => skeleton[type]?.length) || skeleton.bones.some((bone) => bone.inherit && bone.inherit !== 'normal')) throw new Error('Unsupported wisdom tree constraints');
const attachments = skeleton.skins.find((skin) => skin.name === 'default').attachments;
const slots = skeleton.slots.filter((slot) => attachments[slot.name]);
const slotNames = new Set(slots.map((slot) => slot.name));
const boneNames = new Set(['root', ...slots.map((slot) => slot.bone)]);
const bones = skeleton.bones.filter((bone) => boneNames.has(bone.name));
for (const [slot, entries] of Object.entries(attachments)) for (const [name, attachment] of Object.entries(entries)) {
  if (!slotNames.has(slot) || !attachment.width || !attachment.height || attachment.type && attachment.type !== 'region' || attachment.path) throw new Error(`Unsupported attachment: ${slot}/${name}`);
}
const clips = Array.from({ length: 52 }, (_, step) => {
  const name = step ? `grow${step}` : 'start';
  const animation = skeleton.animations[name];
  if (!animation || Object.keys(animation).some((key) => !['bones', 'slots'].includes(key))) throw new Error(`Unsupported animation: ${name}`);
  const animationBones = Object.fromEntries(Object.entries(animation.bones ?? {}).filter(([bone]) => boneNames.has(bone)));
  const animationSlots = Object.fromEntries(Object.entries(animation.slots ?? {}).filter(([slot]) => slotNames.has(slot)));
  for (const [group, entries, allowed] of [['bones', animationBones, ['translate', 'rotate', 'scale', 'shear']], ['slots', animationSlots, ['attachment']]]) {
    for (const [entry, timelines] of Object.entries(entries)) for (const [type, keys] of Object.entries(timelines)) {
      if (!allowed.includes(type) || keys.some((key, index) => key.curve !== undefined && key.curve !== 'stepped' || index && (key.time ?? 0) < (keys[index - 1].time ?? 0))) throw new Error(`Unsupported timeline: ${name}/${group}/${entry}/${type}`);
      if (type === 'attachment' && keys.some((key) => key.name && !attachments[entry][key.name])) throw new Error(`Missing attachment: ${name}/${entry}`);
    }
  }
  const duration = Math.max(0, ...[animationBones, animationSlots].flatMap((entries) => Object.values(entries).flatMap((entry) => Object.values(entry).flatMap((keys) => keys.map((key) => key.time ?? 0)))));
  return { name, duration, bones: animationBones, slots: animationSlots };
});
const output = { version: 2, source, sha256: createHash('sha256').update(bytes).digest('hex'), spine: skeleton.skeleton.spine, space: { scale: .2, originX: 0, groundY: 500 }, bones, slots, attachments, clips };
writeFileSync(new URL('../src/data/treeGrowth.generated.json', import.meta.url), JSON.stringify(output) + '\n');
console.log(`Wisdom tree: ${bones.length} source bones, ${slots.length} ordered slots, ${clips.length} complete timelines; no endpoint substitution`);
