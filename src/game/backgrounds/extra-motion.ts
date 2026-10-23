import type { Bone, Skeleton } from 'spine-player-4-0';

interface MotionConfig { mode: number; [key: string]: string | number | undefined }
export interface ExtraMotionSource {
  extra?: Record<string, { rootBoneName: string; endBoneName?: string; animation: Record<string, MotionConfig> }>;
  extraConfig?: { timeScale?: number };
}
interface BonePose { x: number; y: number; rotation: number; scaleX: number; scaleY: number }
interface SpringTip { x: number; y: number; speedX: number; speedY: number; rotation: number }
interface MotionBinding { config: MotionConfig; bones: Array<{ bone: Bone; depth: number }>; seed: number }

function setting(config: MotionConfig, key: string, fallback: number) {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function motionWave(period: number, amplitude: number, octaves: number, time: number, delay: number) {
  const count = Math.max(0, Math.min(8, Math.floor(octaves))) + 1;
  const frequency = 1 / (2 - 1 / 2 ** (count - 1));
  let value = 0; let weight = 0;
  for (let index = 0; index < count; index++) {
    const strength = 0.5 ** index;
    value += strength * Math.sin(time * frequency * 2 ** index * Math.PI * 2 / Math.max(0.001, period) + delay);
    weight += strength;
  }
  return value / weight * amplitude;
}

function nameSeed(name: string) {
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % 10000;
}

export class BackgroundExtraMotion {
  private time = 0;
  private readonly bindings: MotionBinding[] = [];
  private readonly poses = new Map<Bone, BonePose>();
  private readonly springs = new Map<Bone, SpringTip>();
  private readonly timeScale: number;

  constructor(private readonly skeleton: Skeleton, source: ExtraMotionSource, animation: string) {
    this.timeScale = Math.max(0, source.extraConfig?.timeScale ?? 1);
    for (const entry of Object.values(source.extra ?? {})) {
      const root = skeleton.findBone(entry.rootBoneName);
      const config = entry.animation[animation] ?? entry.animation.default;
      if (!root || !config || ![1, 3, 4].includes(config.mode)) continue;
      const bones: MotionBinding['bones'] = [];
      const visit = (bone: Bone, depth: number) => {
        if (bone.data.name === entry.endBoneName) return;
        bones.push({ bone, depth });
        if (config.mode !== 3) bone.children.forEach((child) => visit(child, depth + 1));
      };
      visit(root, 0);
      this.bindings.push({ config, bones, seed: setting(config, 'moveXSeed', nameSeed(entry.rootBoneName)) });
    }
  }

  get count() { return this.bindings.length; }

  restore() {
    this.poses.forEach((pose, bone) => Object.assign(bone, pose));
    this.poses.clear();
  }

  apply(delta: number) {
    const elapsed = Math.max(0, Math.min(0.1, delta)) * this.timeScale;
    this.time += elapsed;
    for (const binding of this.bindings) {
      if (binding.config.mode === 4) continue;
      for (const { bone, depth } of binding.bones) {
        this.capture(bone);
        if (binding.config.mode === 1) this.sway(bone, depth, binding.config);
        else this.drift(bone, binding);
      }
    }
    this.skeleton.updateWorldTransform();
    for (const binding of this.bindings) {
      if (binding.config.mode !== 4) continue;
      for (const { bone, depth } of binding.bones) {
        this.capture(bone);
        this.follow(bone, depth, binding.config, elapsed);
      }
    }
    this.skeleton.updateWorldTransform();
  }

  private capture(bone: Bone) {
    if (!this.poses.has(bone)) this.poses.set(bone, { x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: bone.scaleX, scaleY: bone.scaleY });
  }

  private sway(bone: Bone, depth: number, config: MotionConfig) {
    const springLevel = setting(config, 'springLevel', 0);
    const oscillation = (prefix: string, defaults: { period: number; range: number; offset: string; child: string; spring: string; influence: string }) => {
      const phase = this.time + setting(config, defaults.offset, 0) - (setting(config, defaults.child, 0.25) * depth) ** (1 + setting(config, defaults.spring, 0));
      const strength = (1 + depth * setting(config, defaults.influence, 0.1)) ** (1 + springLevel);
      return Math.sin(phase * Math.PI * 2 / Math.max(0.001, setting(config, `${prefix}Time`, defaults.period))) * setting(config, `${prefix}Range`, defaults.range) * strength + setting(config, `${prefix}Center`, 0);
    };
    bone.rotation = bone.data.rotation + oscillation('rotate', { period: 2, range: 10, offset: 'rotateOffset', child: 'childOffset', spring: 'spring', influence: 'affectByLevel' });
    for (const axis of ['X', 'Y'] as const) {
      const prefix = `scale${axis}`;
      if (!setting(config, `${prefix}Range`, 0)) continue;
      bone[`scale${axis}`] = bone.data[`scale${axis}`] + oscillation(prefix, { period: 2, range: 0, offset: `${prefix}Offset`, child: `${prefix}ChildOffset`, spring: `${prefix}Spring`, influence: `${prefix}AffectByLevel` });
    }
  }

  private drift(bone: Bone, binding: MotionBinding) {
    const config = binding.config;
    const period = setting(config, 'moveXFreq', 1);
    const amplitude = setting(config, 'moveXAmp', 0);
    const octaves = setting(config, 'moveXOctaves', 0);
    const delay = setting(config, 'moveXDelay', 0);
    const center = setting(config, 'moveXCenter', 0);
    const horizontal = amplitude ? motionWave(period, amplitude, octaves, this.time, delay) + center : 0;
    const verticalPeriod = setting(config, 'moveYFreq', period);
    const verticalAmplitude = setting(config, 'moveYAmp', amplitude);
    const verticalOctaves = setting(config, 'moveYOctaves', octaves);
    const verticalDelay = setting(config, 'moveYDelay', delay);
    const verticalCenter = setting(config, 'moveYCenter', center);
    const same = period === verticalPeriod && amplitude === verticalAmplitude && octaves === verticalOctaves && delay === verticalDelay && center === verticalCenter;
    bone.x = bone.data.x + horizontal;
    bone.y = bone.data.y + (verticalAmplitude ? motionWave(verticalPeriod, verticalAmplitude, verticalOctaves, this.time, verticalDelay + (same ? binding.seed : 0)) + verticalCenter : 0);
  }

  private follow(bone: Bone, depth: number, config: MotionConfig, delta: number) {
    bone.updateWorldTransform();
    const child = bone.children[0];
    const localX = child?.x ?? (bone.data.length || 1);
    const localY = child?.y ?? 0;
    const targetX = bone.a * localX + bone.b * localY + bone.worldX;
    const targetY = bone.c * localX + bone.d * localY + bone.worldY;
    const previous = this.springs.get(bone);
    if (!previous) {
      this.springs.set(bone, { x: targetX, y: targetY, speedX: 0, speedY: 0, rotation: bone.rotation });
      return;
    }
    if (!delta) { bone.rotation = previous.rotation; bone.updateWorldTransform(); return; }
    const step = delta * 60;
    const strength = Math.min(1, setting(config, 'delay', 0.1) * (1 + depth * setting(config, 'affectByLevel', 0)) ** (1 + setting(config, 'springLevel', 0)) * step);
    const damping = Math.max(0, Math.min(0.99, setting(config, 'friction', 0.7))) ** step;
    previous.speedX = (previous.speedX + (targetX - previous.x) * strength) * damping;
    previous.speedY = (previous.speedY + (targetY - previous.y) * strength) * damping;
    previous.x += previous.speedX * step; previous.y += previous.speedY * step;
    const direction = Math.atan2(previous.y - bone.worldY, previous.x - bone.worldX) * 180 / Math.PI;
    const local = bone.worldToLocalRotation(direction) + (depth ? 0 : setting(config, 'rotateOffset', 0));
    const difference = ((local - bone.rotation + 540) % 360) - 180;
    const limit = Math.max(0, setting(config, 'limitRange', 80));
    const weight = 1 - Math.exp(-delta * 12 * (1 - Math.min(0.99, setting(config, 'speed', 0.1))));
    bone.rotation += Math.max(-limit, Math.min(limit, difference)) * weight;
    previous.rotation = bone.rotation;
    bone.updateWorldTransform();
  }
}
