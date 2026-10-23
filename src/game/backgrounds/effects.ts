import type { GLTexture, SceneRenderer, Shader } from 'spine-player-4-0';
import type { BackgroundPlane } from '../../data/backgrounds';

export type BackgroundEffect = 'sand' | 'red-flow' | 'mist';

const vertexShader = `
attribute vec2 a_position;
attribute vec4 a_color;
attribute vec4 a_color2;
attribute vec2 a_texCoords;
uniform mat4 u_projTrans;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  v_uv = vec2(a_texCoords.x, 1.0 - a_texCoords.y);
  v_color = a_color + a_color2;
  gl_Position = u_projTrans * vec4(a_position, 0.0, 1.0);
}`;

const fragmentHeader = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_opacity;
varying vec2 v_uv;
varying vec4 v_color;
vec4 diffuse(vec2 uv) {
  return texture2D(u_texture, vec2(uv.x, 1.0 - uv.y));
}
`;

export const BACKGROUND_FRAGMENT_SHADERS: Record<BackgroundEffect, string> = {
  sand: `${fragmentHeader}
uniform float u_speed;
void main() {
  vec4 color = diffuse(vec2(fract(v_uv.x - u_time * u_speed), v_uv.y));
  vec2 edges = 1.0 - smoothstep(vec2(0.4), vec2(0.5), abs(v_uv - 0.5));
  gl_FragColor = vec4(color.rgb, color.a * edges.x * edges.y * u_opacity) * v_color;
}`,
  'red-flow': `${fragmentHeader}
uniform sampler2D u_noise;
uniform float u_range;
void main() {
  vec4 flow = texture2D(u_noise, vec2(v_uv.x, 1.0 - v_uv.y));
  vec2 direction = (flow.rg - 0.5) * -0.2 * u_range;
  float phase = flow.b + u_time * 0.3;
  float first = fract(phase);
  vec4 color = mix(diffuse(v_uv + direction * first), diffuse(v_uv + direction * fract(phase + 0.5)), abs(first - 0.5) * 2.0);
  vec3 straight = min(vec3(1.0), color.rgb / max(color.a, 0.001));
  gl_FragColor = vec4(straight, color.a * u_opacity) * v_color;
}`,
  mist: `${fragmentHeader}
uniform sampler2D u_noise;
uniform float u_speed;
void main() {
  vec2 uv = fract(v_uv + u_time * u_speed * vec2(0.6, 0.2));
  vec2 flow = texture2D(u_noise, vec2(uv.x, 1.0 - uv.y)).rg;
  vec4 color = diffuse(v_uv + flow * 0.015);
  gl_FragColor = vec4(color.rgb, color.a * u_opacity) * v_color;
}`,
};

export function backgroundQuad(plane: Pick<BackgroundPlane, 'horizontal' | 'vertical' | 'width' | 'height' | 'rotation' | 'tilt' | 'depth'>) {
  const vertices = new Float32Array(48);
  const cosine = Math.cos(plane.rotation ?? 0); const sine = Math.sin(plane.rotation ?? 0);
  const tilt = plane.tilt ?? 0;
  for (const [index, corner] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
    const horizontal = corner[0] * plane.width / 2;
    const vertical = corner[1] * plane.height / 2;
    const tilted = vertical * Math.cos(tilt);
    const perspective = 1920 / (1920 - (plane.depth ?? 0) - vertical * Math.sin(tilt));
    vertices.set([
      (plane.horizontal + horizontal * cosine - tilted * sine) * perspective,
      (plane.vertical + horizontal * sine + tilted * cosine) * perspective,
      1, 1, 1, 1, (corner[0] + 1) / 2, (1 - corner[1]) / 2, 0, 0, 0, 0,
    ], index * 12);
  }
  return vertices;
}

export function sunlightOpacity(time: number, opacity: number, range: number) {
  return opacity + Math.sin(time) * Math.sin(time * 3) * range;
}

export function backgroundEffectTime(effect: BackgroundEffect, time: number, speed = 0.2) {
  if (effect !== 'red-flow' && speed === 0) return 0;
  const period = effect === 'red-flow' ? 10 / 3 : (effect === 'mist' ? 5 : 1) / Math.abs(speed);
  return Math.max(0, time) % period;
}

export class BackgroundEffects {
  private readonly shaders = new Map<BackgroundEffect, Shader>();
  private readonly indices = [0, 1, 2, 2, 3, 0];

  constructor(private readonly graphics: WebGLRenderingContext, ShaderType: typeof Shader, effects: BackgroundEffect[]) {
    try {
      for (const effect of new Set(effects)) this.shaders.set(effect, new ShaderType(graphics, vertexShader, BACKGROUND_FRAGMENT_SHADERS[effect]));
    } catch (error) { this.dispose(); throw error; }
  }

  draw(renderer: SceneRenderer, plane: BackgroundPlane, texture: GLTexture, noise: GLTexture | undefined, vertices: Float32Array, time: number) {
    const shader = this.shaders.get(plane.effect as BackgroundEffect)!;
    renderer.end();
    shader.bind();
    shader.setUniform4x4f('u_projTrans', renderer.camera.projectionView.values);
    shader.setUniformi('u_texture', 0);
    shader.setUniformf('u_time', backgroundEffectTime(plane.effect as BackgroundEffect, time, plane.speed));
    shader.setUniformf('u_opacity', plane.opacity ?? 1);
    if (plane.effect === 'red-flow' || plane.effect === 'mist') {
      if (!noise) throw new Error('background-flow-map');
      shader.setUniformi('u_noise', 1); noise.bind(1);
      this.graphics.activeTexture(this.graphics.TEXTURE0);
    }
    if (plane.effect === 'red-flow') shader.setUniformf('u_range', plane.range ?? 0.56);
    else shader.setUniformf('u_speed', plane.speed ?? 0.2);
    renderer.batcher.begin(shader);
    renderer.batcher.draw(texture, vertices, this.indices);
    renderer.batcher.end();
    renderer.begin();
  }

  dispose() {
    this.shaders.forEach((shader) => shader.dispose()); this.shaders.clear();
  }
}
