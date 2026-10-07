import * as THREE from 'three';
import { BEAT, CONFIG } from '../config.js';
import { ease, mulberry32, range } from '../../../src/core/math.js';
import { textPlane } from '../../../src/core/text.js';

// C03：緑の光が集まって宝珠になり、ビートごとに5色へ切り替わる。
// 宝珠 = 外側のガラス（透過）＋内側で渦巻く光のコア。奥に色ごとの言葉。
export function createOrb(env) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.6;
  scene.background = new THREE.Color('#030504');
  const camera = new THREE.PerspectiveCamera(32, CONFIG.width / CONFIG.height, 0.1, 100);
  scene.add(camera);
  const rand = mulberry32(CONFIG.seed + 7);

  // 背景：色ごとの放射グラデーション（ガラスに映り込ませる）
  const bgMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color() }, uI: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec2 vUv;
      void main(){ float d = length((vUv - 0.5) * vec2(1.78, 1.0)); vec3 c = uColor * (0.32 * uI) * smoothstep(0.75, 0.0, d) + vec3(0.008); gl_FragColor = vec4(c, 1.0); }`,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(40, 22.5), bgMat);
  bg.position.z = -12;
  scene.add(bg);

  // 内側のコア：法線方向のノイズで渦を描く発光シェーダー
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uColor; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(vec3 p){ return fract(sin(dot(p, vec3(17.1, 31.7, 47.3))) * 43758.5); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 p = vP * 3.0; float a = uTime * 0.9;
        p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
        float n = n3(p + uTime) * 0.6 + n3(p * 2.3 - uTime * 1.3) * 0.4;
        float swirl = smoothstep(0.35, 0.8, n);
        float rim = pow(1.0 - abs(dot(vN, vV)), 2.0);
        vec3 c = uColor * (0.3 + swirl * 1.3) + vec3(1.0) * pow(swirl, 6.0) * 0.7 + uColor * rim * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 6), coreMat);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, thickness: 1.2, roughness: 0.04, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.03, attenuationDistance: 2.5, attenuationColor: new THREE.Color('#ffffff') }),
  );
  const orb = new THREE.Group();
  orb.add(core, glass);
  scene.add(orb);
  const light = new THREE.PointLight('#fff', 30, 10);
  light.position.set(0, 0, 0.3);
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(-3, 4, 5);
  scene.add(light, key);

  // 集まってくる光の粒（球の外から中心へ、1つの式で）
  const N = 1800;
  const dirs = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    dirs.set([v.x, v.y, v.z, rand()], i * 4);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  pGeo.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 4));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(CONFIG.mako) } },
    vertexShader: `attribute vec4 aDir; uniform float uK; varying float vA;
      void main(){
        float k = clamp(uK * 1.25 - aDir.w * 0.25, 0.0, 1.0);
        float r = mix(6.0 + aDir.w * 6.0, 0.0, k * k);
        float sw = (1.0 - k) * 2.5 + aDir.w;
        vec3 d = aDir.xyz; vec3 p = vec3(d.x * cos(sw) - d.z * sin(sw), d.y, d.x * sin(sw) + d.z * cos(sw)) * r;
        vA = (1.0 - k) * step(0.001, 1.0 - k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (3.0 + aDir.w * 3.0) * (8.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  const motes = new THREE.Points(pGeo, pMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // 色ごとの言葉（奥の空間に巨大に）＋左下の小さな番号
  const words = CONFIG.orbs.map((o) => {
    const w = textPlane(o.word, 0.62, { color: o.color });
    w.position.set(0, -1.32, -0.5);
    w.material.opacity = 0;
    scene.add(w);
    return w;
  });
  const labels = CONFIG.orbs.map((o, i) => {
    // カメラに付けて画面左下に固定（4 単位先 ≒ 画面の高さ 2.3）
    const l = textPlane(`0${i + 1} / ${o.word}`, 0.085, { color: '#e8efe9', weight: 600 });
    l.geometry.translate(l.geometry.parameters.width / 2, 0, 0);
    l.position.set(-1.9, -0.98, -4);
    l.visible = false;
    camera.add(l);
    return l;
  });

  const formEnd = 0.86; // 2拍で形成
  return {
    scene,
    camera,
    // t はシーン内時刻（0〜3秒）
    update(t) {
      const form = ease.outBack(range(t, 0.25, formEnd));
      pMat.uniforms.uK.value = range(t, 0, formEnd);
      orb.scale.setScalar(Math.max(0.001, form * 0.72));
      const idx = t < formEnd ? 0 : Math.min(CONFIG.orbs.length - 1, Math.floor((t - formEnd) / (BEAT * 1.0)) + 0);
      const c = new THREE.Color(CONFIG.orbs[idx].color);
      const beatK = 1 - ((t - formEnd + 10 * BEAT) % BEAT) / BEAT;
      coreMat.uniforms.uColor.value.copy(c);
      coreMat.uniforms.uTime.value = t;
      bgMat.uniforms.uColor.value.copy(c);
      bgMat.uniforms.uI.value = t < formEnd ? range(t, 0.3, formEnd) : 0.75 + 0.5 * beatK * beatK;
      light.color.copy(c);
      light.intensity = 10 + 14 * beatK;
      orb.rotation.set(0.3, t * 0.8, 0.15);
      orb.position.y = 0.32 + Math.sin(t * 2) * 0.04;
      words.forEach((w, i) => {
        w.material.opacity = t >= formEnd && i === idx ? 1 : 0;
        w.scale.setScalar(1 + 0.04 * beatK);
        w.quaternion.copy(camera.quaternion);
      });
      labels.forEach((l, i) => (l.visible = t >= formEnd && i === idx));
      // カメラ：寄りながら少し回り込む
      const a = -0.35 + t * 0.18;
      const r = 6.4 - 0.7 * ease.inOutCubic(range(t, 0, 3));
      camera.position.set(Math.sin(a) * r, 0.35, Math.cos(a) * r);
      camera.lookAt(0, -0.15, 0);
    },
  };
}
