import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const binaries = path.join(root, '.asset-work/audio-tools/imageio_ffmpeg/binaries');
const encoder = process.env.FFMPEG_PATH ?? (existsSync(binaries) ? path.join(binaries, readdirSync(binaries).find((file) => file.endsWith('.exe')) ?? 'ffmpeg') : 'ffmpeg');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (args) => {
  const result = spawnSync(encoder, ['-hide_banner', ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return result.stderr;
};
const definitions = [
  { id: 'dew', source: 'water-drop-01.wav', duration: 0.347, gainDb: -4, fade: 0.045, author: 'Jan Schupke / Vehicle', license: 'CC0-1.0', page: 'https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx', download: 'https://opengameart.org/sites/default/files/tinysized.zip', member: 'sfx-cc0/water-drop-01.wav' },
  { id: 'water', source: 'water-pour-01.wav', duration: 1.61, gainDb: 2, fade: 0.18, author: 'Jan Schupke / Vehicle', license: 'CC0-1.0', page: 'https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx', download: 'https://opengameart.org/sites/default/files/tinysized.zip', member: 'sfx-cc0/water-pour-01.wav' },
  { id: 'rustle', source: 'moving-leaves-stereo.ogg', duration: 1.05, gainDb: 5, fade: 0.16, author: 'Augmentality / Brandon Morris (submitted by HaelDB)', license: 'CC0-1.0', page: 'https://opengameart.org/content/random-sounds-samples', download: 'https://opengameart.org/sites/default/files/moving%20leaves%20stereo.ogg' },
  { id: 'jump', source: 'qubodup-cfork-ccby3-jump.flac', duration: 0.388, gainDb: -9, fade: 0.04, author: 'cfork; Iwan Gabovitch / qubodup', license: 'CC-BY-3.0', page: 'https://opengameart.org/content/cute-cartoon-jump-sound-effect', download: 'https://opengameart.org/sites/default/files/qubodup-cfork-ccby3-jump.flac' },
  { id: 'transition', source: 'genshin-teleport.mp3', duration: 3.24, gainDb: 5, fade: 0.22, author: 'Genshin Impact / HoYoverse; uploaded by malakai1', license: 'All rights reserved; no separate redistribution license supplied', page: 'https://www.myinstants.com/en/instant/genshin-teleport-81406/', download: 'https://www.myinstants.com/media/sounds/genshin-teleport.mp3' },
];
const output = path.join(root, 'public/asserts/sfx');
const temporary = path.join(root, '.asset-work/sfx');
mkdirSync(output, { recursive: true }); mkdirSync(temporary, { recursive: true });
const manifest = { version: 1, encoder: spawnSync(encoder, ['-version'], { encoding: 'utf8', windowsHide: true }).stdout.split('\n')[0], format: 'AAC-LC', container: 'MP4', transport: 'application/json; base64 audio payload', bitrate: 96000, sampleRate: 48000, channels: 1, files: [], sourceBytes: 0, audioBytes: 0, publishedBytes: 0 };
const assets = {};
for (const definition of definitions) {
  const source = `asserts/reference-supplements/sfx/${definition.source}`;
  const input = readFileSync(path.join(root, source));
  const filter = `atrim=duration=${definition.duration},asetpts=PTS-STARTPTS,highpass=f=90,lowpass=f=7500,volume=${definition.gainDb}dB,alimiter=limit=0.63:level=0:latency=1,volume=-4dB,afade=t=in:d=0.008,afade=t=out:st=${(definition.duration - definition.fade).toFixed(3)}:d=${definition.fade}`;
  const target = path.join(temporary, `${definition.id}.m4a`);
  run(['-y', '-i', path.join(root, source), '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-af', filter, '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '96k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart', target]);
  const stats = run(['-i', target, '-af', 'volumedetect', '-f', 'null', '-']);
  const bytes = readFileSync(target);
  const peakDb = Number(/max_volume: ([-\d.]+)/u.exec(stats)?.[1]);
  if (!Number.isFinite(peakDb) || peakDb > -4) throw new Error(`Insufficient audio headroom: ${definition.id}`);
  const payload = Buffer.from(JSON.stringify({ version: 1, audio: bytes.toString('base64') }) + '\n');
  const filename = `${definition.id}-${hash(payload).slice(0, 12)}.json`;
  writeFileSync(path.join(output, filename), payload);
  assets[definition.id] = { src: `/asserts/sfx/${filename}`, duration: definition.duration };
  manifest.files.push({ ...definition, source, sourceSha256: hash(input), sourceBytes: input.length, file: `public/asserts/sfx/${filename}`, sha256: hash(payload), bytes: payload.length, audioSha256: hash(bytes), audioBytes: bytes.length, filter, meanDb: Number(/mean_volume: ([-\d.]+)/u.exec(stats)?.[1]), peakDb });
  manifest.sourceBytes += input.length; manifest.audioBytes += bytes.length; manifest.publishedBytes += payload.length;
  console.log(`${definition.id}: ${payload.length} B (${bytes.length} B audio), ${definition.duration}s`);
}
writeFileSync(path.join(root, 'src/data/sounds.generated.json'), JSON.stringify(assets, null, 2) + '\n');
writeFileSync(path.join(root, 'docs/sfx-assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(path.join(output, 'CREDITS.txt'), readFileSync(path.join(root, 'asserts/reference-supplements/sfx/CREDITS.txt')));
console.log(`Published ${manifest.publishedBytes} B; original files retained (${manifest.sourceBytes} B).`);
