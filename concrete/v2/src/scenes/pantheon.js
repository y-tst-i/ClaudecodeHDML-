import * as THREE from 'three';
import { NOISE } from '../glsl.js';

// パンテオンの内部。直径43.3mの円筒＋半球ドーム、格間（ドームのくぼみ）、頂上の天窓（オクルス）。
// 光の当たり方は「その点から太陽の方向へ向かう線が、天窓を通るか」をシェーダーで計算している
// （だから光の円が正しい形で壁や床を動いていく）。
const R = 21.65; // 内径の半分（m）
const H = 21.65; // 円筒部の高さ。ドームの頂上までは 43.3m（直径と同じ）
const OCULUS = 4.5;

const vert = /* glsl */ `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const frag = /* glsl */ `
precision highp float;
uniform vec3 uSun; uniform float uSurface, uTime, uBeam; // uSurface: 0 床 1 壁 2 ドーム
varying vec3 vW; varying vec3 vN;
${NOISE}
const float R = ${R.toFixed(2)}; const float H = ${H.toFixed(2)}; const float OC = ${OCULUS.toFixed(2)};
float sunlit(vec3 p){
  // p から太陽方向へ伸ばした線が、ドームの頂上（天窓の高さ）で天窓の円の中を通るか
  float topY = H + R;
  float t = (topY - p.y) / max(uSun.y, 0.001);
  vec3 q = p + uSun * t;
  return smoothstep(OC + 0.15, OC - 0.15, length(q.xz));
}
void main(){
  vec3 N = normalize(vN);
  if (uSurface > 0.5) N = -N; // 内側から見ているので、壁とドームの法線は内向き
  vec3 base;
  if (uSurface < 0.5) {
    // 床：大理石の円と正方形のパターン
    vec2 c = vW.xz / 4.0;
    vec2 f = abs(fract(c) - 0.5);
    float circ = smoothstep(0.30, 0.29, length(fract(c) - 0.5));
    float grid = smoothstep(0.49, 0.47, max(f.x, f.y));
    base = mix(vec3(0.55, 0.50, 0.45), vec3(0.70, 0.66, 0.60), circ) * (0.6 + 0.4 * grid) * (0.9 + 0.1 * fbm(vW.xz * 0.5));
  } else if (uSurface < 1.5) {
    // 円筒の壁：柱と壁龕（へこみ）のリズム
    float a = atan(vW.z, vW.x);
    float bay = fract(a / 6.2831853 * 16.0);
    float niche = smoothstep(0.42, 0.40, abs(bay - 0.5)) * step(vW.y, H * 0.55) * step(1.5, vW.y);
    base = vec3(0.62, 0.58, 0.52) * (1.0 - niche * 0.45) * (0.88 + 0.12 * fbm(vec2(a * 20.0, vW.y)));
    base *= 1.0 - smoothstep(0.2, 0.0, abs(vW.y - H * 0.6)) * 0.3;
  } else {
    // ドーム：格間（5段 × 28列）
    vec3 d = normalize(vW - vec3(0.0, H, 0.0));
    float el = asin(clamp(d.y, -1.0, 1.0));
    float az = atan(d.z, d.x);
    float row = (el - 0.12) / (1.15 - 0.12) * 5.0;
    float col = az / 6.2831853 * 28.0;
    vec2 cell = vec2(fract(col), fract(row));
    float inRows = step(0.0, row) * step(row, 5.0);
    vec2 e = abs(cell - 0.5);
    float coffer = smoothstep(0.36, 0.30, max(e.x, e.y)) * inRows;
    float step2 = smoothstep(0.30, 0.22, max(e.x, e.y)) * inRows;
    base = vec3(0.60, 0.57, 0.52) * (1.0 - coffer * 0.28 - step2 * 0.12) * (0.9 + 0.1 * fbm(vec2(az * 6.0, el * 12.0)));
    // 天窓の穴
    if (el > 1.36) discard;
  }
  float lit = sunlit(vW) * max(dot(N, uSun), 0.0);
  vec3 sunCol = vec3(1.0, 0.86, 0.66);
  // 天窓からの空の光（全体をうっすら）＋ 太陽の円
  float sky = 0.10 + 0.20 * smoothstep(-0.2, 1.0, N.y * -1.0 + (uSurface > 1.5 ? 0.0 : 0.6));
  vec3 col = base * (sky + lit * 2.4 * sunCol);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createPantheon() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bcd4ec');
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400);
  const sun = new THREE.Vector3();
  const make = (geo, surface) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun }, uSurface: { value: surface }, uTime: { value: 0 }, uBeam: { value: 0 } }, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide }));
    scene.add(m);
    return m;
  };
  const floor = make(new THREE.CircleGeometry(R, 128), 0);
  floor.rotation.x = -Math.PI / 2;
  floor.material.side = THREE.FrontSide;
  const wall = make(new THREE.CylinderGeometry(R, R, H, 160, 8, true), 1);
  wall.position.y = H / 2;
  const dome = make(new THREE.SphereGeometry(R, 160, 80, 0, Math.PI * 2, 0, Math.PI / 2), 2);
  dome.position.y = H;

  // 光の柱（天窓から差し込む光のすじ）：加算の半透明な円柱
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uI: { value: 0.35 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = e * (0.35 + 0.65 * vUv.y) * uI; gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a, a); }',
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(OCULUS, OCULUS, 1, 48, 1, true), beamMat);
  scene.add(beam);
  // 塵（光の中で舞う）
  const dustN = 1500;
  const dust = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) dust.set([Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1], i * 3);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
  const dustPts = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: '#fff4dd', size: 0.06, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dustPts);

  return {
    render(renderer, target, s) {
      const p = s.p;
      // 太陽の向き（時間とともに少しずつ動く）
      const az = (p.sunAz ?? 0.6) + s.t * 0.015;
      const el = p.sunEl ?? 1.05;
      sun.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
      // 光の柱：天窓から太陽と反対方向へ伸ばす
      const top = new THREE.Vector3(0, H + R, 0);
      const len = (H + R) / sun.y;
      const end = top.clone().addScaledVector(sun, -len);
      beam.position.copy(top.clone().lerp(end, 0.5));
      beam.scale.set(1, len, 1);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sun);
      beamMat.uniforms.uI.value = p.beam ?? 0.35;
      dustPts.position.copy(beam.position);
      dustPts.quaternion.copy(beam.quaternion);
      dustPts.scale.set(OCULUS, len, OCULUS);
      dustPts.rotation.y += 0; // 決定論のため回さない
      // カメラ：床から天窓を見上げる → ゆっくり回る
      const look = p.look ?? 1;
      const ca = (p.camA ?? 0) + s.t * 0.03;
      camera.position.set(Math.cos(ca) * (p.camR ?? 6), p.camY ?? 1.7, Math.sin(ca) * (p.camR ?? 6));
      const yaw = ca + (p.yaw ?? 0); // 視線を少し横にずらして、天窓を画面の右寄りに
      camera.lookAt(-Math.cos(yaw) * 10, H * 0.55 + look * (R + H * 0.4), -Math.sin(yaw) * 10);
      camera.fov = p.fov ?? 75;
      camera.updateProjectionMatrix();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    },
  };
}
