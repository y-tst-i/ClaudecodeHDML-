import * as THREE from 'three';
import { NOISE } from '../glsl.js';

// コンクリートの立方体。中身は「3Dの模様」（どこで切っても同じ内部が見える）なので、
// 真っ二つに割ると、切り口に砂利・砂・気泡がそのまま現れる。外側の面は型枠で打った滑らかな肌。
const vert = /* glsl */ `
uniform vec3 uOffset; varying vec3 vP; varying vec3 vN; varying vec3 vW; varying vec3 vLocalN;
void main(){
  vP = position + uOffset;          // 割る前の立方体での座標
  vLocalN = normal;
  vN = normalize(normalMatrix * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const frag = /* glsl */ `
precision highp float;
uniform float uCutX, uFocusGravel, uFocusSand, uFocusPaste, uFocusAir, uDim;
uniform vec3 uLightDir, uCam;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying vec3 vLocalN;
${NOISE}
// 3D ボロノイ：F1 と F2 の差（セル境界までの近さ）を使うと、角ばった「砕石」の形になる
vec4 vor3(vec3 p){
  vec3 n = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; vec3 id = vec3(0);
  for (int k=-1;k<=1;k++) for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
    vec3 g = vec3(i,j,k); vec3 o = hash33(n+g); vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = n+g; } else if (d < d2) d2 = d;
  }
  return vec4(sqrt(d2) - sqrt(d1), hash13(id), hash13(id + 9.7), hash13(id + 4.3));
}
void main(){
  bool cut = abs(vLocalN.x) > 0.5 && abs(vP.x - uCutX) < 0.02;
  vec3 col;
  float kind = 0.0; // 0 paste 1 sand 2 gravel 3 air
  if (cut) {
    vec3 q = vP + (vec3(fbm3(vP * 2.0), fbm3(vP * 2.0 + 5.0), fbm3(vP * 2.0 + 9.0)) - 0.5) * 0.12;
    // 大きい砕石（20mm級）と中くらいの砕石（10mm級）
    vec4 big = vor3(q * 3.4);
    vec4 mid = vor3(q * 7.5 + 3.0);
    float gapB = 0.10 + big.y * 0.22;
    float stoneB = smoothstep(gapB, gapB + 0.02, big.x) * step(0.12, big.z);
    float stoneM = smoothstep(0.16, 0.18, mid.x) * step(0.45, mid.z) * (1.0 - stoneB);
    float stone = max(stoneB, stoneM);
    vec4 sid = stoneB > 0.5 ? big : mid;
    // 砂：細かい粒（ペーストの中に）
    vec4 sd = vor3(q * 34.0);
    float sand = smoothstep(0.10, 0.13, sd.x) * step(0.35, sd.z) * (1.0 - stone);
    // 気泡
    vec4 ar = vor3(q * 9.0 + 7.0);
    float air = step(0.985, ar.y) * smoothstep(0.30, 0.34, ar.x) * (1.0 - stone);
    vec3 pasteC = vec3(0.71, 0.69, 0.65) * (0.93 + 0.1 * fbm3(vP * 30.0));
    vec3 stoneC = mix(vec3(0.38, 0.37, 0.35), vec3(0.70, 0.64, 0.55), sid.y);
    stoneC = mix(stoneC, vec3(0.55, 0.52, 0.48), sid.w * 0.4) * (0.82 + 0.3 * fbm3(vP * 45.0 + sid.z * 20.0));
    vec3 sandC = mix(vec3(0.50, 0.46, 0.40), vec3(0.80, 0.75, 0.66), sd.y);
    col = pasteC; kind = 0.0;
    if (sand > 0.5) { col = sandC; kind = 1.0; }
    if (stone > 0.5) { col = stoneC; kind = 2.0; }
    if (air > 0.5) { col = vec3(0.10); kind = 3.0; }
    float f = kind < 0.5 ? uFocusPaste : kind < 1.5 ? uFocusSand : kind < 2.5 ? uFocusGravel : uFocusAir;
    col = mix(mix(vec3(0.86, 0.84, 0.80), col, 0.22), col, f * (1.0 - uDim) + uDim);
  } else {
    // 型枠面：滑らかな肌に、わずかなムラ
    col = vec3(0.66, 0.65, 0.62) * (0.9 + 0.12 * fbm3(vP * 4.0) + 0.04 * fbm3(vP * 50.0));
  }
  vec3 N = normalize(vN);
  float diff = max(dot(N, normalize(uLightDir)), 0.0);
  vec3 V = normalize(uCam - vW);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 c = col * (0.28 + diff * 0.95) + rim * 0.08;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createCube() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9d5ce');
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  const shared = {
    uCutX: { value: 0 }, uFocusGravel: { value: 1 }, uFocusSand: { value: 1 }, uFocusPaste: { value: 1 }, uFocusAir: { value: 1 }, uDim: { value: 1 },
    uLightDir: { value: new THREE.Vector3(-0.5, 0.9, 0.7) }, uCam: { value: new THREE.Vector3() },
  };
  const halves = [-1, 1].map((side) => {
    const geo = new THREE.BoxGeometry(1, 2, 2, 1, 1, 1);
    const mat = new THREE.ShaderMaterial({ uniforms: { ...shared, uOffset: { value: new THREE.Vector3(side * 0.5, 0, 0) } }, vertexShader: vert, fragmentShader: frag });
    const m = new THREE.Mesh(geo, mat);
    m.userData.side = side;
    return m;
  });
  const group = new THREE.Group();
  for (const h of halves) group.add(h);
  scene.add(group);
  // 床の影（柔らかい楕円）
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.25;
  scene.add(shadow);

  return {
    render(renderer, target, s) {
      const p = s.p;
      const split = p.split ?? 0;
      // 割れて左右に開き、切り口がこちらを向く
      for (const h of halves) {
        h.position.x = h.userData.side * (0.5 + split * 0.55);
        h.rotation.y = h.userData.side * split * 0.95; // 切り口をカメラへ向ける
        h.position.z = split * 0.35;
      }
      group.rotation.y = (p.spin ?? 0) + Math.sin(s.t * 0.4) * 0.05 * (1 - split);
      group.rotation.x = 0.0;
      group.position.y = Math.sin(s.t * 0.9) * 0.03;
      shared.uFocusGravel.value = p.fGravel ?? 1;
      shared.uFocusSand.value = p.fSand ?? 1;
      shared.uFocusPaste.value = p.fPaste ?? 1;
      shared.uFocusAir.value = p.fAir ?? 1;
      shared.uDim.value = p.dim ?? 1;
      const r = p.dist ?? 8;
      const a = p.camA ?? 0.6;
      camera.position.set(Math.sin(a) * r, p.camY ?? 2.4, Math.cos(a) * r);
      camera.lookAt(p.lookX ?? 0, 0, 0);
      shared.uCam.value.copy(camera.position);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    },
  };
}
