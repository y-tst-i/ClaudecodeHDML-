import * as THREE from 'three';
import { BEAT, CONFIG } from '../config.js';
import { ease, mulberry32, range } from '../../../src/core/math.js';

// 円盤状のプレート都市。8つの区画、外周に8基のエネルギー炉、中心に塔。
// 炉から緑の光が噴き上がり、ビートで脈打つ。
const R = 10; // プレートの半径
const REACTORS = 8;

export function createCity(env) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.15;
  scene.background = new THREE.Color(CONFIG.night);
  scene.fog = new THREE.FogExp2(CONFIG.night, 0.022);
  const rand = mulberry32(CONFIG.seed);
  const mako = new THREE.Color(CONFIG.mako);
  const flatMats = []; // PS1 時はフラットシェーディング＋頂点スナップにする対象
  const snap = { value: 0 }; // 0 = オフ / それ以外 = 画面を何マスに丸めるか
  const addSnap = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSnap = snap;
      sh.vertexShader = 'uniform float uSnap;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        if (uSnap > 0.0) { vec4 c = gl_Position; c.xy = floor(c.xy / c.w * uSnap + 0.5) / uSnap * c.w; gl_Position = c; }`);
    };
    flatMats.push(mat);
  };

  // プレート本体（上面＋側面の段）
  const plateMat = new THREE.MeshStandardMaterial({ color: '#2b302e', metalness: 0.7, roughness: 0.55 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.96, 0.6, 96, 1), plateMat);
  plate.position.y = -0.3;
  scene.add(plate);
  // プレートを支える下層（スラム側）は暗い円錐で示す
  const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.9, 6, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#0d1210', side: THREE.DoubleSide, roughness: 1 }));
  under.position.y = -3.6;
  under.rotation.x = Math.PI;
  scene.add(under);
  addSnap(plateMat);

  // ビル群：区画の境（放射状の道）と中心のリングを空けて並べる
  const bMat = new THREE.MeshStandardMaterial({ color: '#7d8883', metalness: 0.45, roughness: 0.5 });
  addSnap(bMat);
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const COUNT = 1400;
  const buildings = new THREE.InstancedMesh(box, bMat, COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const windows = []; // 窓明かりの位置
  let n = 0;
  while (n < COUNT) {
    const r = 2.2 + Math.sqrt(rand()) * (R - 2.8);
    const a = rand() * Math.PI * 2;
    const sector = (a / (Math.PI * 2)) * REACTORS;
    if (Math.abs(sector - Math.round(sector)) < 0.09) continue; // 放射状の道
    const h = 0.2 + Math.pow(rand(), 2.2) * (1.6 - r * 0.08) * 2.2;
    const w = 0.18 + rand() * 0.35;
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + (rand() - 0.5) * 0.2);
    s.set(w, h, w * (0.6 + rand() * 0.8));
    m.compose(p, q, s);
    buildings.setMatrixAt(n, m);
    const g = 0.35 + rand() * 0.4;
    buildings.setColorAt(n, col.setRGB(g, g * 1.04, g));
    if (rand() < 0.5) windows.push([p.x + (rand() - 0.5) * w, h * rand(), p.z + (rand() - 0.5) * w]);
    n++;
  }
  scene.add(buildings);

  // 窓の明かり（暖色の点）
  const winGeo = new THREE.BufferGeometry();
  winGeo.setAttribute('position', new THREE.Float32BufferAttribute(windows.flat(), 3));
  const winMat = new THREE.PointsMaterial({ color: '#ffd9a0', size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(winGeo, winMat));

  // 中心の塔
  const towerMat = new THREE.MeshStandardMaterial({ color: '#6a7470', metalness: 0.8, roughness: 0.3 });
  addSnap(towerMat);
  const tower = new THREE.Group();
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.5, 1.4), towerMat);
  t1.position.y = 2.75;
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 1.6, 8), towerMat);
  t2.position.y = 6.3;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff5040' }));
  beacon.position.y = 7.2;
  tower.add(t1, t2, beacon);
  scene.add(tower);

  // エネルギー炉：煙突＋緑のリング＋光の柱＋点光源
  const reactorMat = new THREE.MeshStandardMaterial({ color: '#3a403d', metalness: 0.8, roughness: 0.4 });
  addSnap(reactorMat);
  const ringMat = new THREE.MeshBasicMaterial({ color: mako });
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: mako }, uI: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.5); float a = pow(1.0 - vUv.y, 1.8) * edge; gl_FragColor = vec4(uColor * uI, a * 0.45 * uI); }`,
  });
  const reactors = [];
  for (let i = 0; i < REACTORS; i++) {
    const a = (i / REACTORS) * Math.PI * 2;
    const x = Math.cos(a) * (R - 1.3), z = Math.sin(a) * (R - 1.3);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 2.6, 12), reactorMat);
    stack.position.y = 1.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.06, 6, 24), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.62;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.4, 9, 16, 1, true), beamMat);
    beam.position.y = 2.6 + 4.5;
    const light = new THREE.PointLight(mako, 6, 7, 1.6);
    light.position.y = 2.9;
    g.add(stack, ring, beam, light);
    scene.add(g);
    reactors.push({ g, light, a });
  }

  // 噴き上がる光の粒：位置は (種, 時刻) だけで決まる
  const PCOUNT = 4000;
  const seeds = new Float32Array(PCOUNT * 4);
  for (let i = 0; i < PCOUNT; i++) seeds.set([Math.floor(rand() * REACTORS), rand(), rand(), rand()], i * 4);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PCOUNT * 3), 3));
  pGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: mako }, uR: { value: R - 1.3 }, uSize: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime, uR, uSize; varying float vA;
      void main(){
        float a = aSeed.x / 8.0 * 6.2831853;
        float life = fract(aSeed.y + uTime * (0.12 + aSeed.z * 0.18));
        float spread = 0.25 + life * 1.4;
        float th = aSeed.w * 6.2831853 + uTime * 0.6;
        vec3 p = vec3(cos(a) * uR + cos(th) * spread * aSeed.z, 2.6 + life * 9.0, sin(a) * uR + sin(th) * spread * aSeed.z);
        vA = sin(life * 3.14159) * (0.4 + aSeed.w * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (2.0 + aSeed.w * 4.0) * (20.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  scene.add(particles);

  scene.add(new THREE.HemisphereLight('#9cc4b4', '#06100c', 0.9));
  const rimGlow = new THREE.Mesh(new THREE.TorusGeometry(R * 0.97, 0.08, 6, 128), new THREE.MeshBasicMaterial({ color: mako }));
  rimGlow.rotation.x = Math.PI / 2;
  rimGlow.position.y = -0.62;
  scene.add(rimGlow);
  const moon = new THREE.DirectionalLight('#9fc8ff', 1.4);
  moon.position.set(-8, 12, 4);
  scene.add(moon);

  const camera = new THREE.PerspectiveCamera(40, CONFIG.width / CONFIG.height, 0.05, 200);
  let flat = null;

  return {
    scene,
    camera,
    reactors,
    // PS1 らしさ：フラットシェーディング・粒は大きく少なく見せる
    setRetro(on) {
      if (flat === on) return;
      flat = on;
      for (const mat of flatMats) { mat.flatShading = on; mat.needsUpdate = true; }
      snap.value = on ? 90 : 0;
      pMat.uniforms.uSize.value = on ? 1.6 : 1;
      winMat.size = on ? 0.1 : 0.06;
    },
    // 光の脈動（ビート頭で強く、減衰）
    pulse(t) {
      const k = 1 - (t % BEAT) / BEAT;
      const i = 0.65 + 0.35 * k * k;
      beamMat.uniforms.uI.value = i;
      for (const r of reactors) r.light.intensity = 4 + 6 * k * k;
      pMat.uniforms.uTime.value = t;
      beacon.visible = Math.floor(t / (BEAT * 2)) % 2 === 0;
    },
    update(t) {
      this.pulse(t);
      // C01 (0-3s)：斜め上空から都市全体。ゆっくり回りながら寄る
      // C02 (3-6s)：外周の外側を回り込み、炉の1基へ急降下（ビル群の上は通らない）
      const target = reactors[1];
      const dir = new THREE.Vector3(Math.cos(target.a), 0, Math.sin(target.a));
      const orbitA = target.a - 1.1 + t * 0.07;
      const p0 = new THREE.Vector3(Math.cos(orbitA) * (26 - t * 0.8), 12 - t * 0.5, Math.sin(orbitA) * (26 - t * 0.8));
      const p2 = dir.clone().multiplyScalar(R + 3.4).setY(2.4);
      const p1 = dir.clone().multiplyScalar(R + 9).setY(7);
      const k = ease.inOutCubic(range(t, 3, 5.9));
      const a0 = p0.clone(); // t=3 での位置から曲線を始める
      if (t > 3) a0.set(Math.cos(target.a - 1.1 + 0.21) * 23.6, 10.5, Math.sin(target.a - 1.1 + 0.21) * 23.6);
      const pos = t < 3 ? p0 : new THREE.Vector3()
        .addScaledVector(a0, (1 - k) * (1 - k))
        .addScaledVector(p1, 2 * k * (1 - k))
        .addScaledVector(p2, k * k);
      camera.position.copy(pos);
      const reactorTop = dir.clone().multiplyScalar(R - 1.3).setY(3.2);
      const look = new THREE.Vector3(0, 0.5, 0).lerp(reactorTop, ease.inOutCubic(range(t, 3.2, 5.9)));
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      camera.fov = 38 + 18 * ease.inExpo(range(t, 4.8, 5.95));
      camera.updateProjectionMatrix();
    },
  };
}
