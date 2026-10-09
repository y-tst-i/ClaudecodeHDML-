import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { frag as filmFrag } from '../film.js';

// ブラウン管の部屋：積み上がったテレビ、床、壁、光。
// 絵は update({ t, power, hit, sinceImpact }) の値だけで決まる（前のフレームの状態を持たない）。

export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------- テレビに映す映像：映像版 C1 のシェーダーをそのまま画面用の絵（RenderTarget）に描く ----------
function createSignal(renderer, tex, w = 960, h = 540) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  const dummy = new THREE.DataTexture(new Uint8Array([40, 40, 40, 255]), 1, 1); dummy.needsUpdate = true;
  const uniforms = { uT: { value: 0 }, uRes: { value: new THREE.Vector2(960, 540) } };
  for (const k of ['tA', 'tB', 'tD', 'tWall', 'tPaper', 'tMetal', 'tCrt', 'tGrain']) uniforms[k] = { value: tex[k] ?? dummy };
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: filmFrag, depthTest: false, depthWrite: false }));
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.Camera();
  return {
    texture: rt.texture,
    render(t) {
      uniforms.uT.value = t;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
    },
  };
}

// ---------- 画面のガラス：電源の入り方（横線から開く）、砂嵐、走査線、指紋 ----------
const screenVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const screenFrag = /* glsl */ `
precision highp float;
uniform sampler2D uRT, uSmudge;
uniform float uT, uOn, uStatic, uFlash, uSeed, uGain;
uniform float uRipple;   // けものが飛び込んでからの秒（負なら無し）
uniform vec3 uTint;
uniform vec4 uCrop;   // xy = 中心, z = 拡大率（テレビごとに映す範囲を変える）
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 c = vUv - 0.5;
  c *= 1.0 + dot(c, c) * 0.18;
  vec2 u = c + 0.5;
  float inside = step(0.0, u.x) * step(u.x, 1.0) * step(0.0, u.y) * step(u.y, 1.0);
  // 映像（RenderTarget は表示用の値なので、明るさの計算用に戻す）
  // 飛び込んだ所から波紋が広がる（画面の中身がゆがみ、波の頭が光る）
  float rip = 0.0;
  if (uRipple >= 0.0) {
    vec2 rc = u - vec2(0.5, 0.45);
    float rd = length(rc * vec2(1.33, 1.0));
    float front = uRipple * 0.9;
    float w = sin((rd - front) * 70.0) * exp(-abs(rd - front) * 9.0) * exp(-uRipple * 1.2);
    u += normalize(rc + 1e-4) * w * 0.025;
    rip = max(w, 0.0);
  }
  vec2 cu = (u - 0.5) / uCrop.z + uCrop.xy;
  // 縦ロール（同期が外れた古いテレビ）
  cu.y = fract(cu.y + uCrop.w * uT);
  vec3 img = pow(max(texture2D(uRT, cu).rgb, 0.0), vec3(2.2)) * uTint;
  // 砂嵐（粗い粒、横にすこし流れる）
  float n = hash(floor(u * vec2(220.0, 160.0)) + floor(uT * 30.0) * 7.31 + uSeed);
  vec3 stat = vec3(0.55, 0.62, 0.6) * n * (0.7 + 0.3 * sin(u.y * 40.0 + uT * 20.0));
  vec3 col = mix(img, stat, uStatic);
  // 電源が入る：中央の横線から上下に開く。開ききる前は横線が白く光る
  float open = smoothstep(uOn * 0.5 + 0.004, uOn * 0.5 - 0.004, abs(u.y - 0.5));
  float line = exp(-abs(u.y - 0.5) * 160.0) * step(0.001, uOn) * (1.0 - uOn) * 6.0;
  col = col * open + vec3(0.8, 1.0, 0.9) * line;
  col *= 0.8 + 0.2 * sin(u.y * 540.0);        // 走査線
  col += vec3(0.9, 1.0, 0.95) * uFlash * (0.4 + 0.6 * open);   // 衝撃の白
  col += vec3(0.8, 1.0, 0.9) * rip * 1.5;
  col *= inside * uGain;
  col = col / (1.0 + 0.1 * max(max(col.r, col.g), col.b));   // 明るすぎる所はなだらかに頭打ち（白飛びで形が消えないように）
  // ガラス：消えていても、うっすら映り込みと指紋が見える
  float sm = texture2D(uSmudge, vUv).r;
  vec3 glass = vec3(0.012, 0.014, 0.014) + vec3(0.05, 0.06, 0.06) * sm * (0.25 + 0.75 * clamp(uOn, 0.0, 1.0));
  float edge = smoothstep(0.5, 0.35, max(abs(c.x), abs(c.y)));
  gl_FragColor = vec4(col + glass * (0.6 + 0.4 * edge), 1.0);
}`;

export async function createWorld(renderer, files) {
  RectAreaLightUniformsLib.init();
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb, repeat = 1) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    return t;
  };
  const tex = {
    logoD: await load(files.logoD, false), crt: await load(files.crt, false), grain: await load(files.grain, false),
    logoA: await load(files.logoA, false), logoB: await load(files.logoB, false), street: await load(files.street, false), paper: await load(files.paper, false),
    plastic: await load(files.plastic, true), wood: await load(files.wood, true),
    floor: await load(files.floor, true, 5), floorRough: await load(files.floor, false, 5), wall: await load(files.wall, true, 3),
    smudge: await load(files.smudge, false), dust: await load(files.dust, false),
  };
  // テレビに映す3チャンネル：C1 ブラウン管のロゴ（動く）／C2 壁のスプレー／C3 印刷（どちらも完成した絵を1回だけ描く）
  const film = { tA: tex.logoA, tB: tex.logoB, tD: tex.logoD, tWall: tex.street, tPaper: tex.paper, tCrt: tex.crt, tGrain: tex.grain };
  const signal = createSignal(renderer, film);
  const chStreet = createSignal(renderer, film, 640, 360);
  const chPrint = createSignal(renderer, film, 640, 360);
  chStreet.render(5.95);
  chPrint.render(8.9);
  const channels = [signal.texture, chStreet.texture, chPrint.texture];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  scene.fog = new THREE.FogExp2(0x020203, 0.07);

  // 床と壁
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.7, metalness: 0.0, color: 0x2a2a2a }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // 濡れた床：画面の光が1台ずつにじんで映り込む（鏡像を床の凹凸でゆらし、縦にぼかして、足し算で重ねる）
  const wet = new Reflector(new THREE.PlaneGeometry(40, 40), {
    textureWidth: 960, textureHeight: 540, clipBias: 0.003,
    shader: {
      name: 'WetFloor',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tFloor: { value: null }, uStrength: { value: 1.1 } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vFloor; varying vec3 vWorld;
        void main(){ vUv = textureMatrix * vec4(position, 1.0); vFloor = uv * 40.0 / 8.0; vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse, tFloor; uniform float uStrength; varying vec4 vUv; varying vec2 vFloor; varying vec3 vWorld;
        void main(){
          float f = texture2D(tFloor, vFloor).g;
          vec2 uv = vUv.xy / vUv.w;
          uv.x += (f - 0.5) * 0.02;
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 6; i++) acc += texture2D(tDiffuse, uv + vec2(0.0, float(i) * 0.006 * (0.4 + f))).rgb;
          acc /= 6.0;
          float wetness = smoothstep(0.25, 0.65, f);          // 凹みに水がたまっている所だけ強く映る
          float fade = exp(-max(vWorld.z + 1.0, 0.0) * 0.35);  // 壁から離れるほど弱く
          gl_FragColor = vec4(acc * uStrength * mix(0.25, 1.0, wetness) * fade, 1.0);
        }`,
    },
  });
  wet.material.uniforms.tFloor.value = tex.floorRough;
  wet.material.transparent = true;
  wet.material.blending = THREE.AdditiveBlending;
  wet.material.depthWrite = false;
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.002;
  scene.add(wet);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.9, color: 0x7a7a7a }));
  wall.position.set(0, 6, -1.6);
  scene.add(wall);

  // ---------- テレビを積む（種つき乱数で毎回同じ配置） ----------
  const rnd = mulberry32(7);
  const matPlastic = new THREE.MeshStandardMaterial({ map: tex.plastic, roughness: 0.48, metalness: 0.05 });
  const matWood = new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.6, metalness: 0.0 });
  const matKnob = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.4 });
  const matGrill = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.8 });
  const knobGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.03, 20).rotateX(Math.PI / 2);
  const tvs = [];

  function makeTV(w, h, d, wood, channel = 0) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h) * 0.08), wood ? matWood : matPlastic);
    g.add(body);
    // 正面：左に画面、右につまみの列（木目のテレビだけ）
    const panel = wood ? w * 0.22 : 0;
    const sw = (w - panel) * 0.82, sh = h * 0.76;
    const geo = new THREE.PlaneGeometry(sw, sh, 18, 14);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {   // ブラウン管のふくらみ
      const x = pos.getX(i) / (sw / 2), y = pos.getY(i) / (sh / 2);
      pos.setZ(i, 0.05 * Math.min(w, h) * (1 - x * x * 0.6) * (1 - y * y * 0.6));
    }
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      vertexShader: screenVert, fragmentShader: screenFrag,
      uniforms: { uRT: { value: channels[channel] }, uSmudge: { value: tex.smudge }, uTint: { value: new THREE.Color(1, 1, 1) }, uCrop: { value: new THREE.Vector4(0.5, 0.5, 1, 0) }, uT: { value: 0 }, uOn: { value: 0 }, uStatic: { value: 1 }, uFlash: { value: 0 }, uSeed: { value: rnd() * 100 }, uGain: { value: 1 }, uRipple: { value: -1 } },
    });
    const screen = new THREE.Mesh(geo, mat);
    screen.position.set(-panel / 2, 0, d / 2 - 0.005);
    g.add(screen);
    // 画面のまわりの黒い縁（くぼみに見せる）
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(sw + 0.06, sh + 0.06, 0.02, 2, 0.02), matGrill);
    bezel.position.set(-panel / 2, 0, d / 2 - 0.012);
    g.add(bezel);
    if (wood) {
      for (let k = 0; k < 2; k++) {
        const kn = new THREE.Mesh(knobGeo, matKnob);
        kn.position.set(w / 2 - panel / 2, h * 0.22 - k * h * 0.22, d / 2 + 0.01);
        g.add(kn);
      }
      for (let k = 0; k < 6; k++) {   // スピーカーの溝
        const gr = new THREE.Mesh(new THREE.BoxGeometry(panel * 0.6, 0.008, 0.01), matGrill);
        gr.position.set(w / 2 - panel / 2, -h * 0.18 - k * 0.03, d / 2 + 0.002);
        g.add(gr);
      }
    }
    return { group: g, screen, mat, w, h, d };
  }

  // 主役：手前中央の大きいテレビ（ロゴが組み上がる）
  const hero = makeTV(1.5, 1.12, 1.0, true);
  hero.group.position.set(0, 0.56, 1.05);
  hero.group.rotation.y = -0.04;
  hero.hero = true;
  scene.add(hero.group);
  tvs.push(hero);
  // 後ろの壁：段ごとに左右へ詰めて積む
  let base = new Array(28).fill(0);   // 横方向 0.25 刻みの「その列の高さ」
  const X0 = -3.5, CELL = 0.25;
  for (let n = 0; n < 34; n++) {
    const h = 0.48 + rnd() * 0.42, wood = rnd() < 0.45, w = h * (wood ? 1.6 : 1.3), d = 0.55 + rnd() * 0.2;
    const cells = Math.ceil(w / CELL);
    // いちばん低く置ける場所を探す
    let best = 0, bestY = 1e9;
    for (let c = 0; c + cells <= base.length; c++) {
      const y = Math.max(...base.slice(c, c + cells)) + (rnd() - 0.5) * 0.01;
      if (y < bestY - 0.05) { bestY = y; best = c; }
    }
    if (bestY > 3.6) break;
    for (let c = best; c < best + cells; c++) base[c] = bestY + h + 0.01;
    const r = rnd();
    const tv = makeTV(w, h, d, wood, r < 0.55 ? 0 : r < 0.8 ? 1 : 2);
    // テレビごとに、映す範囲（寄り）・色味・縦ロールを変える（同じ絵の壁紙に見せない）
    const cu = tv.mat.uniforms;
    const zoom = rnd() < 0.4 ? 1.6 + rnd() * 1.8 : 1.0;
    cu.uCrop.value.set(0.5 + (rnd() - 0.5) * (1 - 1 / zoom), 0.5 + (rnd() - 0.5) * (1 - 1 / zoom), zoom, rnd() < 0.12 ? 0.15 + rnd() * 0.3 : 0);
    const warm = rnd();
    cu.uTint.value.setRGB(0.85 + warm * 0.3, 0.95, 1.1 - warm * 0.3);
    tv.group.position.set(X0 + (best + cells / 2) * CELL, bestY + h / 2, -0.9 + (rnd() - 0.5) * 0.25);
    tv.group.rotation.y = (rnd() - 0.5) * 0.18;
    tv.group.rotation.z = (rnd() - 0.5) * 0.02;
    scene.add(tv.group);
    tvs.push(tv);
  }
  // 電源が入る順番：主役 → 主役に近い順
  const heroPos = new THREE.Vector3(0, 1.2, -0.9);
  tvs.forEach((tv) => { tv.dist = tv.hero ? -1 : tv.group.position.distanceTo(heroPos); });
  const order = [...tvs].sort((a, b) => a.dist - b.dist);
  order.forEach((tv, i) => { tv.threshold = tv.hero ? 0.02 : 0.08 + 0.84 * (i / (order.length - 1)); tv.pan = clamp01((tv.group.position.x + 3.5) / 7) * 2 - 1; });

  // ---------- 光 ----------
  scene.add(new THREE.HemisphereLight(0x223038, 0x050505, 0.12));
  // 画面の光が部屋を照らす（明るさは点いている画面の量に比例）
  const screenLight = new THREE.RectAreaLight(0xc8ffe0, 0, 7.5, 3.6);
  screenLight.position.set(0, 1.9, 0.0);
  screenLight.lookAt(0, 1.4, 6);
  scene.add(screenLight);
  const heroLight = new THREE.RectAreaLight(0xc8ffe0, 0, 1.2, 0.9);
  heroLight.position.set(0, 0.6, 1.6);
  heroLight.lookAt(0, 0.8, 6);
  scene.add(heroLight);
  // 差し色：左奥のオレンジ（テーマカラー #FF481B）
  const accent = new THREE.PointLight(0xff481b, 14, 10, 1.4);
  accent.position.set(-3.6, 0.35, 2.2);
  scene.add(accent);
  // 外装を見せるための弱い正面光（カメラの上から）
  const key = new THREE.DirectionalLight(0x9fb4c0, 0.22);
  key.position.set(1.5, 4, 8);
  scene.add(key);

  return {
    scene, tvs, tex, hero,
    // 画質の段階：2（LOW）では床の映り込み（場面をもう1回描く重い処理）を止める
    setQuality(q) { wet.visible = q < 2; },
    // 絵の状態を決める。power 0..1（溜まり具合）、sinceImpact（衝撃からの秒。衝撃前は負）
    update({ t, power, sinceImpact, bite = false }) {
      const impacted = sinceImpact >= 0;
      const hit = impacted ? Math.exp(-sinceImpact * 5) : 0;
      // 主役の画面の中身：衝撃までは溜まり具合で帯が組み上がる。衝撃後は映像の 2.0〜2.95 秒
      const tC1 = impacted ? Math.min(2.95, 2.0 + sinceImpact) : 0.35 + Math.min(power, 1) * 1.6;
      signal.render(tC1);
      let lit = 0;
      for (const tv of tvs) {
        const u = tv.mat.uniforms;
        // bite：けものが光を食べている間は、主役以外は点かない（くしゃみで一斉に点く）
        const p = impacted ? 1 : bite && !tv.hero ? 0 : power;
        const on = clamp01((p - tv.threshold) / 0.035);
        // 点いた直後は砂嵐 → 映像へ。衝撃後は拍ごとに1台ずつ砂嵐が走る
        let stat = 1 - clamp01((p - tv.threshold - 0.035) / 0.12);
        if (tv.hero) stat *= 0.15;
        if (impacted) {
          const beat = Math.floor((sinceImpact + 0.6) * 2);
          stat = hash(beat, tvs.indexOf(tv)) > 0.92 && sinceImpact > 0.6 ? 0.85 : 0;
        }
        // 溜めている最中は電圧が不安定でちらつく
        const flick = impacted ? 1 : 0.75 + 0.25 * hash(Math.floor(t * 24), tv.mat.uniforms.uSeed.value);
        u.uT.value = t;
        u.uOn.value = on;
        u.uStatic.value = stat;
        u.uFlash.value = hit * 0.45;
        u.uGain.value = (tv.hero ? 1.0 : 0.8) * flick * (1 + hit * 0.4) * (bite && tv.hero && !impacted ? 1 - power * 0.7 : 1);
        lit += on * (tv.hero ? 3 : 1);
      }
      const avg = lit / (tvs.length + 2);
      screenLight.intensity = (avg * 1.4 + hit * 2) * (impacted ? 1 : 0.8 + 0.2 * hash(Math.floor(t * 24), 3));
      heroLight.intensity = clamp01((impacted ? 1 : power) / 0.1) * (2.5 + hit * 3);
      accent.intensity = 12 + power * 6;
      return { hit };
    },
  };
}
