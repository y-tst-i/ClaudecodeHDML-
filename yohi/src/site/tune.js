import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sfx } from '../audio.js';

// 場面2：夜の巻き取り（GPT 案）。飛び込んだテレビの中には、もう1台の大きなテレビ。映っているのは次の場面（路地）だが、
// 縦の同期が外れて画面がずっと流れている。スクロール（またはドラッグ）で「縦の同期」つまみを回して絵を止めると、
// 一拍おいて、路地の絵が紙になって画面から引き出され、床に落ちる → その紙に飛び込むと、本物の路地。
// 絵は state（t, 縦のずれ, 止まった時刻）だけで決まる。画面の中身は路地の場面をそのまま描いたもの（けものも中にいる）。
const DRIFT = 0.11;          // 何もしないときに流れる速さ（画面の高さ／秒）
const MAGNET = 0.07;         // ここまで近づくと、吸い付くように止まりに行く
const LOCK_IN = 0.012, LOCK_HOLD = 0.35;
const PULL = { freeze: 0.35, out: 1.25, dive: 1.45, end: 2.5 };   // 止まってからの秒

export async function createTune(renderer, env, { inner }) {
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
    wood: await load(new URL('../../assets/room/tv_wood.webp', import.meta.url).href),
    floor: await load(new URL('../../assets/room/floor_concrete.webp', import.meta.url).href, true, 5),
    wall: await load(new URL('../../assets/room/wall_dark.webp', import.meta.url).href, true, 3),
    smudge: await load(new URL('../../assets/room/glass_smudge.webp', import.meta.url).href, false),
    grain: await load(new URL('../../assets/tex/riso_grain.webp', import.meta.url).href, false),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  scene.fog = new THREE.FogExp2(0x020203, 0.1);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.35, color: 0x3a3a3a }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.9, color: 0x555555 }));
  wall.position.set(0, 5, -1.4);
  scene.add(wall);

  // ---------- 大きな木目のテレビ（右に「縦の同期」つまみ） ----------
  const W = 2.5, H = 1.75, D = 1.2, SW = 1.72, SH = 1.29;
  const tv = new THREE.Group();
  tv.position.set(0, H / 2 + 0.02, 0);
  scene.add(tv);
  tv.add(new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.12), new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.6 })));
  const rtW = 960, rtH = 540;
  const rt = new THREE.WebGLRenderTarget(rtW, rtH, { type: THREE.HalfFloatType });
  const screenU = { uRT: { value: rt.texture }, uSmudge: { value: tex.smudge }, uOff: { value: 0.3 }, uT: { value: 0 }, uLock: { value: 0 }, uFlash: { value: 0 }, uEmpty: { value: 0 } };
  const sgeo = new THREE.PlaneGeometry(SW, SH, 20, 16);
  const sp = sgeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) / (SW / 2), y = sp.getY(i) / (SH / 2); sp.setZ(i, 0.08 * (1 - x * x * 0.6) * (1 - y * y * 0.6)); }
  sgeo.computeVertexNormals();
  const screen = new THREE.Mesh(sgeo, new THREE.ShaderMaterial({
    uniforms: screenU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uRT, uSmudge; uniform float uOff, uT, uLock, uFlash, uEmpty; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5; c *= 1.0 + dot(c, c) * 0.16; vec2 u = c + 0.5;
        float inside = step(0.0, u.x) * step(u.x, 1.0) * step(0.0, u.y) * step(u.y, 1.0);
        float mis = 1.0 - uLock;
        // 縦の同期が外れている：絵が縦に流れ、つなぎ目に黒い帯（帰線）が出る。外れているほど横にもよれる
        float yy = fract(u.y + uOff);
        float x = u.x + sin(u.y * 38.0 + uT * 23.0) * 0.006 * mis + (hash(vec2(floor(u.y * 120.0), floor(uT * 20.0))) - 0.5) * 0.012 * mis * step(0.92, hash(vec2(floor(uT * 9.0), 3.0)));
        vec3 img = texture2D(uRT, vec2(x, yy)).rgb;
        img *= 1.25;   // 中身は明るさそのままの値（仕上げで全体と一緒に色を整える）
        float bar = smoothstep(0.0, 0.012, yy) * smoothstep(1.0, 0.95, yy);   // 帰線の黒い帯
        img *= mix(1.0, bar, mis > 0.001 ? 1.0 : 0.0);
        img += vec3(0.7, 1.0, 0.85) * exp(-abs(yy - 0.975) * 300.0) * 0.4 * mis;   // 帯のふちの同期信号（白い線）
        float n = hash(floor(u * vec2(240.0, 180.0)) + floor(uT * 30.0) * 7.0);
        vec3 stat = vec3(0.55, 0.65, 0.6) * n;
        vec3 col = mix(img, stat, 0.1 * mis + uEmpty * 0.85);
        col *= 0.82 + 0.18 * sin(u.y * 620.0);                          // 走査線
        col += vec3(0.8, 1.0, 0.9) * uFlash;
        col *= inside;
        float sm = texture2D(uSmudge, vUv).r;
        col += vec3(0.04, 0.05, 0.05) * sm + vec3(0.012);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  screen.position.set(-0.3, 0.02, D / 2 - 0.01);
  tv.add(screen);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(SW + 0.08, SH + 0.08, 0.02, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.8 }));
  bezel.position.set(-0.3, 0.02, D / 2 - 0.02);
  tv.add(bezel);
  // つまみ（上が縦の同期。スクロールで回る）。オレンジの目盛りがこの場面の差し色
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.4 });
  const knob = new THREE.Group();
  knob.position.set(W / 2 - 0.22, 0.32, D / 2 + 0.02);
  tv.add(knob);
  knob.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 32).rotateX(Math.PI / 2), knobMat));
  const tickMark = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.01), new THREE.MeshStandardMaterial({ color: 0xff481b, emissive: 0xff481b, emissiveIntensity: 0.8 }));
  tickMark.position.set(0, 0.05, 0.035);
  knob.add(tickMark);
  const knob2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.05, 32).rotateX(Math.PI / 2), knobMat);
  knob2.position.set(W / 2 - 0.22, 0.02, D / 2 + 0.02);
  tv.add(knob2);
  for (let k = 0; k < 6; k++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.01), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.8 }));
    g.position.set(W / 2 - 0.22, -0.3 - k * 0.05, D / 2 + 0.002);
    tv.add(g);
  }

  // ---------- 引き出される紙（画面と同じ絵。止まったあとだけ見える） ----------
  const sheetU = { uRT: { value: rt.texture }, uGrain: { value: tex.grain }, uCurl: { value: 0 } };
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH, 24, 24), new THREE.ShaderMaterial({
    uniforms: sheetU, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uCurl; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        // 下の端から少し丸まって、ひらひらする（uCurl 0..1）
        float k = (1.0 - uv.y);
        p.z += sin(k * 3.1416) * 0.12 * uCurl + sin(uv.x * 6.0 + k * 4.0) * 0.03 * uCurl;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uRT, uGrain; varying vec2 vUv;
      void main(){
        vec3 img = texture2D(uRT, vUv).rgb * 1.25;
        float g = texture2D(uGrain, vUv * 2.0).r;
        vec3 paper = vec3(0.86, 0.82, 0.74);
        vec3 col = (img + paper * 0.04) * (0.9 + 0.1 * g);
        float edge = smoothstep(0.0, 0.015, vUv.x) * smoothstep(1.0, 0.985, vUv.x) * smoothstep(0.0, 0.015, vUv.y) * smoothstep(1.0, 0.985, vUv.y);
        gl_FragColor = vec4(mix(paper, col, edge), 1.0);
      }`,
  }));
  sheet.visible = false;
  scene.add(sheet);

  // ---------- 光：画面の緑白、遠くのオレンジ ----------
  scene.add(new THREE.HemisphereLight(0x223038, 0x050505, 0.25));
  const screenLight = new THREE.PointLight(0xc8ffe0, 6, 6, 1.5);
  screenLight.position.set(-0.3, 1.0, 1.4);
  scene.add(screenLight);
  const accent = new THREE.PointLight(0xff481b, 8, 8, 1.4);
  accent.position.set(3.2, 0.4, 1.5);
  scene.add(accent);
  const key = new THREE.DirectionalLight(0x9fb4c0, 0.2);
  key.position.set(1.5, 4, 6);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 60);

  // ---------- 状態 ----------
  const st = { t: 0, enterAt: 0, off: 0.37, lockedFor: 0, lockAt: null, lastTick: 0, travel: 0, holding: false, lastY: null };
  let hum = null, music = null;
  const near = () => st.off - Math.round(st.off);   // いちばん近い「止まる位置」までのずれ（-0.5..0.5）
  const ease = (x) => x * x * (3 - 2 * x);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const scrollBy = (d) => {
    if (st.lockAt !== null) return;
    st.off += d;
    st.travel += Math.abs(d);
    if (st.travel > 0.04 && st.t - st.lastTick > 0.05) { st.travel = 0; st.lastTick = st.t; sfx('snap', { gain: 0.18, pan: 0.5 }); }   // つまみのカリカリ
  };

  function draw(look) {
    const t = st.t, e = st.lockAt === null ? -1 : t - st.lockAt;
    const seg = (a, b) => clamp01((e - a) / (b - a));
    // 画面の中身：次の場面（路地）をそのまま描く
    inner.draw({ x: 0, y: 0 });
    renderer.setRenderTarget(rt);
    renderer.render(inner.scene, inner.camera);
    renderer.setRenderTarget(null);
    const lock = st.lockAt !== null ? 1 : clamp01(1 - Math.abs(near()) / MAGNET) ** 2;
    screenU.uOff.value = st.off;
    screenU.uT.value = t;
    screenU.uLock.value = lock;
    screenU.uFlash.value = e >= 0 ? Math.exp(-e * 10) * 0.35 : 0;
    screenU.uEmpty.value = seg(PULL.freeze, PULL.freeze + 0.3);
    knob.rotation.z = -st.off * Math.PI * 2;
    // 紙：画面からはがれて手前へ、弧を描いて床へ落ち、広がる
    sheet.visible = e >= PULL.freeze;
    if (sheet.visible) {
      const k = ease(seg(PULL.freeze, PULL.out));
      sheet.position.set(-0.3 + 0.1 * k, tv.position.y + 0.02 + (0.03 - (tv.position.y + 0.02)) * k + Math.sin(k * Math.PI) * 0.25, D / 2 + 0.06 + 1.0 * k);
      sheet.rotation.set(-Math.PI / 2 * k, 0, 0.08 * Math.sin(k * Math.PI));
      sheet.scale.setScalar(1 + 0.35 * k);
      sheetU.uCurl.value = Math.sin(k * Math.PI) + (e > PULL.out ? Math.exp(-(e - PULL.out) * 6) * Math.sin((e - PULL.out) * 25) * 0.3 : 0);
    }
    // カメラ：入ってすぐは画素から抜けるように寄りから。紙が落ちたら、紙に向かって真上から飛び込む
    const intro = ease(clamp01((t - st.enterAt) / 1.2));
    const base = new THREE.Vector3(look.x * 0.35, 1.05 + look.y * 0.15, 3.0 + 0.7 * intro);
    const dive = ease(seg(PULL.dive, PULL.end));
    const shake = e >= 0 ? Math.exp(-e * 6) * 0.03 : 0;
    camera.position.copy(base).lerp(new THREE.Vector3(-0.2, 0.62, D / 2 + 1.08), dive);
    camera.position.x += Math.sin(t * 61) * shake;
    const target = new THREE.Vector3(look.x * 0.1, 0.95, 0).lerp(new THREE.Vector3(-0.2, 0.0, D / 2 + 1.06), ease(seg(PULL.out - 0.3, PULL.dive + 0.4)));
    camera.lookAt(target);
    // 入ってきた瞬間は、前の場面の画素が縮んで現れる。出るときは紙の画素に吸い込まれる
    const maskIn = Math.max(0, 1 - (t - st.enterAt) / 0.6);
    const maskOut = seg(PULL.dive + 0.5, PULL.end);
    return { hit: e >= 0 ? Math.exp(-e * 5) * 0.4 : 0, power: 0.25 + lock * 0.35, mask: Math.max(maskIn * maskIn, maskOut) };
  }

  return {
    scene, camera, hint: 'SCROLL',
    setQuality() {},
    reset() { Object.assign(st, { t: 0, enterAt: 0, off: 0.37, lockedFor: 0, lockAt: null, lastTick: 0, travel: 0, holding: false, lastY: null }); inner.reset(); },
    enter() {
      this.leave();
      sfx('rattle', { gain: 0.4 });
      hum = sfx('charge', { gain: 0, loop: true, offset: 0.2 });
      music = sfx('bgm_alley', { gain: 0.5, loop: true, lowpass: 350 });   // 画面の向こうの路地の音（こもっている）
    },
    leave() { hum?.stop(0.1); music?.stop(0.2); hum = music = null; },
    down(ndc) { st.holding = true; st.lastY = ndc?.y ?? null; },
    up() { st.holding = false; st.lastY = null; },
    move(ndc) {
      if (!st.holding || !ndc) return;
      if (st.lastY !== null) scrollBy((ndc.y - st.lastY) * 0.45);   // ドラッグでも回せる（上へ動かすと絵も上へ）
      st.lastY = ndc.y;
    },
    wheel(dy) { scrollBy(dy * 0.0006); },
    tick(dt) {
      const prev = st.t;
      st.t += dt;
      inner.tick(dt);
      if (st.lockAt === null) {
        const s = near();
        if (Math.abs(s) < MAGNET) st.off -= s * Math.min(1, dt * 5);   // 近づくと吸い付く
        else st.off += DRIFT * dt;
        st.lockedFor = Math.abs(near()) < LOCK_IN ? st.lockedFor + dt : 0;
        if (st.lockedFor >= LOCK_HOLD) { st.lockAt = st.t; st.off = Math.round(st.off); sfx('cut', { gain: 1.0 }); sfx('snap', { gain: 1.0 }); }
      } else {
        const e = st.t - st.lockAt, pe = prev - st.lockAt, at = (x) => pe < x && e >= x;
        if (at(PULL.freeze)) { sfx('feed', { gain: 1.2 }); sfx('rattle', { gain: 0.5 }); }
        if (at(PULL.out)) sfx('press1', { gain: 0.5 });
        if (at(PULL.dive + 0.4)) sfx('charge', { gain: 0.45, offset: 1.0 });
        if (e >= PULL.end) return 'exit';
      }
      // 音：ずれているほど唸りが大きく、向こうの音楽はこもる。止まると澄む
      const lock = st.lockAt !== null ? 1 : clamp01(1 - Math.abs(near()) / MAGNET);
      if (hum) hum.gain.gain.value = 0.25 * (1 - lock) * (st.lockAt === null ? 1 : 0);
      if (music?.filter) music.filter.frequency.value = 350 + 17000 * lock * lock;
      return null;
    },
    progress() { return st.lockAt !== null ? 0 : 1 - Math.abs(near()) * 2; },
    busy() { return st.lockAt !== null; },
    draw,
    state: () => ({ off: near(), locked: st.lockAt !== null }),
    // ?mode=render 用：1.2秒まで流れる → 1.2〜2.4秒でつまみを回して止める → 2.75 で止まる → 紙
    script(t) {
      this.reset();
      st.t = t; st.enterAt = -10;
      inner.tick(Math.min(t, 6));
      const k = ease(clamp01((t - 1.2) / 1.2));
      st.off = (0.37 + DRIFT * Math.min(t, 1.2)) * (1 - k) + 1 * k;
      if (t >= 2.75) { st.lockAt = 2.75; st.off = 1; }
    },
    dust: null,
  };
}
