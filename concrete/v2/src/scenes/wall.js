import * as THREE from 'three';
import { NOISE } from '../glsl.js';

// 打ちっぱなしのコンクリート壁。型枠の継ぎ目・Pコンの穴・気泡・雨だれ。
// 文字は「壁に彫られている」：高さマップとして凹ませ、横からの光（レーキングライト）で浮かび上がらせる。
// ひび（uCrack）は中心からボロノイの境界に沿って走る。
const frag = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform float uTime, uLight, uLightY, uLightZ, uZoom, uCrack, uShade, uWarm, uTitleDepth;
uniform vec2 uPan, uCrackAt; uniform sampler2D uTitle; uniform float uTitleOn;
varying vec2 vUv;
${NOISE}
// 壁座標（1単位 = 型枠1枚の幅 900mm）
float pconHole(vec2 p){
  vec2 cell = vec2(1.0, 0.5); // 横900mm × 縦450mm 間隔
  vec2 q = mod(p + cell * 0.5, cell) - cell * 0.5;
  float d = length(q);
  return smoothstep(0.052, 0.040, d) * 0.9 + smoothstep(0.075, 0.055, d) * 0.15;
}
float joints(vec2 p){
  vec2 panel = vec2(1.0, 2.0); // 900 × 1800
  vec2 q = abs(fract(p / panel + 0.5) - 0.5) * panel;
  return smoothstep(0.012, 0.0, min(q.x, q.y));
}
float titleH(vec2 uv){
  if (uTitleOn < 0.5) return 0.0;
  // ぼかして彫りの縁をなだらかに
  // 9点でぼかして、彫りの縁を斜面にする（面取りされた彫り）
  float s = 0.0; vec2 px = 5.0 / uRes;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) s += texture2D(uTitle, uv + vec2(float(i), float(j)) * px).r;
  return s / 9.0;
}
float height(vec2 p, vec2 uv){
  float h = fbm(p * 6.0) * 0.06 + fbm(p * 40.0) * 0.015;
  h -= pconHole(p) * 0.25;
  h -= joints(p) * 0.05;
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
  float fall = 1.0 / (1.0 + dist * dist * 0.22);
  // 色：灰色のムラ、雨だれ（Pコンから下に伸びる筋）
  float tone = 0.62 + (fbm(p * 1.7) - 0.5) * 0.18 + (fbm(p * 9.0) - 0.5) * 0.06;
  vec2 cell = vec2(1.0, 0.5);
  vec2 q = mod(p + cell * 0.5, cell) - cell * 0.5;
  float streak = smoothstep(0.03, 0.0, abs(q.x + (vnoise(vec2(p.y * 8.0, 1.0)) - 0.5) * 0.02)) * smoothstep(0.0, -0.22, q.y) * 0.18 * vnoise(p * vec2(30.0, 3.0));
  tone -= streak;
  vec3 base = vec3(tone) * vec3(1.0, 0.985, 0.95);
  base *= 1.0 - pconHole(p) * 0.55;
  float carve = titleH(uv);
  vec3 col = base * (0.16 + diff * fall * 1.55);
  col *= 1.0 - carve * 0.38; // 彫りの底は光が届きにくい
  col += base * vec3(1.0, 0.9, 0.75) * pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 18.0) * 0.12 * fall;
  // ひび
  if (uCrack > 0.0) {
    vec2 cp = (uv - uCrackAt) * vec2(aspect, 1.0);
    float r = length(cp);
    vec3 v = voronoi(cp * 5.0 + fbm(cp * 8.0) * 0.6);
    float edge = smoothstep(0.025, 0.0, v.y) * smoothstep(uCrack * 1.6, uCrack * 1.6 - 0.25, r);
    vec3 v2 = voronoi(cp * 14.0 + 3.0);
    edge = max(edge, smoothstep(0.02, 0.0, v2.y) * smoothstep(uCrack * 0.8, uCrack * 0.8 - 0.2, r) * 0.8);
    col = mix(col, vec3(0.02), edge);
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
    uTitle: { value: titleTex }, uTitleOn: { value: 0 }, uTitleDepth: { value: 0.05 }, uLightZ: { value: 0.8 },
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
      g.fillStyle = '#fff';
      g.textBaseline = 'alphabetic';
      for (const line of t.lines) {
        g.font = `${line.weight ?? 900} ${line.size}px ${line.font ?? '"Noto Sans JP Variable", sans-serif'}`;
        g.textAlign = line.align ?? 'left';
        g.fillText(line.text, line.x, line.y);
      }
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
      uniforms.uZoom.value = p.zoom ?? 1;
      uniforms.uPan.value.set(p.panX ?? 0, p.panY ?? 0);
      uniforms.uCrack.value = p.crack ?? 0;
      uniforms.uShade.value = p.shade ?? 0;
      uniforms.uWarm.value = p.warm ?? 0;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    },
  };
}
