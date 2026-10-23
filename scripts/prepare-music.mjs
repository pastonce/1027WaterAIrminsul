import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const binaries = path.join(root, '.asset-work/audio-tools/imageio_ffmpeg/binaries');
const encoder = process.env.FFMPEG_PATH ?? (existsSync(binaries) ? path.join(binaries, readdirSync(binaries).find((file) => file.endsWith('.exe')) ?? 'ffmpeg') : 'ffmpeg');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const run = (args, acceptFailure = false) => {
  const result = spawnSync(encoder, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0 && !acceptFailure) throw new Error(result.error?.message ?? result.stderr);
  return result.stderr;
};
const manifest = { version: 1, encoder: spawnSync(encoder, ['-version'], { encoding: 'utf8', windowsHide: true }).stdout?.split('\n')[0], format: 'AAC-LC', bitrate: 192000, sampleRate: 48000, channels: 2, sourceBytes: 0, publishedBytes: 0, files: [] };
const tracks = {};
const outputDirectory = path.join(root, 'public/asserts/music');
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(path.join(root, '.asset-work/music'), { recursive: true });
for (const stage of ['A', 'B', 'C', 'D', 'E', 'F']) {
  const source = path.join(root, `asserts/bgm/${stage}.mp3`);
  const input = readFileSync(source);
  const info = run(['-i', source], true);
  const durationMatch = /Duration: (\d+):(\d+):(\d+\.\d+)/u.exec(info);
  if (!durationMatch || !/48000 Hz, stereo/u.test(info)) throw new Error(`Unexpected source audio: ${stage}`);
  const duration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
  const temporary = path.join(root, `.asset-work/music/${stage}.m4a`);
  run(['-y', '-i', source, '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', temporary]);
  run(['-v', 'error', '-i', temporary, '-f', 'null', '-']);
  const bytes = readFileSync(temporary);
  if (bytes.length >= input.length * 0.8) throw new Error(`Insufficient compression: ${stage}`);
  const filename = `${stage.toLowerCase()}-${hash(bytes).slice(0, 12)}.m4a`;
  const target = path.join(outputDirectory, filename);
  writeFileSync(target, bytes);
  tracks[stage] = { src: `/asserts/music/${filename}`, type: 'audio/mp4; codecs="mp4a.40.2"', duration };
  manifest.files.push({ stage, source: relative(source), sourceSha256: hash(input), sourceBytes: input.length, file: relative(target), sha256: hash(bytes), bytes: bytes.length, duration });
  manifest.sourceBytes += input.length; manifest.publishedBytes += bytes.length;
  console.log(`${stage}: ${input.length} -> ${bytes.length} B (${duration}s)`);
}
const button = readFileSync(path.join(root, 'asserts/bgm/button.png'));
const buttonName = `music-button-${hash(button).slice(0, 12)}.png`;
const buttonTarget = path.join(root, 'public/asserts/ui', buttonName);
mkdirSync(path.dirname(buttonTarget), { recursive: true }); writeFileSync(buttonTarget, button);
manifest.button = { source: 'asserts/bgm/button.png', file: relative(buttonTarget), bytes: button.length, sha256: hash(button) };
writeFileSync(path.join(root, 'src/data/music.generated.json'), JSON.stringify({ button: `/asserts/ui/${buttonName}`, tracks }, null, 2) + '\n');
writeFileSync(path.join(root, 'docs/music-assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ sourceBytes: manifest.sourceBytes, publishedBytes: manifest.publishedBytes, reduction: 1 - manifest.publishedBytes / manifest.sourceBytes }, null, 2));
