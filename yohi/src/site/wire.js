import * as THREE from 'three';
import { createCreature } from '../chara/creature.js';
import { sfx } from '../audio.js';

// 場面5：夜を縫う線（GPT 案）。音の消えた倉庫の配電盤。端子を2つ選んでつなぐと、光る電線が張る（長さで音の高さが変わる）。
// けものが張った電線に飛び乗り、しっぽで弾いて鳴らす。3本張ると3本いっしょに鳴り、床に散らばった紙切れが跳ね上がって、
// 空中で1枚のポスター（エンディングの紙）に組み上がる。絵は state（t、張った電線の一覧）だけで決まる。
const TERMS = [[-1.05, 1.85], [-0.35, 2.02], [0.45, 1.9], [1.1, 1.72], [-0.92, 0.95], [-0.1, 0.78], [0.72, 1.02], [1.16, 0.7]];
const BOARD_Z = -0.92, NEED = 3;
const HOP = 0.5, PLUCK = 0.75;                     // 張ってから飛び乗るまで／弾くまで（秒）
const FLY = { up: 0.35, done: 1.7, wipe: 2.5, end: 3.0 };   // 3本目を弾いてから
const COLS = 6, ROWS = 10, N_TILE = COLS * ROWS, TILE = 0.16;

export async function createWire(renderer, env, { getPoster }) {
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb = true, r = 1) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(r, r);
    t.anisotropy = 8;
    return t;
  };
  const tex = {
    board: await load(new URL('../../assets/wire/board_panel.webp', import.meta.url).href),
    floor: await load(new URL('../../assets/shop/floor_ink.webp', import.meta.url).href, true, 5),
    wall: await load(new URL('../../assets/room/wall_dark.webp', import.meta.url).href, true, 3),
    steel: await load(new URL('../../assets/shop/metal_brushed_dark.webp', import.meta.url).href),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030304);
  scene.fog = new THREE.FogExp2(0x030304, 0.09);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.6, color: 0x6a6a6a }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.9, color: 0x5a5a5a }));
  wall.position.set(0, 5, -1.05);
  scene.add(wall);
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 0.08), [null, null, null, null, null, null].map((_, i) => new THREE.MeshStandardMaterial(i === 4 ? { map: tex.board, roughness: 0.6, metalness: 0.4 } : { color: 0x151515, roughness: 0.6 })));
  board.position.set(0.05, 1.38, BOARD_Z - 0.05);
  scene.add(board);

  // ---------- 端子：真鍮っぽいボルト＋ミントの輪（呼吸するように明滅。選ぶと強く光る） ----------
  const steel = new THREE.MeshStandardMaterial({ map: tex.steel, roughness: 0.35, metalness: 0.9, color: 0xb09060 });
  const terms = TERMS.map(([x, y], i) => {
    const g = new THREE.Group();
    g.position.set(x, y, BOARD_Z);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 6).rotateX(Math.PI / 2), steel);
    bolt.position.z = 0.03;
    g.add(bolt);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8ffe0) }));
    ring.position.z = 0.012;
    g.add(ring);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.term = i;
    g.add(hit);
    scene.add(g);
    return { g, ring, hit, p: new THREE.Vector3(x, y, BOARD_Z + 0.06) };
  });

  // ---------- 電線：1本の筒を、頂点シェーダで2点のあいだに張る（たるみ・振動・光の脈） ----------
  const tube = new THREE.CylinderGeometry(1, 1, 1, 8, 64, true).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);   // x：0..1 が電線の長さ
  const wireVert = /* glsl */ `
    uniform vec3 uA, uB; uniform float uSag, uVib, uT, uR;
    varying float vU;
    void main(){
      float u = position.x; vU = u;
      vec3 p = mix(uA, uB, u);
      float bow = 4.0 * u * (1.0 - u);
      p += vec3(0.0, -1.0, 0.35) * uSag * bow;                         // たるみ（少し手前にふくらむ）
      p += vec3(0.0, 1.0, 0.0) * uVib * sin(3.14159 * u) * sin(uT * 70.0);   // 弾いた振動
      p += vec3(0.0, position.y, position.z) * uR;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`;
  const wireFrag = /* glsl */ `
    uniform float uGlow, uPulse, uDash; varying float vU;
    void main(){
      if (uDash > 0.5 && fract(vU * 24.0) > 0.55) discard;            // 張る前の下書きは点線
      float head = exp(-abs(vU - uPulse) * 14.0);
      vec3 col = vec3(0.02) + vec3(0.6, 1.0, 0.75) * (uGlow + head * 1.5);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const makeWire = () => {
    const u = { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uSag: { value: 0 }, uVib: { value: 0 }, uT: { value: 0 }, uR: { value: 0.012 }, uGlow: { value: 0.3 }, uPulse: { value: -1 }, uDash: { value: 0 } };
    const m = new THREE.Mesh(tube, new THREE.ShaderMaterial({ uniforms: u, vertexShader: wireVert, fragmentShader: wireFrag }));
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    return { m, u };
  };
  const wires = [makeWire(), makeWire(), makeWire()], preview = makeWire();
  preview.u.uDash.value = 1; preview.u.uR.value = 0.006;
  const wireLight = new THREE.PointLight(0xc8ffe0, 0, 3, 1.6);
  scene.add(wireLight);

  // ---------- 床の紙切れ：ポスターを 6×10 に切った断片（組み上がると1枚になる）。1つの式で全部動かす ----------
  const tileGeo = new THREE.PlaneGeometry(TILE, TILE);
  const aTile = new Float32Array(N_TILE * 2);
  for (let i = 0; i < N_TILE; i++) { aTile[i * 2] = (i % COLS) / COLS; aTile[i * 2 + 1] = Math.floor(i / COLS) / ROWS; }
  tileGeo.setAttribute('aTile', new THREE.InstancedBufferAttribute(aTile, 2));
  const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, color: 0xd8d2c8, emissive: 0xffffff, emissiveIntensity: 0 });
  tileMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec2 aTile;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vMapUv = vMapUv * vec2(${(1 / COLS).toFixed(6)}, ${(1 / ROWS).toFixed(6)}) + aTile;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= diffuseColor.rgb;');
  };
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, N_TILE);
  tiles.frustumCulled = false;
  scene.add(tiles);
  const seeds = [...Array(N_TILE)].map((_, i) => { let a = 900 + i; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; r(); return [r(), r(), r(), r(), r()]; });
  const POSTER_Y = 1.38, POSTER_Z = 0.9;
  const dummy = new THREE.Object3D(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler();
  function placeTiles(e, t) {
    for (let i = 0; i < N_TILE; i++) {
      const [a, b, c, d, f] = seeds[i];
      const col = i % COLS, row = Math.floor(i / COLS);
      // 床：手前に散らばって、ときどき風でめくれる
      const fx = (a - 0.5) * 3.4, fz = 0.15 + b * 1.1, fr = c * Math.PI * 2;
      const flut = Math.max(0, Math.sin(t * (0.7 + d) + i * 1.7)) ** 8 * 0.25;
      // 空中の1枚：列と行の位置へ（下の行ほど先に飛ぶ）
      const gx = (col + 0.5) * TILE - COLS * TILE / 2, gy = POSTER_Y + (row + 0.5) * TILE - ROWS * TILE / 2;
      const k0 = FLY.up + (row / ROWS) * 0.5 + f * 0.25;
      const k = e < 0 ? 0 : Math.max(0, Math.min(1, (e - k0) / 0.75));
      const ek = 1 - (1 - k) ** 3;
      dummy.position.set(fx + (gx - fx) * ek, 0.004 + flut * 0.1 + (gy - 0.004) * ek + Math.sin(k * Math.PI) * 0.6, fz + (POSTER_Z - fz) * ek);
      qa.setFromEuler(eu.set(-Math.PI / 2 + flut, 0, fr));
      qb.setFromEuler(eu.set(0, 0, 0));
      dummy.quaternion.slerpQuaternions(qa, qb, ek);
      dummy.rotateY(Math.sin(k * Math.PI) * (d - 0.5) * 6);
      dummy.scale.setScalar(1.002);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
    }
    tiles.instanceMatrix.needsUpdate = true;
  }

  // ---------- 光 ----------
  scene.add(new THREE.HemisphereLight(0x2a3a44, 0x080808, 0.5));
  const lamp = new THREE.SpotLight(0xffe2b8, 18, 9, 0.8, 0.6, 1.3);
  lamp.position.set(0.2, 3.6, 1.6);
  lamp.target.position.set(0, 0.8, -0.2);
  scene.add(lamp, lamp.target);
  const accent = new THREE.PointLight(0xff481b, 7, 7, 1.4);
  accent.position.set(-2.6, 0.5, 1.2);
  scene.add(accent);

  // ---------- けもの：配電盤の上 → 張った電線に飛び乗る ----------
  const mon = createCreature({ envMap: env, glowScale: 0.45 });
  mon.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.4; });
  const holder = new THREE.Group();
  holder.add(mon.group);
  holder.scale.setScalar(0.42);
  scene.add(holder);
  const rim = new THREE.PointLight(0xc8ffe0, 1.4, 1.2, 1.6);
  scene.add(rim);
  const HOME = new THREE.Vector3(0.55, 2.38, BOARD_Z + 0.05);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 60);
  const ray = new THREE.Raycaster(), hits = terms.map((x) => x.hit);
  const boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(BOARD_Z + 0.06));

  // 状態：張った電線 { a, b, at, note }、選んでいる端子、指している点
  const st = { t: 0, enterAt: 0, wires: [], sel: null, pointer: new THREE.Vector3(0, 1.4, BOARD_Z + 0.06) };
  let bgm = null;
  const lenOf = (a, b) => terms[a].p.distanceTo(terms[b].p);
  const noteOf = (len) => Math.max(0, Math.min(5, Math.floor((2.4 - len) / 2.0 * 6)));   // 短いほど高い音
  const sagOf = (len) => 0.06 + len * 0.05;
  const finalAt = () => (st.wires.length >= NEED ? st.wires[NEED - 1].at + PLUCK : null);
  const ease = (x) => x * x * (3 - 2 * x);
  const mid = new THREE.Vector3(), from = new THREE.Vector3();
  // 電線 j の真ん中（たるんだ所）＝けものが乗る場所
  const midOf = (w, out) => out.copy(terms[w.a].p).add(terms[w.b].p).multiplyScalar(0.5).add(new THREE.Vector3(0, -1, 0.35).multiplyScalar(sagOf(lenOf(w.a, w.b)) * 1.25));

  function draw(look) {
    const t = st.t, F = finalAt(), e = F === null ? -1 : t - F;
    // 端子：選んでいる所と、つないだ所が強く光る
    terms.forEach((x, i) => {
      const used = st.wires.some((w) => w.a === i || w.b === i);
      const on = st.sel === i ? 2.2 : used ? 1.4 : 0.35 + 0.35 * Math.max(0, Math.sin(t * 2.5 + i * 1.3));
      x.ring.material.color.setRGB(0.78 * on, 1.0 * on, 0.86 * on);
    });
    // 電線：張った瞬間に端から光が走る。けものが弾くと振動して、光の脈が流れる
    let glowSum = 0;
    wires.forEach((wr, j) => {
      const w = st.wires[j];
      wr.m.visible = !!w && t >= w.at;
      if (!wr.m.visible) return;
      const s = t - w.at, len = lenOf(w.a, w.b);
      wr.u.uA.value.copy(terms[w.a].p); wr.u.uB.value.copy(terms[w.b].p);
      const loaded = j === st.wires.length - 1 && s > HOP ? 1.25 : 1;   // けものが乗っている電線は深くたわむ
      wr.u.uSag.value = sagOf(len) * (Math.min(1, s / 0.25)) * loaded;
      const plucks = [w.at + PLUCK];
      if (F !== null) plucks.push(F);
      let vib = 0, pulse = -1;
      for (const p of plucks) { const ps = t - p; if (ps >= 0 && ps < 2.5) { vib = Math.max(vib, Math.exp(-ps * 3) * 0.035); pulse = (ps * 1.4) % 1.2; } }
      wr.u.uVib.value = vib; wr.u.uT.value = t;
      wr.u.uPulse.value = s < 0.3 ? s / 0.3 : pulse;
      wr.u.uGlow.value = 0.25 + vib * 12 + (e >= 0 ? Math.exp(-e * 2) * 0.8 : 0);
      glowSum += wr.u.uGlow.value;
    });
    // 下書きの点線：選んだ端子から、指している所まで
    preview.m.visible = st.sel !== null && st.wires.length < NEED;
    if (preview.m.visible) { preview.u.uA.value.copy(terms[st.sel].p); preview.u.uB.value.copy(st.pointer); preview.u.uSag.value = 0.04; preview.u.uGlow.value = 0.7; }
    // けもの：最後に張った電線の真ん中へ飛び乗る（前の場所から弧を描いて）
    const last = st.wires.length - 1;
    if (last < 0) holder.position.copy(HOME);
    else {
      const w = st.wires[last], s = t - w.at;
      if (last === 0) from.copy(HOME); else midOf(st.wires[last - 1], from);
      midOf(w, mid);
      const k = ease(Math.max(0, Math.min(1, s / HOP)));
      holder.position.lerpVectors(from, mid, k);
      holder.position.y += Math.sin(k * Math.PI) * 0.35 + (s > HOP ? -Math.exp(-(s - HOP) * 8) * 0.05 : 0);
    }
    const sinceP = (() => { let best = -1; for (const w of st.wires) { const ps = t - (w.at + PLUCK); if (ps >= 0 && (best < 0 || ps < best)) best = ps; } return best; })();
    holder.rotation.y = Math.sin(t * 0.7) * 0.2;
    rim.position.set(holder.position.x - 0.2, holder.position.y + 0.4, holder.position.z - 0.3);
    mon.update({ t, power: 0.3 + 0.2 * st.wires.length, sinceImpact: e >= 0 ? e : sinceP >= 0 && sinceP < 0.8 ? sinceP : -1, look: st.sel !== null ? { x: (st.pointer.x - holder.position.x) * 0.5, y: (st.pointer.y - holder.position.y) * 0.6 } : look });
    wireLight.position.copy(holder.position).add(new THREE.Vector3(0, -0.1, 0.2));
    wireLight.intensity = Math.min(4, glowSum * 1.2);
    // 紙切れ：3本目を弾いた瞬間、跳ね上がって1枚に組み上がる。組み上がったら紙が少し光る
    placeTiles(e, t);
    tileMat.emissiveIntensity = e < FLY.done ? 0 : Math.min(0.35, (e - FLY.done) * 0.6);
    // カメラ：配電盤の正面。組み上がったら紙へ少し寄る
    const intro = ease(Math.min(1, (t - st.enterAt) / 1.0));
    const zoom = e < 0 ? 0 : ease(Math.max(0, Math.min(1, (e - 1.2) / 1.2)));
    const shake = e >= 0 ? Math.exp(-e * 5) * 0.04 : 0;
    camera.position.set(look.x * 0.3 * (1 - zoom) + Math.sin(t * 59) * shake, 1.6 + look.y * 0.15 * (1 - zoom) - 0.15 * zoom, 4.5 - 0.5 * intro - 0.3 * zoom);
    camera.lookAt(0, 1.3 + 0.08 * zoom, -0.4 + 1.2 * zoom);
    const wipe = t - st.enterAt < 0.5 ? 0.5 + (t - st.enterAt) : e >= FLY.wipe ? Math.min(0.5, (e - FLY.wipe) / 0.5 * 0.5) : 0;
    return { hit: e >= 0 ? Math.exp(-e * 4) * 0.5 : 0, power: 0.3 + 0.15 * st.wires.length, wipe };
  }

  return {
    scene, camera, hint: 'CONNECT',
    setQuality() {},
    reset() { Object.assign(st, { t: 0, enterAt: 0, wires: [], sel: null }); },
    enter() {
      tileMat.map = getPoster(); tileMat.needsUpdate = true;
      this.leave();
      bgm = sfx('bgm_room', { gain: 0.55, loop: true, lowpass: 900 });   // 音の消えた倉庫：遠くでこもって鳴るだけ
      sfx('rattle', { gain: 0.4 });
    },
    leave() { bgm?.stop(0.3); bgm = null; },
    down(ndc) {
      if (st.wires.length >= NEED || !ndc) return;
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(hits, false)[0];
      const i = h ? h.object.userData.term : null;
      if (i === null) { st.sel = null; return; }
      if (st.sel === null || st.sel === i) { st.sel = i; sfx('snap', { gain: 0.5 }); return; }
      const a = st.sel, b = i;
      if (st.wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) { st.sel = i; return; }
      st.wires.push({ a, b, at: st.t, note: noteOf(lenOf(a, b)) });
      st.sel = null;
      sfx('zip', { gain: 0.9 });
    },
    up() {},
    move(ndc) {
      if (!ndc) return;
      ray.setFromCamera(ndc, camera);
      ray.ray.intersectPlane(boardPlane, st.pointer);
    },
    tick(dt) {
      const prev = st.t;
      st.t += dt;
      const at = (x) => prev < x && st.t >= x;
      st.wires.forEach((w, j) => {
        if (at(w.at + HOP)) sfx('snap', { gain: 0.6 });                                            // 飛び乗る
        if (at(w.at + PLUCK) && j < NEED - 1) sfx(`wire${w.note}`, { gain: 1.0, pan: (terms[w.a].p.x + terms[w.b].p.x) / 4 });   // しっぽで弾く
      });
      const F = finalAt();
      if (F !== null) {
        // 3本目：3本いっしょに鳴らす（和音）→ 紙が跳ね上がる
        if (at(F)) { st.wires.forEach((w) => sfx(`wire${w.note}`, { gain: 0.9 })); sfx('impact', { gain: 0.5 }); bgm?.filter && (bgm.filter.frequency.value = 18000); }
        if (at(F + FLY.up)) sfx('feed', { gain: 1.2 });
        if (at(F + FLY.done - 0.1)) { sfx('press3', { gain: 0.8 }); }
        if (st.t - F >= FLY.end) return 'exit';
      }
      return null;
    },
    progress() { return finalAt() === null ? st.wires.length / NEED : 0; },
    busy() { return finalAt() !== null; },
    draw,
    state: () => ({ wires: st.wires.length, sel: st.sel, done: finalAt() !== null, terms: terms.map((x) => { const v = x.p.clone().project(camera); return [v.x, v.y]; }) }),
    // ?mode=render 用：0.6 / 1.8 / 3.0 秒に張る
    script(t) {
      this.reset();
      st.t = t; st.enterAt = -10;
      [[0.6, 0, 5], [1.8, 2, 7], [3.0, 4, 3]].forEach(([at, a, b]) => { if (t >= at) st.wires.push({ a, b, at, note: noteOf(lenOf(a, b)) }); });
      if (!tileMat.map) { tileMat.map = getPoster(); tileMat.needsUpdate = true; }
    },
    dust: null,
  };
}
