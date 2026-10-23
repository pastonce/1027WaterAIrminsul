import type { Shader } from 'spine-player-4-0';

const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const WEATHERED_FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_texture;
uniform float u_time;
uniform vec2 u_view;
uniform float u_transparent;
varying vec2 v_uv;
float hash(vec2 point) {
  vec3 value = fract(vec3(point.xyx) * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}
float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  vec2 weight = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), weight.x), mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), weight.x), weight.y);
}
vec2 sparks(vec2 point, float scale, float speed) {
  vec2 grid = point * vec2(2.3148, 1.0) * scale - vec2(0.0, u_time * speed);
  vec2 cell = floor(grid);
  float seed = hash(vec2(cell.x, mod(cell.y, 48.0)));
  vec2 center = vec2(0.25 + seed * 0.5, 0.5);
  vec2 distance = (fract(grid) - center) * vec2(1.0, 0.55);
  float glow = exp(-dot(distance, distance) * 280.0);
  float ember = glow * step(0.975, seed);
  float ash = (1.0 - smoothstep(0.025, 0.085, length(distance))) * step(seed, 0.02);
  return vec2(ember, ash);
}
void main() {
  vec2 point = (v_uv - 0.5) * u_view + 0.5;
  vec4 sampleColor = texture2D(u_texture, v_uv);
  float alpha = mix(1.0, sampleColor.a, u_transparent);
  vec3 source = sampleColor.rgb / max(alpha, 0.001);
  float luminance = dot(source, vec3(0.2126, 0.7152, 0.0722));
  float patina = noise(point * vec2(19.0, 8.0));
  float wear = noise(point * vec2(180.0, 78.0));
  vec3 cool = mix(vec3(0.035, 0.135, 0.16), vec3(0.67, 0.89, 0.87), pow(luminance, 1.05));
  cool += (source - luminance) * 0.16;
  vec3 copper = mix(vec3(0.19, 0.045, 0.025), vec3(1.0, 0.61, 0.22), luminance);
  float corrosion = smoothstep(0.015, 0.20, source.r - source.b) * (0.46 + patina * 0.48);
  float fire = exp(-length((point - vec2(0.82, 0.78)) * vec2(3.2, 2.6))) * 0.38;
  vec3 color = mix(cool, copper, clamp(corrosion + fire, 0.0, 0.94));
  color *= 0.93 + patina * 0.10;
  color += (wear - 0.5) * 0.027;
  float phase = u_time * 0.05235988;
  vec2 drift = vec2(sin(phase), cos(phase)) * 0.45;
  float smoke = noise(point * vec2(6.0, 3.0) + drift) * (1.0 - smoothstep(0.0, 0.65, point.y));
  color = mix(color, vec3(0.33, 0.17, 0.115), smoke * 0.23);
  float heat = (0.075 + sin(phase * 4.0) * 0.012) * exp(-length((point - vec2(0.50, 0.04)) * vec2(2.4, 4.0)));
  color += vec3(1.0, 0.32, 0.06) * heat;
  vec2 particles = sparks(point, 25.0, 0.4) + sparks(point + vec2(0.17, 0.23), 42.0, 0.8) * 0.65;
  color += vec3(1.0, 0.47, 0.11) * particles.x * 0.75;
  color *= 1.0 - particles.y * 0.32;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
}`;

export function treatmentTarget(width: number, height: number, maximum: number) {
  const scale = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export class BackgroundTreatment {
  private shader: Shader | null = null;
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private vertices: WebGLBuffer | null = null;
  private width = 0;
  private height = 0;

  constructor(private readonly graphics: WebGLRenderingContext, ShaderType: typeof Shader, private readonly maximum: number) {
    try {
      this.shader = new ShaderType(graphics, vertexShader, WEATHERED_FRAGMENT_SHADER);
      this.texture = graphics.createTexture();
      this.framebuffer = graphics.createFramebuffer();
      this.vertices = graphics.createBuffer();
      if (!this.texture || !this.framebuffer || !this.vertices) throw new Error('background-treatment-resources');
      graphics.bindBuffer(graphics.ARRAY_BUFFER, this.vertices);
      graphics.bufferData(graphics.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), graphics.STATIC_DRAW);
      graphics.bindBuffer(graphics.ARRAY_BUFFER, null);
      graphics.activeTexture(graphics.TEXTURE0); graphics.bindTexture(graphics.TEXTURE_2D, this.texture);
      graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_MIN_FILTER, graphics.LINEAR);
      graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_MAG_FILTER, graphics.LINEAR);
      graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_WRAP_S, graphics.CLAMP_TO_EDGE);
      graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_WRAP_T, graphics.CLAMP_TO_EDGE);
      graphics.bindTexture(graphics.TEXTURE_2D, null);
    } catch (error) { this.dispose(); throw error; }
  }

  get bytes() { return this.width * this.height * 4; }

  begin(width: number, height: number) {
    const graphics = this.graphics;
    const target = treatmentTarget(width, height, this.maximum);
    graphics.bindFramebuffer(graphics.FRAMEBUFFER, this.framebuffer);
    if (target.width !== this.width || target.height !== this.height) {
      graphics.activeTexture(graphics.TEXTURE0); graphics.bindTexture(graphics.TEXTURE_2D, this.texture);
      graphics.texImage2D(graphics.TEXTURE_2D, 0, graphics.RGBA, target.width, target.height, 0, graphics.RGBA, graphics.UNSIGNED_BYTE, null);
      graphics.framebufferTexture2D(graphics.FRAMEBUFFER, graphics.COLOR_ATTACHMENT0, graphics.TEXTURE_2D, this.texture, 0);
      graphics.bindTexture(graphics.TEXTURE_2D, null);
      if (graphics.checkFramebufferStatus(graphics.FRAMEBUFFER) !== graphics.FRAMEBUFFER_COMPLETE) {
        graphics.bindFramebuffer(graphics.FRAMEBUFFER, null);
        throw new Error('background-treatment-target');
      }
      this.width = target.width; this.height = target.height;
    }
    graphics.viewport(0, 0, target.width, target.height);
  }

  present(width: number, height: number, view: { width: number; height: number }, time: number, transparent = false) {
    const graphics = this.graphics;
    const shader = this.shader!;
    graphics.bindFramebuffer(graphics.FRAMEBUFFER, null);
    graphics.viewport(0, 0, width, height);
    if (transparent) { graphics.enable(graphics.BLEND); graphics.blendFunc(graphics.ONE, graphics.ONE_MINUS_SRC_ALPHA); } else graphics.disable(graphics.BLEND);
    shader.bind(); shader.setUniformi('u_texture', 0);
    shader.setUniformf('u_time', Math.max(0, time) % 120);
    shader.setUniform2f('u_view', view.width, view.height);
    shader.setUniformf('u_transparent', transparent ? 1 : 0);
    graphics.activeTexture(graphics.TEXTURE0); graphics.bindTexture(graphics.TEXTURE_2D, this.texture);
    graphics.bindBuffer(graphics.ARRAY_BUFFER, this.vertices);
    const position = shader.getAttributeLocation('a_position');
    graphics.enableVertexAttribArray(position);
    graphics.vertexAttribPointer(position, 2, graphics.FLOAT, false, 0, 0);
    graphics.drawArrays(graphics.TRIANGLE_STRIP, 0, 4);
    graphics.disableVertexAttribArray(position);
    graphics.bindBuffer(graphics.ARRAY_BUFFER, null); graphics.bindTexture(graphics.TEXTURE_2D, null);
    shader.unbind();
  }

  dispose() {
    const graphics = this.graphics;
    graphics.bindFramebuffer(graphics.FRAMEBUFFER, null);
    if (this.texture) graphics.deleteTexture(this.texture);
    if (this.framebuffer) graphics.deleteFramebuffer(this.framebuffer);
    if (this.vertices) graphics.deleteBuffer(this.vertices);
    this.shader?.dispose(); this.shader = null;
    this.texture = null; this.framebuffer = null; this.vertices = null;
    this.width = 0; this.height = 0;
  }
}
