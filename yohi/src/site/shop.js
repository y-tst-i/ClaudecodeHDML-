import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCreature } from '../chara/creature.js';
import { mulberry32 } from '../room/world.js';
import { sfx } from '../audio.js';

// 場面3：夜の印刷工房。CLICK でレバーを引くたびに紙が機械を通って刷られる。
// 1回目＝オレンジの版、2回目＝黒の版（ずれている）、3回目＝ガシャンと版が揃う → 機械が全開で回り、刷り上がりが一斉に舞う。
// 絵は state（t, 押した時刻の一覧）だけで決まる。舞う紙はすべて1つの式で動かす。
const PASS = 0.6;          // 1回刷るのにかかる秒
const BURST_DELAY = 0.6;   // 3回目のあと、全開になるまで
const N_FLY = 64;          // 舞う紙の枚数

export async function createShop(renderer, env) {
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb = true, rx = 1, ry = rx) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    return t;
  };
  const tex = {
    floor: await load(new URL('../../assets/shop/floor_ink.jpg', import.meta.url).href, true, 5, 5),
    peg: await load(new URL('../../assets/shop/pegboard.jpg', import.meta.url).href, true, 4, 2),
    enamel: await load(new URL('../../assets/shop/enamel_black.jpg', import.meta.url).href),
    drum: await load(new URL('../../assets/shop/drum_mesh.jpg', import.meta.url).href, true, 2, 1),
    edge: await load(new URL('../../assets/shop/paper_edge.jpg', import.meta.url).href),
    steel: await load(new URL('../../assets/shop/metal_brushed_dark.jpg', import.meta.url).href),
    printA: await load(new URL('../../assets/shop/print_a.jpg', import.meta.url).href),
    printB: await load(new URL('../../assets/shop/print_b.jpg', import.meta.url).href),
    posterA: await load(new URL('../../assets/alley/poster_a.jpg', import.meta.url).href),
    posterC: await load(new URL('../../assets/alley/poster_c.jpg', import.meta.url).href),
    paper: await load(new URL('../../assets/tex/riso_paper.jpg', import.meta.url).href),
    grain: await load(new URL('../../assets/tex/riso_grain.jpg', import.meta.url).href, false),
    logoA: await load(new URL('../../assets/logo/logo_a_mode.png', import.meta.url).href, false),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040405);
  scene.fog = new THREE.FogExp2(0x040405, 0.08);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ---------- 部屋 ----------
  const floor = add(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.75, color: 0x8a8a8a }));
  floor.rotation.x = -Math.PI / 2;
  add(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ map: tex.peg, roughness: 0.9, color: 0x8a8a8a }), 0, 3, -2.6);

  // ---------- 印刷機 ----------
  const enamel = new THREE.MeshStandardMaterial({ map: tex.enamel, roughness: 0.42, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ map: tex.steel, roughness: 0.3, metalness: 0.85 });
  const press = new THREE.Group();
  press.position.set(0, 0, -0.75);
  scene.add(press);
  add(new RoundedBoxGeometry(2.4, 0.9, 1.25, 4, 0.06), enamel, 0, 0.45, 0, press);              // 台
  add(new RoundedBoxGeometry(2.1, 0.62, 1.05, 4, 0.08), enamel, 0, 1.24, -0.12, press);        // 上の箱
  add(new RoundedBoxGeometry(0.22, 0.75, 1.1, 3, 0.05), enamel, -1.0, 1.2, 0.05, press);        // 左右の側板
  add(new RoundedBoxGeometry(0.22, 0.75, 1.1, 3, 0.05), enamel, 1.0, 1.2, 0.05, press);
  const drum = add(new THREE.CylinderGeometry(0.3, 0.3, 1.72, 48, 1, true), new THREE.MeshStandardMaterial({ map: tex.drum, roughness: 0.6, side: THREE.DoubleSide }), 0, 1.12, 0.32, press);
  drum.rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 24), steel, 0, 0.84, 0.48, press).rotation.z = Math.PI / 2;   // 押さえローラー
  // 給紙台（後ろ）と紙の山
  const feed = add(new THREE.BoxGeometry(1.0, 0.02, 0.7), steel, 0, 1.62, -0.58, press);
  feed.rotation.x = 0.35;
  const stackMats = [new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex.paper, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x777777 }), new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 })];
  const feedStack = add(new THREE.BoxGeometry(0.66, 0.12, 0.46), stackMats, 0, 1.7, -0.6, press);
  feedStack.rotation.x = 0.35;
  // 排紙台（手前）
  const out = add(new THREE.BoxGeometry(1.0, 0.02, 0.62), steel, 0, 0.88, 0.95, press);
  out.rotation.x = -0.28;
  // レバー（右）：オレンジの握り玉が、この場面の差し色
  const lever = new THREE.Group();
  lever.position.set(1.14, 1.1, 0.25);
  press.add(lever);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 16), steel, 0, 0.3, 0, lever);
  add(new THREE.SphereGeometry(0.075, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xff481b, emissive: 0xff481b, emissiveIntensity: 0.25, roughness: 0.25, clearcoat: 1 }), 0, 0.62, 0, lever);
  // 緑白の表示ランプ（刷った回数）
  const lamps = [0, 1, 2].map((i) => add(new THREE.SphereGeometry(0.035, 16, 10), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc7ffdb, emissiveIntensity: 0.1 }), -0.55 + i * 0.13, 1.4, 0.42, press));

  // ---------- 刷られる紙：紙の上に、オレンジの版と黒の版（ずれる）を重ねる ----------
  const ink = { uO: { value: 0 }, uK: { value: 0 }, uOff: { value: new THREE.Vector2() } };
  const sheetMat = new THREE.MeshStandardMaterial({ map: tex.paper, roughness: 0.9 });
  sheetMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ink, { uLogo: { value: tex.logoA }, uGrain: { value: tex.grain } });
    sh.fragmentShader = 'uniform float uO, uK; uniform vec2 uOff; uniform sampler2D uLogo, uGrain;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 lu = (vMapUv - 0.5) * vec2(1.06, 1.06) + 0.5;
      float g = texture2D(uGrain, vMapUv * 1.5).r;
      float aO = texture2D(uLogo, lu + vec2(0.006, -0.004)).a * uO * (1.0 - g * 0.35);
      float aK = texture2D(uLogo, lu + uOff).a * uK * (1.0 - smoothstep(0.55, 0.9, g) * 0.7);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.28, 0.1), aO * 0.95);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.06), aK * 0.96);`);
  };
  const sheet = add(new THREE.PlaneGeometry(0.66, 0.44), sheetMat);

  // ---------- 刷り上がりが舞う（64枚。すべて同じ式で、i ごとに種だけ違う） ----------
  const flyMats = [tex.printA, tex.printB].map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.85, side: THREE.DoubleSide }));
  const flies = flyMats.map((m) => new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.5), m, N_FLY / 2));
  flies.forEach((f) => { f.frustumCulled = false; f.visible = false; scene.add(f); });
  const seeds = [...Array(N_FLY)].map((_, i) => { const r = mulberry32(300 + i); return [r(), r(), r(), r(), r(), r()]; });
  const dummy = new THREE.Object3D();
  function placeFlies(s) {
    for (let i = 0; i < N_FLY; i++) {
      const [a, b, c, d, e, f] = seeds[i];
      const ti = s - a * 0.6;                              // 少しずつずれて飛び出す
      const mesh = flies[i % 2], idx = Math.floor(i / 2);
      if (ti <= 0) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(idx, dummy.matrix); continue; }
      // 上へ吹き上がり、空気抵抗でふわっと止まって、ひらひら落ちる（床で止まる）
      const k = 2.2, up = (1 - Math.exp(-k * ti)) / k;
      const x = (b - 0.5) * 6.0 * up + Math.sin(ti * (2 + c * 3) + i) * 0.25 * (1 - Math.exp(-ti));
      const y = Math.max(0.01 + i * 0.0005, 1.3 + (4.5 + c * 3) * up - 0.55 * ti * ti * 0.5 * (0.6 + d * 0.5));
      const z = -0.4 + (0.6 + e * 2.6) * up;
      dummy.position.set(x, y, z);
      const landed = y <= 0.02 + i * 0.0005;
      dummy.rotation.set(landed ? -Math.PI / 2 : ti * (2 + d * 4) + i, landed ? 0 : ti * (1 + e * 3), landed ? f * 6 : Math.sin(ti * 4 + i) * 0.8);
      dummy.scale.setScalar(Math.min(1, ti * 5));
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    }
    flies.forEach((f) => { f.instanceMatrix.needsUpdate = true; f.visible = true; });
  }

  // ---------- 干してあるポスター ----------
  const line = add(new THREE.CylinderGeometry(0.006, 0.006, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }), 0, 2.55, -1.9);
  line.rotation.z = Math.PI / 2;
  const hung = [];
  [tex.printA, tex.posterA, tex.printB, tex.posterC, tex.printA, tex.printB].forEach((map, i) => {
    const g = new THREE.Group();
    g.position.set(-3.0 + i * 1.2, 2.55, -1.9);
    add(new THREE.PlaneGeometry(0.62, 0.9), new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide }), 0, -0.47, 0, g);
    add(new THREE.BoxGeometry(0.05, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }), 0, -0.03, 0.01, g);
    scene.add(g);
    hung.push(g);
  });
  // インク缶（無地）と、床の紙の山
  [[-1.75, 0.14, 0.2, 0x111111], [-1.95, 0.14, 0.55, 0xff481b], [1.8, 0.14, 0.4, 0x111111]].forEach(([x, y, z, c]) => add(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 32), new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.5 }), x, y, z));
  [[2.2, -0.6, 0.5], [-2.4, -0.9, 0.35]].forEach(([x, z, h]) => add(new THREE.BoxGeometry(0.7, h, 0.5), stackMats, x, h / 2, z));

  // ---------- 光：吊りランプ（暖かい白）、遠くのテレビの緑白、レバーのオレンジ ----------
  scene.add(new THREE.HemisphereLight(0x223038, 0x080808, 0.35));
  const spot = new THREE.SpotLight(0xffe2b8, 60, 9, 0.62, 0.6, 1.3);
  spot.position.set(0.15, 3.3, 0.2);
  spot.target.position.set(0, 0.9, -0.5);
  scene.add(spot, spot.target);
  const shade = add(new THREE.ConeGeometry(0.32, 0.26, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }), 0.15, 3.42, 0.2);
  void shade;
  add(new THREE.SphereGeometry(0.07, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d8).multiplyScalar(4) }), 0.15, 3.32, 0.2);
  add(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }), 0.15, 4.1, 0.2);
  const tvGlow = new THREE.PointLight(0xc8ffe0, 5, 10, 1.4);
  tvGlow.position.set(-4, 1.4, 2);
  scene.add(tvGlow);
  const fill = new THREE.DirectionalLight(0x9fb4c0, 0.25);
  fill.position.set(2, 3, 6);
  scene.add(fill);

  // ---------- けもの：印刷機の上でリズムを取る ----------
  const mon = createCreature({ envMap: env, glowScale: 0.45 });
  mon.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.4; });
  const holder = new THREE.Group();
  holder.add(mon.group);
  holder.scale.setScalar(0.62);
  holder.position.set(-0.62, 1.55, -0.85);
  holder.rotation.y = 0.45;
  scene.add(holder);
  const rim = new THREE.PointLight(0xc8ffe0, 1.6, 1.4, 1.6);
  rim.position.set(-0.95, 2.0, -1.35);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 60);
  const st = { t: 0, enterAt: 0, presses: [] };
  let groove = null;
  const burstAt = () => (st.presses.length >= 3 ? st.presses[2] + BURST_DELAY : null);
  const ease = (x) => x * x * (3 - 2 * x);

  function draw(look) {
    const t = st.t;
    // 紙：押すたびに機械の中へ入って、新しい版が刷られて出てくる
    const P_OUT = new THREE.Vector3(0, 0.93, 0.2), P_IN = new THREE.Vector3(0, 1.05, -0.45);
    let pos = P_OUT.clone(), passK = 1;
    ink.uO.value = 0; ink.uK.value = 0;
    st.presses.forEach((p, i) => {
      const s = (t - p) / PASS;
      if (s < 0) return;
      if (s < 1) { passK = s; const k = s < 0.45 ? s / 0.45 : 1 - (s - 0.45) / 0.55; pos = P_OUT.clone().lerp(P_IN, ease(Math.min(1, k))); }
      if (s > 0.45) { if (i === 0) ink.uO.value = 1; else ink.uK.value = 1; }
    });
    const aligned = st.presses.length >= 3 && t - st.presses[2] > PASS * 0.45;
    ink.uOff.value.set(aligned ? 0 : 0.035, aligned ? 0 : -0.028);
    sheet.position.copy(pos).add(press.position);
    sheet.rotation.set(-Math.PI / 2 + 0.28 + (1 - passK) * 0, 0, 0);
    // 版胴：1回ごとに1回転。全開のあとは高速で回り続ける
    const burst = burstAt(), sb = burst === null ? -1 : t - burst;
    let ang = 0;
    st.presses.forEach((p) => { ang += Math.PI * 2 * ease(Math.max(0, Math.min(1, (t - p) / PASS))); });
    if (sb > 0) ang += sb * 18;
    drum.rotation.x = ang;
    // レバー：引いて戻る
    let pull = 0;
    st.presses.forEach((p) => { const s = (t - p) / 0.35; if (s >= 0 && s < 1) pull = Math.sin(s * Math.PI); });
    lever.rotation.x = -pull * 0.9;
    lamps.forEach((l, i) => { l.material.emissiveIntensity = st.presses.length > i ? 2.2 : 0.1; });
    // 全開：機械が震え、刷り上がりが一斉に舞う
    const hit = sb < 0 ? 0 : Math.exp(-sb * 3.5) * 0.9;
    press.position.x = sb > 0 ? Math.sin(t * 70) * 0.012 * Math.min(1, sb * 3) : 0;
    if (sb >= 0) placeFlies(sb); else flies.forEach((f) => { f.visible = false; });
    hung.forEach((g, i) => { g.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.04 + (sb > 0 ? Math.sin(t * 9 + i) * 0.08 * Math.exp(-sb) : 0); g.rotation.x = Math.sin(t * 0.6 + i) * 0.05; });
    // けもの：拍に合わせて小さく弾む。刷るたびに震えて光り、全開で跳ねる
    let spark = 0;
    st.presses.forEach((p) => { const s = t - p; if (s >= 0) spark = Math.max(spark, Math.exp(-s * 3)); });
    const beat = Math.abs(Math.sin(t * Math.PI * 2));   // 120BPM
    holder.position.y = 1.55 + (sb < 0 ? beat * 0.02 : 0);
    mon.update({ t, power: Math.min(1, spark * 0.8 + st.presses.length * 0.12), sinceImpact: sb, look });
    // カメラ：入ってきたら少し引き、マウスで覗く。全開で揺れる
    const intro = Math.min(1, (t - st.enterAt) / 1.0), e = 1 - (1 - intro) ** 3;
    const shake = hit * 0.05;
    camera.position.set(look.x * 0.35 + Math.sin(t * 59) * shake, 1.8 + look.y * 0.15 + Math.cos(t * 47) * shake, 3.0 + 0.9 * e);
    camera.lookAt(look.x * 0.1, 1.1, -0.6);
    const wipe = t - st.enterAt < 0.5 ? 0.5 + (t - st.enterAt) : 0;
    return { hit, power: sb >= 0 ? 0.6 : st.presses.length / 3 * 0.4, wipe };
  }

  return {
    scene, camera, hint: 'CLICK',
    setQuality() {},
    reset() { st.t = 0; st.enterAt = 0; st.presses = []; },
    enter() { sfx('feed', { gain: 1.2 }); groove?.stop(); groove = sfx('groove', { gain: 0.6, loop: true }); },
    leave() { groove?.stop(0.2); groove = null; },
    down() {
      const n = st.presses.length;
      if (n >= 3 || (n > 0 && st.t - st.presses[n - 1] < PASS)) return;   // 刷っている最中は受け付けない
      st.presses.push(st.t);
      sfx(`press${n + 1}`, { gain: 1.1 });
      sfx('feed', { gain: 0.6 });
    },
    up() {},
    move() {},
    tick(dt) {
      const prev = st.t;
      st.t += dt;
      const b = burstAt();
      if (b !== null && prev < b && st.t >= b) { sfx('final'); sfx('impact', { gain: 0.7 }); groove?.stop(0.4); groove = null; }
      if (b !== null && st.t - b > 3.8) return 'end';
      return null;
    },
    progress() { return burstAt() === null ? st.presses.length / 3 : 0; },
    busy() { const n = st.presses.length; return n >= 3 || (n > 0 && st.t - st.presses[n - 1] < PASS); },
    draw,
    state: () => ({ presses: st.presses.length, burst: burstAt() !== null && st.t >= burstAt() }),
    // ?mode=render 用：0.8 / 1.6 / 2.4 秒に押す
    script(t) { st.t = t; st.enterAt = -10; st.presses = [0.8, 1.6, 2.4].filter((p) => p <= t); },
    dust: null,
  };
}
