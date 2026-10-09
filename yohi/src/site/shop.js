import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCreature } from '../chara/creature.js';
import { mulberry32 } from '../room/world.js';
import { sfx } from '../audio.js';

// 場面3：夜の印刷工房。CLICK でレバーを引くたびに紙が機械を通って刷られる。
// 1回目＝オレンジの版、2回目＝黒の版（ずれている）、3回目＝ガシャンと版が揃う → 機械が全開で回り、刷り上がりが一斉に舞う。
// 絵は state（t, 押した時刻の一覧）だけで決まる。舞う紙はすべて1つの式で動かす。
const PASS = 0.9;          // 1回刷るのにかかる秒（機械に入る → 刷る → カメラの前にせり上がって見せる）
// 3回目のあと（G5「紙から出る」）：ポスターが立ち上がる → 紙のけものが盛り上がる → 破れて飛び出し、床に着地 → 全開
const EMERGE = { stand: 0.0, bulge: 0.45, tear: 1.35, land: 2.05 };   // 3回目の刷り上がり（presses[2] + PASS）からの秒
const BURST_DELAY = PASS + 2.5;
const N_FLY = 80;          // 舞う紙の枚数

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
    floor: await load(new URL('../../assets/shop/floor_ink.webp', import.meta.url).href, true, 5, 5),
    peg: await load(new URL('../../assets/shop/pegboard.webp', import.meta.url).href, true, 4, 2),
    enamel: await load(new URL('../../assets/shop/enamel_black.webp', import.meta.url).href),
    drum: await load(new URL('../../assets/shop/drum_mesh.webp', import.meta.url).href, true, 2, 1),
    edge: await load(new URL('../../assets/shop/paper_edge.webp', import.meta.url).href),
    steel: await load(new URL('../../assets/shop/metal_brushed_dark.webp', import.meta.url).href),
    printA: await load(new URL('../../assets/shop/print_a.webp', import.meta.url).href),
    printB: await load(new URL('../../assets/shop/print_b.webp', import.meta.url).href),
    posterA: await load(new URL('../../assets/alley/poster_a.webp', import.meta.url).href),
    posterC: await load(new URL('../../assets/alley/poster_c.webp', import.meta.url).href),
    paper: await load(new URL('../../assets/tex/riso_paper.webp', import.meta.url).href),
    grain: await load(new URL('../../assets/tex/riso_grain.webp', import.meta.url).href, false),
    logoA: await load(new URL('../../assets/logo/logo_a_mode.webp', import.meta.url).href, false),
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
  const stackMats = [new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex.paper, roughness: 0.95, color: 0x8a8a8a }), new THREE.MeshStandardMaterial({ color: 0x777777 }), new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex.edge, roughness: 0.9 })];
  const feedStack = add(new THREE.BoxGeometry(0.66, 0.12, 0.46), stackMats, 0, 1.7, -0.6, press);
  feedStack.rotation.x = 0.35;
  // 排紙台（手前）
  const out = add(new THREE.BoxGeometry(1.1, 0.02, 0.75), enamel, 0, 1.05, 0.98, press);   // 金属だとランプを鏡のように映して白く光る
  out.rotation.x = 0.8;
  // レバー（右）：オレンジの握り玉が、この場面の差し色
  const lever = new THREE.Group();
  lever.position.set(1.14, 1.1, 0.25);
  press.add(lever);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 16), steel, 0, 0.3, 0, lever);
  add(new THREE.SphereGeometry(0.075, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xff481b, emissive: 0xff481b, emissiveIntensity: 0.25, roughness: 0.25, clearcoat: 1 }), 0, 0.62, 0, lever);
  // 緑白の表示ランプ（刷った回数）
  const lamps = [0, 1, 2].map((i) => add(new THREE.SphereGeometry(0.035, 16, 10), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc7ffdb, emissiveIntensity: 0.1 }), -0.55 + i * 0.13, 1.4, 0.42, press));

  // ---------- 刷られる紙：けもののポスターを、オレンジの版 → 黒の版（ずれる）→ 揃う、の順に刷る ----------
  // 元のポスター画像から「オレンジの所」「黒い所」を色で取り出して、版ごとに紙へ乗せる
  const ink = { uO: { value: 0 }, uK: { value: 0 }, uOff: { value: new THREE.Vector2() }, uBulge: { value: 0 }, uTear: { value: 0 } };
  const sheetMat = new THREE.MeshStandardMaterial({ map: tex.paper, roughness: 1.0, color: 0xc4c0b8 });
  sheetMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ink, { uPrint: { value: tex.printA }, uGrain: { value: tex.grain } });
    // 盛り上がり：ポスターの「黒い所」（けものの体）を高さにして、紙を内側から押し出す
    sh.vertexShader = 'uniform sampler2D uPrint; uniform float uBulge;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 pv = texture2D(uPrint, uv).rgb;
      float body = 1.0 - smoothstep(0.15, 0.45, dot(pv, vec3(0.3, 0.59, 0.11)));
      float wob = 1.0 + 0.12 * sin(uv.y * 30.0 + uBulge * 25.0);
      transformed.z += body * uBulge * 0.12 * wob;`);
    sh.fragmentShader = 'uniform float uO, uK, uTear; uniform vec2 uOff; uniform sampler2D uPrint, uGrain;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      // 破れ：けものの形に穴があく（ふちは少しギザギザ）
      vec3 pt = texture2D(uPrint, vMapUv).rgb;
      float hole = 1.0 - smoothstep(0.15, 0.45, dot(pt, vec3(0.3, 0.59, 0.11)));
      float jag = fract(sin(dot(floor(vMapUv * 80.0), vec2(12.9898, 78.233))) * 43758.5453);
      if (uTear > 0.0 && hole > 0.55 - jag * 0.25 * uTear && hole * uTear > 0.3) discard;
      float g = texture2D(uGrain, vMapUv * 1.5).r;
      vec3 pc = texture2D(uPrint, vMapUv).rgb;
      float mO = smoothstep(0.1, 0.3, pc.r - pc.g) * uO * (1.0 - g * 0.3);
      vec3 pk = texture2D(uPrint, vMapUv + uOff).rgb;
      float mK = (1.0 - smoothstep(0.18, 0.42, dot(pk, vec3(0.3, 0.59, 0.11)))) * uK * (1.0 - smoothstep(0.6, 0.9, g) * 0.6);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.3, 0.1), mO * 0.95);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.07), mK * 0.95);`);
  };
  const sheet = add(new THREE.PlaneGeometry(0.6, 0.9, 60, 90), sheetMat);
  sheet.material.side = THREE.DoubleSide;
  // せり上がった紙を正面から照らす光（ランプの円の外でも読めるように）
  const showLight = new THREE.PointLight(0xfff0dc, 0, 3.5, 1.5);
  showLight.position.set(0.2, 2.3, 3.0);
  scene.add(showLight);

  // ---------- 刷り上がりが舞う（64枚。すべて同じ式で、i ごとに種だけ違う） ----------
  const flyMats = [tex.printA, tex.printB].map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.85, side: THREE.DoubleSide, color: 0xb8b8b8, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.12 }));
  const flies = flyMats.map((m) => new THREE.InstancedMesh(new THREE.PlaneGeometry(0.46, 0.68), m, N_FLY / 2));
  flies.forEach((f) => { f.frustumCulled = false; f.visible = false; scene.add(f); });
  const seeds = [...Array(N_FLY)].map((_, i) => { const r = mulberry32(300 + i); return [r(), r(), r(), r(), r(), r()]; });
  const dummy = new THREE.Object3D();
  // 全開のあと：機械から吹き上がって画面の上へ抜け、そのあとは上から舞い降り続ける（床に着く前に上へ戻る）。
  // 触ると：クリック＝衝撃波ではじける／ドラッグ＝風で流れる／長押し＝渦を巻いて集まる（離すと散る）
  const tmp = new THREE.Vector3();
  function placeFlies(s, inter) {
    const { clicks, windX, hold, holdP } = inter;
    for (let i = 0; i < N_FLY; i++) {
      const [a, b, c, d, e, f] = seeds[i];
      const mesh = flies[i % 2], idx = Math.floor(i / 2);
      const ti = s - a * 0.7;
      if (ti <= 0) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(idx, dummy.matrix); continue; }
      const L = 0.9 + b * 0.5;                                  // 吹き上がる時間
      const rx = (b - 0.5) * 7.5, rz = -1.0 + e * 3.4;           // 舞う場所
      const v = 0.45 + d * 0.35, TOP = 3.4, BOTTOM = 0.3, H = TOP - BOTTOM;
      const h0 = (0.45 + 0.55 * f) * H;                         // 吹き上がって止まる高さ（ばらばら）→ そこから降りはじめる
      let x, y, z, sc = 1, spin = 0;
      if (ti < L) {
        const k = ti / L, eo = 1 - (1 - k) ** 3;
        x = rx * eo; y = 1.3 + (BOTTOM + h0 - 1.3) * eo; z = -0.3 + (rz + 0.3) * eo;
        spin = ti * (6 + d * 6);
        sc = Math.min(1, ti * 5);
      } else {
        const tau = ti - L;
        y = BOTTOM + (((h0 - v * tau) % H) + H) % H;              // 下に着いたら上から出直す（画面の上のすぐ外）
        x = rx + Math.sin(tau * (1.1 + c) + i) * 0.35;
        z = rz + Math.cos(tau * (0.8 + e) + i) * 0.2;
        spin = tau * (0.6 + e * 1.2);
        sc = Math.min(1, (y - BOTTOM) / 0.3, (TOP - y) / 0.15 + 0.2);   // 下に着く直前に小さくなって、上から出直す
      }
      // 風（ドラッグ）：横に流れる。画面の外へ出たら反対側から戻る
      x = ((x + windX * (0.6 + e * 0.8) + 4.2) % 8.4 + 8.4) % 8.4 - 4.2;
      // 衝撃波（クリック）：押した所から外へはじける
      for (const ck of clicks) {
        const dt = s - ck.s;
        if (dt < 0 || dt > 3) continue;
        tmp.set(x - ck.p.x, y - ck.p.y, z - ck.p.z);
        const dist = tmp.length() + 1e-3, w = Math.exp(-(dist * dist) / 1.2);
        const push = 1.6 * (1 - Math.exp(-dt * 7)) * Math.exp(-dt * 0.9) * w;
        x += tmp.x / dist * push; y += tmp.y / dist * push; z += tmp.z / dist * push * 0.5;
        spin += w * (1 - Math.exp(-dt * 6)) * 8;
      }
      // 渦（長押し）：押している所を中心に回りながら集まる
      if (hold > 0.001) {
        const th = i * 2.399 + s * (2.2 + c);
        const r = 0.35 + 0.95 * ((i * 0.618) % 1);
        const vx = holdP.x + Math.cos(th) * r, vy = holdP.y + (((i * 0.37) % 1) - 0.5) * 1.8 + Math.sin(s * 2 + i) * 0.1, vz = holdP.z + Math.sin(th) * r * 0.6;
        const hh = hold * hold * (3 - 2 * hold);
        x += (vx - x) * hh; y += (vy - y) * hh; z += (vz - z) * hh;
        spin += hold * s * 4;
      }
      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.sin(spin * 1.3 + i) * 1.1, spin, Math.sin(spin * 0.9 + f * 6) * 0.6);
      dummy.scale.setScalar(Math.max(0, sc));
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
  scene.add(new THREE.HemisphereLight(0x2a3a44, 0x0a0a0a, 0.6));
  const spot = new THREE.SpotLight(0xffe2b8, 22, 9, 0.7, 0.6, 1.3);
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
  // 紙から出てくる、もう1匹（刷ったポスターのけものが立体になる）
  const mon2 = createCreature({ envMap: env, glowScale: 0.45 });
  mon2.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.4; });
  const holder2 = new THREE.Group();
  holder2.add(mon2.group);
  holder2.visible = false;
  scene.add(holder2);
  const rim = new THREE.PointLight(0xc8ffe0, 1.6, 1.4, 1.6);
  rim.position.set(-0.95, 2.0, -1.35);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 60);
  // 状態：押した時刻の一覧＋全開のあとの「触った記録」（クリック、風、長押し）
  const st = { t: 0, enterAt: 0, presses: [], clicks: [], windX: 0, windV: 0, hold: 0, holding: false, holdStart: 0, holdP: new THREE.Vector3(0, 1.4, 0.4), lastP: null, lastClick: -10 };
  let groove = null, swirl = null;
  const burstAt = () => (st.presses.length >= 3 ? st.presses[2] + BURST_DELAY : null);
  const raining = () => burstAt() !== null && st.t >= burstAt();
  const ease = (x) => x * x * (3 - 2 * x);
  // 画面の位置 → 紙が舞っている面（z = 0.4）の上の点
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.4);
  const toWorld = (ndc) => { ray.setFromCamera(ndc, camera); const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null; };

  // 紙の3つの位置：排紙台（最初）／機械の中／カメラの前（刷り上がりを見せる）
  const TRAY = { p: new THREE.Vector3(0, 1.08, 0.25), r: -Math.PI / 2 + 0.8 };
  const IN = { p: new THREE.Vector3(0, 1.12, -0.3), r: -Math.PI / 2 + 0.8 };
  const UPRIGHT = { p: new THREE.Vector3(0.0, 1.52, 0.62), r: -0.05 };   // 紙から出る前に、機械の上ですっと立ち上がる
  const OUT2 = new THREE.Vector3(0.55, 1.55, -0.8);                      // 飛び出したけものが着地する所（印刷機の上、もとのけものの隣）
  const SHOW = { p: new THREE.Vector3(0.0, 1.16, 0.42), r: -Math.PI / 2 + 1.05 };   // 手前の台の上で少し起き上がる（カメラの前までは来ない）
  const lerpPose = (A, B, k) => ({ p: A.p.clone().lerp(B.p, k), r: A.r + (B.r - A.r) * k });

  function draw(look) {
    const t = st.t;
    // 紙：押すたびに機械へ入り、版が1つ刷られて、カメラの前へせり上がって見せる
    let pose = TRAY, shown = 0;
    ink.uO.value = 0; ink.uK.value = 0;
    st.presses.forEach((p, i) => {
      const s = (t - p) / PASS;
      if (s < 0) return;
      const from = i === 0 ? TRAY : SHOW;
      if (s < 0.3) pose = lerpPose(from, IN, ease(s / 0.3));
      else if (s < 0.5) pose = IN;
      else if (s < 0.68) pose = lerpPose(IN, TRAY, ease((s - 0.5) / 0.18));
      else if (s < 1) pose = lerpPose(TRAY, SHOW, ease((s - 0.68) / 0.32));
      else pose = SHOW;
      if (s > 0.42) { if (i === 0) ink.uO.value = 1; else ink.uK.value = 1; }
      shown = s >= 0.68 ? Math.min(1, (s - 0.68) / 0.32) : 0;
    });
    const aligned = st.presses.length >= 3 && t - st.presses[2] > PASS * 0.42;
    ink.uOff.value.set(aligned ? 0 : 0.03, aligned ? 0 : -0.022);
    // G5：3回目の刷り上がりから、立つ → 盛り上がる → 破れて飛び出す → 着地
    const e3 = st.presses.length >= 3 ? t - (st.presses[2] + PASS) : -1;
    const seg = (a, b) => Math.max(0, Math.min(1, (e3 - a) / (b - a)));
    if (e3 >= 0) pose = lerpPose(SHOW, UPRIGHT, ease(seg(EMERGE.stand, EMERGE.bulge)));
    ink.uBulge.value = e3 < EMERGE.bulge ? 0 : ease(seg(EMERGE.bulge, EMERGE.tear)) + (e3 > EMERGE.tear ? -seg(EMERGE.tear, EMERGE.tear + 0.2) * 0.6 : 0);
    ink.uTear.value = seg(EMERGE.tear, EMERGE.tear + 0.12);
    sheet.position.copy(pose.p);
    sheet.rotation.set(pose.r, 0, 0);
    // 盛り上がるあいだ、紙が小刻みに震える
    if (e3 > EMERGE.bulge && e3 < EMERGE.tear) sheet.position.x += Math.sin(t * 60) * 0.004 * seg(EMERGE.bulge, EMERGE.tear);
    // 飛び出したけもの：紙の中央から、ぺらっと平たい状態で出て、立体に膨らみながら弧を描いて床へ
    holder2.visible = e3 >= EMERGE.tear;
    if (holder2.visible) {
      const k = seg(EMERGE.tear, EMERGE.land);
      const from = UPRIGHT.p.clone().add(new THREE.Vector3(0, -0.3, 0.05));
      holder2.position.lerpVectors(from, OUT2, ease(k));
      holder2.position.y += Math.sin(k * Math.PI) * 0.45;
      const pop = Math.min(1, (e3 - EMERGE.tear) / 0.25);
      const land = e3 > EMERGE.land ? Math.exp(-(e3 - EMERGE.land) * 7) * Math.cos((e3 - EMERGE.land) * 20) : 0;
      holder2.scale.set(0.62 * (1 + land * 0.2), 0.62 * (1 - land * 0.25), 0.62 * (0.15 + 0.85 * pop));
      holder2.rotation.set(0, -0.45 + (1 - k) * 0.45, (1 - k) * 0.6 * Math.sin(k * 9));
    }
    const burst = burstAt(), sb = burst === null ? -1 : t - burst;
    // 全開になったら、見せていた紙も吹き上がる紙に混ざって消える
    sheet.visible = sb < 0.15;
    showLight.intensity = (e3 >= 0 ? 2.6 : shown * 1.2) * (sb < 0 ? 1 : 0);   // 立ち上がったポスターは正面から照らす
    // 版胴：1回ごとに1回転。全開のあとは高速で回り続ける
    let ang = 0;
    st.presses.forEach((p) => { ang += Math.PI * 2 * ease(Math.max(0, Math.min(1, (t - p) / PASS))); });
    if (sb > 0) ang += sb * 18;
    drum.rotation.x = ang;
    let pull = 0;
    st.presses.forEach((p) => { const s = (t - p) / 0.35; if (s >= 0 && s < 1) pull = Math.sin(s * Math.PI); });
    lever.rotation.x = -pull * 0.9;
    lamps.forEach((l, i) => { l.material.emissiveIntensity = st.presses.length > i ? 2.2 : 0.1; });
    const lastClickAgo = t - st.lastClick;
    const hit = sb < 0 ? 0 : Math.exp(-sb * 3.5) * 0.45 + Math.exp(-lastClickAgo * 6) * 0.25;
    press.position.x = sb > 0 ? Math.sin(t * 70) * 0.012 * Math.min(1, sb * 3) : 0;
    if (sb >= 0) placeFlies(sb, { clicks: st.clicks, windX: st.windX, hold: st.hold, holdP: st.holdP }); else flies.forEach((f) => { f.visible = false; });
    hung.forEach((g, i) => { g.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.04 + (sb > 0 ? Math.sin(t * 9 + i) * 0.08 * Math.exp(-sb) : 0) + st.windV * 0.03; g.rotation.x = Math.sin(t * 0.6 + i) * 0.05; });
    // けもの：拍に合わせて弾む。刷るたびに光り、全開とクリックで跳ね、長押しで電気を溜める
    let spark = 0;
    st.presses.forEach((p) => { const s = t - p; if (s >= 0) spark = Math.max(spark, Math.exp(-s * 3)); });
    const beat = Math.abs(Math.sin(t * Math.PI * 2));
    holder.position.y = 1.55 + (sb < 0 ? beat * 0.02 : 0);
    const since = sb < 0 ? -1 : Math.min(sb, lastClickAgo);
    // もとのけもの：紙から仲間が出てきた瞬間にびっくりして跳ねる
    const surprised = e3 >= EMERGE.tear && sb < 0 ? e3 - EMERGE.tear : since;
    mon.update({ t, power: Math.min(1, spark * 0.8 + st.presses.length * 0.12 + st.hold * 0.8), sinceImpact: surprised, look: e3 >= EMERGE.tear && sb < 0 ? { x: 0.8, y: -0.5 } : look });
    if (holder2.visible) mon2.update({ t: t + 1.7, power: Math.min(1, 0.3 + st.hold * 0.8), sinceImpact: sb < 0 ? -1 : since, look });
    const intro = Math.min(1, (t - st.enterAt) / 1.0), e = 1 - (1 - intro) ** 3;
    const shake = hit * 0.05;
    camera.position.set(look.x * 0.35 + Math.sin(t * 59) * shake, 2.0 + look.y * 0.15 + Math.cos(t * 47) * shake, 3.3 + 1.2 * e);
    camera.lookAt(look.x * 0.1, 1.2, -0.6);
    const wipe = t - st.enterAt < 0.5 ? 0.5 + (t - st.enterAt) : 0;
    return { hit, power: sb >= 0 ? 0.6 + st.hold * 0.4 : st.presses.length / 3 * 0.4, wipe };
  }

  return {
    scene, camera,
    get hint() { return raining() ? 'CLICK / DRAG / HOLD' : 'CLICK'; },
    setQuality() {},
    reset() { holder2.visible = false; Object.assign(st, { t: 0, enterAt: 0, presses: [], clicks: [], windX: 0, windV: 0, hold: 0, holding: false, lastP: null, lastClick: -10 }); },
    enter() { sfx('feed', { gain: 1.2 }); groove?.stop(); groove = sfx('groove', { gain: 0.6, loop: true }); },
    leave() { groove?.stop(0.2); groove = null; swirl?.stop(); swirl = null; },
    down(ndc) {
      if (raining()) {
        // 衝撃波：押した所から紙がはじける
        const p = toWorld(ndc) ?? st.holdP.clone();
        st.clicks.push({ s: st.t - burstAt(), p });
        if (st.clicks.length > 8) st.clicks.shift();
        st.lastClick = st.t;
        st.holding = true; st.holdStart = st.t; st.holdP.copy(p); st.lastP = p.clone();
        sfx('hit', { gain: 0.55 }); sfx('snap', { gain: 0.8 });
        return;
      }
      const n = st.presses.length;
      if (n >= 3 || (n > 0 && st.t - st.presses[n - 1] < PASS)) return;   // 刷っている最中は受け付けない
      st.presses.push(st.t);
      sfx(`press${n + 1}`, { gain: 1.1 });
      sfx('feed', { gain: 0.6 });
    },
    up() { st.holding = false; },
    move(ndc) {
      if (!raining() || !st.holding) return;
      const p = toWorld(ndc);
      if (!p) return;
      // 風：ドラッグした向きに吹く
      if (st.lastP) st.windV = Math.max(-6, Math.min(6, st.windV + (p.x - st.lastP.x) * 6));
      st.lastP = p.clone();
      st.holdP.copy(p);
    },
    tick(dt) {
      const prev = st.t;
      st.t += dt;
      const b = burstAt();
      if (b !== null && prev < b && st.t >= b) { sfx('final'); sfx('impact', { gain: 0.7 }); }
      // G5 の音：立つ（紙の音）→ 盛り上がる（唸り）→ 破れる（パン！）→ 着地
      if (st.presses.length >= 3) {
        const base = st.presses[2] + PASS, at = (x) => prev < base + x && st.t >= base + x;
        if (at(EMERGE.stand)) sfx('feed', { gain: 0.8 });
        if (at(EMERGE.bulge)) sfx('charge', { gain: 0.45, offset: 0.6 });
        if (at(EMERGE.tear)) { sfx('snap', { gain: 1.2 }); sfx('hit', { gain: 0.8 }); }
        if (at(EMERGE.land)) sfx('press1', { gain: 0.6 });   // 着地のドスッ
      }
      // 風は吹いたあと弱まっていく。流された分は積み重なる
      st.windV *= Math.exp(-dt * 1.4);
      st.windX += st.windV * dt;
      // 長押し（0.25秒以上）で渦になる。離すとほどける
      const target = st.holding && st.t - st.holdStart > 0.25 && Math.abs(st.windV) < 1.5 ? 1 : 0;
      const before = st.hold;
      st.hold += (target - st.hold) * Math.min(1, dt * (target ? 2.2 : 3.5));
      if (before < 0.15 && st.hold >= 0.15) { swirl?.stop(); swirl = sfx('charge', { gain: 0.6 }); }
      if (before > 0.5 && st.hold <= 0.5 && !target) { swirl?.stop(0.1); swirl = null; sfx('drop', { gain: 0.7 }); }
      if (b !== null && st.t - b > 3.8) return 'end';
      return null;
    },
    progress() { return burstAt() === null ? st.presses.length / 3 : 0; },
    busy() { if (raining()) return false; const n = st.presses.length; return n >= 3 || (n > 0 && st.t - st.presses[n - 1] < PASS); },
    draw,
    state: () => ({ presses: st.presses.length, burst: raining(), hold: st.hold, clicks: st.clicks.length }),
    // ?mode=render 用：0.8 / 1.8 / 2.8 秒に押す → 4.3 全開。6.0 に左でクリック、7.5〜 中央で長押し
    script(t) {
      this.reset();
      st.t = t; st.enterAt = -10; st.presses = [0.8, 1.8, 2.8].filter((p) => p <= t);
      const b = burstAt();
      if (b !== null && t >= 6.0) { st.clicks = [{ s: 6.0 - b, p: new THREE.Vector3(-1.2, 1.6, 0.4) }]; st.lastClick = 6.0; }
      if (t >= 7.5) { st.hold = Math.min(1, (t - 7.5) / 0.8); st.holdP.set(0.4, 1.5, 0.4); }
    },
    dust: null,
  };
}
