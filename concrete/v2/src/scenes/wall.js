import * as THREE from 'three';
import { NOISE } from '../glsl.js';

// 打ちっぱなしのコンクリート壁。型枠の継ぎ目・Pコンの穴・気泡・雨だれ。
// 文字は「壁に彫られている」：高さマップとして凹ませ、横からの光（レーキングライト）で浮かび上がらせる。
// ひび（uCrack）は衝撃点から放射状に走り、枝分かれする。
const frag = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform float uTime, uLight, uLightY, uLightZ, uFall, uZoom, uCrack, uShade, uWarm, uTitleDepth;
uniform vec2 uPan, uCrackAt; uniform sampler2D uTitle; uniform float uTitleOn;
varying vec2 vUv;
${NOISE}
// 壁座標（1単位 = 型枠1枚の幅 900mm）
// Pコン穴：実物は直径30mm前後の円錐形のくぼみ。横450mm × 縦600mm 間隔
const vec2 PC = vec2(0.5, 0.667);
float pconHole(vec2 p){
  vec2 q = mod(p + PC * 0.5, PC) - PC * 0.5;
  float d = length(q);
  return smoothstep(0.024, 0.014, d) + smoothstep(0.034, 0.022, d) * 0.35;
}
float joints(vec2 p){
  vec2 panel = vec2(1.0, 2.0); // 型枠 900 × 1800。継ぎ目は目立たせない
  vec2 q = abs(fract(p / panel + 0.5) - 0.5) * panel;
  return smoothstep(0.005, 0.0, min(q.x, q.y));
}
// ひび：衝撃点から放射状に走る数本の太いひび＋枝分かれ。先へ行くほど細い
float crackLine(vec2 cp, float a0, float len, float seed, float w0){
  float r = length(cp);
  if (r > len) return 0.0;
  float a = atan(cp.y, cp.x);
  float wob = (vnoise(vec2(r * 4.0, seed)) - 0.5) * 0.8 + (vnoise(vec2(r * 18.0, seed + 1.0)) - 0.5) * 0.3 + (vnoise(vec2(r * 70.0, seed + 3.0)) - 0.5) * 0.12 / max(r * 6.0, 0.4);
  float da = a - (a0 + wob);
  da = mod(da + 3.14159, 6.28318) - 3.14159;
  float d = abs(da) < 1.5 ? abs(sin(da)) * r : 1.0; // 反対側（後ろ向き）は対象外
  float w = w0 * pow(1.0 - r / len, 1.5) + 0.0006;
  return smoothstep(w, w * 0.15, d);
}
float cracks(vec2 cp, float k){
  float c = 0.0;
  for (int i = 0; i < 11; i++) {
    float fi = float(i);
    float a0 = fi / 11.0 * 6.28318 + (hash12(vec2(fi, 1.7)) - 0.5) * 0.5;
    float len = (0.35 + pow(hash12(vec2(fi, 4.2)), 2.0) * 1.3) * k;
    c = max(c, crackLine(cp, a0, len, fi * 13.1, 0.0045));
  }
  // 衝撃点のまわりは細かく砕ける
  float r = length(cp);
  vec3 v = voronoi(cp * 60.0);
  c = max(c, smoothstep(0.04, 0.0, v.y) * smoothstep(0.06 * k, 0.02 * k, r));
  return c;
}
float titleH(vec2 uv){
  if (uTitleOn < 0.5) return 0.0;
  // 文字は描くときにぼかしてある（彫りの縁がなめらかな斜面になる）
  return texture2D(uTitle, uv).r;
}
float height(vec2 p, vec2 uv){
  float h = fbm(p * 6.0) * 0.06 + fbm(p * 40.0) * 0.015;
  h -= pconHole(p) * 0.12;
  h -= joints(p) * 0.015;
  // 気泡（あばた）
  vec3 v = voronoi(p * 38.0);
  h -= smoothstep(0.12, 0.05, v.x) * step(0.82, v.z) * 0.06;
  h -= titleH(uv) * uTitleDepth;
  return h;
}
void main(){
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.2 / uZoom + uPan;
  float e = 0.0015 / uZoom;
  vec2 duv = vec2(1.0 / uRes.x, 0.0) * 1.5;
  float h = height(p, uv);
  float hx = height(p + vec2(e, 0.0), uv + duv);
  float hy = height(p + vec2(0.0, e), uv + duv.yx * aspect);
  vec3 n = normalize(vec3(-(hx - h) / e * 0.35, -(hy - h) / e * 0.35, 1.0));
  // 光：画面の外から横に掠めるように当たる。uLight で左から右へ動く
  vec3 lp = vec3((uLight * 2.0 - 1.0) * aspect * 1.6, uLightY, uLightZ);
  vec3 sp = vec3((uv - 0.5) * vec2(aspect, 1.0) * 2.0, h);
  vec3 L = normalize(lp - sp);
  float dist = length(lp.xy - sp.xy);
  float diff = max(dot(n, L), 0.0);
  float fall = 1.0 / (1.0 + dist * dist * uFall);
  // 色：灰色のムラ、雨だれ（Pコンから下に伸びる筋）
  float tone = 0.62 + (fbm(p * 1.7) - 0.5) * 0.18 + (fbm(p * 9.0) - 0.5) * 0.06;
  vec2 cell = vec2(1.0, 0.5);
  vec2 q = mod(p + cell * 0.5, cell) - cell * 0.5;
  float streak = smoothstep(0.03, 0.0, abs(q.x + (vnoise(vec2(p.y * 8.0, 1.0)) - 0.5) * 0.02)) * smoothstep(0.0, -0.22, q.y) * 0.18 * vnoise(p * vec2(30.0, 3.0));
  tone -= streak;
  vec3 base = vec3(tone) * vec3(1.0, 0.985, 0.95);
  base *= 1.0 - pconHole(p) * 0.6;
  float carve = titleH(uv);
  vec3 col = base * (0.07 + diff * fall * 2.1);
  col *= 1.0 - carve * 0.45; // 彫りの底は光が届きにくい
  col += base * vec3(1.0, 0.9, 0.75) * pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 18.0) * 0.12 * fall;
  // ひび
  if (uCrack > 0.0) {
    vec2 cp = (uv - uCrackAt) * vec2(aspect, 1.0);
    float c = cracks(cp, uCrack * 1.6);
    col = mix(col, vec3(0.015), c);
  }
  col = mix(col, col * vec3(1.08, 0.96, 0.85), uWarm);
  col *= 1.0 - uShade;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createWall() {
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 1920;
  titleCanvas.height = 1080;
  const titleTex = new THREE.CanvasTexture(titleCanvas);
  const uniforms = {
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uTime: { value: 0 }, uLight: { value: 0.5 }, uLightY: { value: 0.4 }, uZoom: { value: 1 }, uPan: { value: new THREE.Vector2() },
    uCrack: { value: 0 }, uCrackAt: { value: new THREE.Vector2(0.5, 0.5) }, uShade: { value: 0 }, uWarm: { value: 0 },
    uTitle: { value: titleTex }, uTitleOn: { value: 0 }, uTitleDepth: { value: 0.06 }, uLightZ: { value: 0.8 }, uFall: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new THREE.Camera();
  let lastTitle = null;

  // 彫る文字を描く（白 = 深く彫る）
  function setTitle(t) {
    const key = JSON.stringify(t ?? null);
    if (key === lastTitle) return;
    lastTitle = key;
    const g = titleCanvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1920, 1080);
    if (t) {
      const sharp = document.createElement('canvas');
      sharp.width = 1920;
      sharp.height = 1080;
      const sg = sharp.getContext('2d');
      sg.fillStyle = '#fff';
      sg.textBaseline = 'alphabetic';
      for (const line of t.lines) {
        sg.font = `${line.weight ?? 900} ${line.size}px ${line.font ?? '"Noto Sans JP Variable", sans-serif'}`;
        sg.textAlign = line.align ?? 'left';
        sg.fillText(line.text, line.x, line.y);
      }
      g.filter = 'blur(5px)';
      g.drawImage(sharp, 0, 0);
      g.filter = 'none';
    }
    titleTex.needsUpdate = true;
    uniforms.uTitleOn.value = t ? 1 : 0;
  }

  return {
    render(renderer, target, s) {
      const p = s.p;
      setTitle(p.title);
      uniforms.uTime.value = s.t;
      uniforms.uLight.value = p.light ?? 0.5;
      uniforms.uLightY.value = p.lightY ?? 0.4;
      uniforms.uLightZ.value = p.lightZ ?? 0.8;
      uniforms.uFall.value = p.fall ?? 0.5;
      uniforms.uZoom.value = p.zoom ?? 1;
      uniforms.uPan.value.set(p.panX ?? 0, p.panY ?? 0);
      uniforms.uCrack.value = p.crack ?? 0;
      uniforms.uCrackAt.value.set(p.crackX ?? 0.5, p.crackY ?? 0.5);
      uniforms.uShade.value = p.shade ?? 0;
      uniforms.uWarm.value = p.warm ?? 0;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    },
  };
}
