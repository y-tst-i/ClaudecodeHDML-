import * as THREE from 'three';
import { createCreature } from '../chara/creature.js';
import { mulberry32 } from '../room/world.js';
import { sfx } from '../audio.js';

// 場面2：夜の路地。壁をドラッグでスプレーすると、隠れているタグ（ロゴB）の形に塗れていき、
// 一定以上塗ると一気にタグが完成する（衝撃）。けものはノズルを目で追い、完成で跳ねる。
// 塗った跡は「吹いた点の一覧」から描く（点の i 番目の飛沫は種 i の乱数で決まる＝同じ操作なら同じ絵）。
const PAINT_W = 2.7, PAINT_H = 1.8;            // 塗れる面（ロゴBと同じ 3:2）
const GRID_W = 96, GRID_H = 64;                // 塗れた量を数えるための升目
const COMPLETE_AT = 0.33;
 // G3「影の脱走」：塗りはじめると、けものの影だけが壁を這い出して、塗ったオレンジを舐め取る。
// 完成の瞬間、影の腹からタグが壁へ押し出され、影は本体に引き戻される
const SH_HOME = new THREE.Vector2(-2.15, 0.72);   // 影のふだんの場所（壁の上の x, y）
const SH_SPEED = 1.7;                              // 影が這う速さ（壁の上、1秒あたり）
const EXIT_AT = 3.0;                           // 完成から何秒で紙が横切りはじめるか（0.5秒で覆う → 次の場面）                      // ロゴの面積の何割を塗ったら完成するか

export async function createAlley(renderer, env) {
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
    brick: await load(new URL('../../assets/alley/wall_brick.webp', import.meta.url).href, true, 4, 2),
    asphalt: await load(new URL('../../assets/alley/asphalt_wet.webp', import.meta.url).href, true, 6, 6),
    shutter: await load(new URL('../../assets/alley/shutter_metal.webp', import.meta.url).href, true, 1.5, 1),
    posterA: await load(new URL('../../assets/alley/poster_a.webp', import.meta.url).href),
    posterB: await load(new URL('../../assets/alley/poster_b.webp', import.meta.url).href),
    posterC: await load(new URL('../../assets/alley/poster_c.webp', import.meta.url).href),
    stickers: await load(new URL('../../assets/alley/stickers.webp', import.meta.url).href),
    logoB: await load(new URL('../../assets/logo/logo_b_street.webp', import.meta.url).href),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030304);
  scene.fog = new THREE.FogExp2(0x030304, 0.09);

  // ---------- 地面と壁 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.28, metalness: 0.0, color: 0x5a5a5a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 0.85, color: 0x9a8a84 }));
  wall.position.set(0, 3, -1);
  scene.add(wall);
  const shutter = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.9), new THREE.MeshStandardMaterial({ map: tex.shutter, roughness: 0.5, metalness: 0.6, color: 0x8a8a8a }));
  shutter.position.set(-3.6, 1.45, -0.98);
  scene.add(shutter);
  // 貼り紙（少し傾けて、重ねて貼る）
  const rnd = mulberry32(11);
  const posters = [[tex.posterA, 2.3, 1.9, 0.62], [tex.posterB, 2.9, 1.5, 0.55], [tex.posterC, 3.45, 2.1, 0.5], [tex.posterA, -2.25, 2.3, 0.45]];
  posters.forEach(([map, x, y, s], i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 1.5), new THREE.MeshStandardMaterial({ map, roughness: 0.9, color: 0xb0aaa0 }));
    p.position.set(x, y, -0.985 + i * 0.002);
    p.rotation.z = (rnd() - 0.5) * 0.12;
    scene.add(p);
  });
  // ステッカー（シートを 3×2 に切り分けて、あちこちに貼る）
  for (let i = 0; i < 9; i++) {
    const k = i % 6, t = tex.stickers.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / 3, 1 / 2);
    t.offset.set((k % 3) / 3, k < 3 ? 0.5 : 0);
    const size = 0.22 + rnd() * 0.12;
    const st = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.4 }));
    const spots = [[-1.95, 1.1], [-2.6, 0.8], [1.85, 0.9], [2.25, 0.62], [3.3, 1.0], [-1.6, 2.65], [0.9, 2.85], [-2.9, 2.0], [3.9, 2.4]];
    st.position.set(spots[i][0], spots[i][1], -0.975);
    st.rotation.z = (rnd() - 0.5) * 0.6;
    scene.add(st);
  }

  // ---------- 塗れる面：吹いた跡（canvas）＋隠れたタグ ----------
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 800;
  const g2 = canvas.getContext('2d');
  const paintTex = new THREE.CanvasTexture(canvas);
  paintTex.colorSpace = THREE.SRGBColorSpace;
  // 吹いた跡：タグが完成したら、タグの外にはみ出た跡は垂れて流れ落ちながら消え、タグの中だけが残る
  const melt = { value: 0 }, KEEP_OVERSPRAY = new URLSearchParams(location.search).has('keep');   // ?keep で跡を残す版
  const paintMat = new THREE.MeshStandardMaterial({ map: paintTex, transparent: true, roughness: 0.55, emissive: 0xff481b, emissiveIntensity: 0.55 });
  paintMat.onBeforeCompile = (sh) => {
    sh.uniforms.uMelt = melt; sh.uniforms.uLogo = { value: tex.logoB };
    sh.fragmentShader = 'uniform float uMelt;\nuniform sampler2D uLogo;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        float inTag = smoothstep(0.3, 0.6, texture2D(uLogo, vMapUv).a);
        float col = floor(vMapUv.x * 140.0);
        float speed = 0.5 + fract(sin(col * 12.9898) * 43758.5453);         // 縦の筋ごとに垂れる速さが違う
        vec2 duv = vMapUv + vec2(0.0, uMelt * uMelt * 0.35 * speed * (1.0 - inTag));
        vec4 sampledDiffuseColor = texture2D(map, duv);
        sampledDiffuseColor.a *= mix(1.0 - smoothstep(0.35, 1.0, uMelt), 1.0, inTag);
        diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= diffuseColor.a;');
  };
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(PAINT_W, PAINT_H), paintMat);
  paint.position.set(0, 1.55, -0.97);
  scene.add(paint);
  // 完成したタグ：オレンジのスプレー。左から右へ吹きつけるように現れ、垂れる
  const reveal = { value: 0 }, drip = { value: 0 }, origin = { value: new THREE.Vector2(0.5, 0.5) };
  // タグも吹いた跡と同じオレンジ・同じ光り方（色を揃える）
  const tagMat = new THREE.MeshStandardMaterial({ map: tex.logoB, color: 0xff481b, transparent: true, roughness: 0.55, emissive: 0xff481b, emissiveIntensity: 0.55 });
  tagMat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = reveal; sh.uniforms.uDrip = drip; sh.uniforms.uOrigin = origin;
    sh.fragmentShader = 'uniform float uReveal, uDrip;\nuniform vec2 uOrigin;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float n = fract(sin(dot(floor(vMapUv * 90.0), vec2(12.9898, 78.233))) * 43758.5453);
      // 影の腹（uOrigin）から外へ、押し出されるように広がる
      float dist = length((vMapUv - uOrigin) * vec2(1.5, 1.0)) + (n - 0.5) * 0.05;
      float edge = uReveal * 2.0;
      diffuseColor.a *= smoothstep(edge + 0.02, edge - 0.02, dist);
      // 垂れ：細い所だけ下へ伸ばす（ロゴの下側を少しずつ見せる）
      diffuseColor.a *= vMapUv.y > 0.42 ? 1.0 : step(mix(0.42, 0.0, uDrip), vMapUv.y);`);
  };
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(PAINT_W, PAINT_H), tagMat);
  tag.position.set(0, 1.55, -0.965);
  scene.add(tag);

  // ロゴの形を升目に落とす（どれだけ塗れたかを数えるため）
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = GRID_W; maskCanvas.height = GRID_H;
  const mg = maskCanvas.getContext('2d');
  mg.drawImage(tex.logoB.image, 0, 0, GRID_W, GRID_H);
  const md = mg.getImageData(0, 0, GRID_W, GRID_H).data;
  const inLogo = new Uint8Array(GRID_W * GRID_H);
  let logoCells = 0;
  for (let i = 0; i < inLogo.length; i++) if (md[i * 4 + 3] > 100) { inLogo[i] = 1; logoCells++; }

  // ---------- 光：オレンジのナトリウム灯と、遠くのテレビの緑白い光 ----------
  scene.add(new THREE.HemisphereLight(0x2a3a44, 0x080808, 0.5));
  // 壁が読めるだけの、弱く冷たい正面光（遠くのテレビの光が回り込んでいる想定）
  const fill = new THREE.DirectionalLight(0x9fc8c0, 0.35);
  fill.position.set(-2, 3, 6);
  scene.add(fill);
  const lamp = new THREE.PointLight(0xffa868, 40, 14, 1.25);
  lamp.position.set(2.4, 3.6, 0.4);
  scene.add(lamp);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb070).multiplyScalar(4) }));
  bulb.position.copy(lamp.position);
  scene.add(bulb);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.5), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  arm.position.set(2.4, 3.72, -0.3);
  scene.add(arm);
  const tvGlow = new THREE.PointLight(0xc8ffe0, 4, 10, 1.4);
  tvGlow.position.set(-4.5, 1.2, 2.5);
  scene.add(tvGlow);
  const nozzleLight = new THREE.PointLight(0xe0fff0, 0, 1.6, 2);
  scene.add(nozzleLight);

  // ---------- けもの ----------
  const mon = createCreature({ envMap: env, glowScale: 0.45 });
  mon.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.35; });
  const holder = new THREE.Group();
  holder.add(mon.group);
  holder.scale.setScalar(0.95);
  holder.position.set(-1.75, 0, -0.25);
  holder.rotation.y = 1.05;   // 横向きで壁（スプレー）を見ている
  scene.add(holder);
  // 後ろからの細い光で、暗がりでも黒い体の輪郭が分かるように（でないと目と胸のしまだけが浮いて、顔に見える）
  const rim = new THREE.PointLight(0xc8ffe0, 2.2, 1.5, 1.6);
  rim.position.set(-2.25, 1.15, -0.45);
  scene.add(rim);
  const rim2 = new THREE.PointLight(0xffa868, 2.5, 2.2, 1.5);
  rim2.position.set(-1.0, 0.9, -0.6);
  scene.add(rim2);

  // ---------- 影：けものだけを横から撮った黒い形（目と胸のしまだけ緑白に光る）を、壁に貼る ----------
  const SHADOW_LAYER = 3;
  const shadowRT = new THREE.WebGLRenderTarget(256, 256);
  const shadowCam = new THREE.OrthographicCamera(-0.62, 0.62, 0.62, -0.62, 0.1, 10);
  shadowCam.layers.set(SHADOW_LAYER);
  const inkBlack = new THREE.MeshBasicMaterial({ color: 0x000000 }), inkGlow = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const swaps = [];
  mon.group.traverse((o) => {
    if (!o.isMesh) return;
    o.layers.enable(SHADOW_LAYER);
    const m = o.material, glowy = m.emissive && m.color && m.color.getHex() === 0 && m.emissiveIntensity > 0;
    swaps.push([o, m, glowy ? inkGlow : inkBlack]);
  });
  const shadowU = { uMap: { value: shadowRT.texture }, uEaten: { value: 0 }, uFlash: { value: 0 }, uT: { value: 0 } };
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.24), new THREE.ShaderMaterial({
    uniforms: shadowU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uEaten, uFlash, uT; varying vec2 vUv;
      void main(){
        // 少しぼかした輪郭（壁に落ちた影のやわらかさ）
        vec2 px = vec2(1.5 / 256.0);
        vec4 c = texture2D(uMap, vUv) * 0.4 + (texture2D(uMap, vUv + px) + texture2D(uMap, vUv - px) + texture2D(uMap, vUv + vec2(px.x, -px.y)) + texture2D(uMap, vUv - vec2(px.x, -px.y))) * 0.15;
        float a = min(1.0, c.a * 1.1);
        // 光る所（目・しま）は、影の中でも緑白に光る
        vec3 col = vec3(0.6, 1.0, 0.75) * c.r * 0.8;
        // 食べたオレンジが、腹の中で光る（食べるほど強く。完成の瞬間は一気に）
        vec2 bq = (vUv - vec2(0.5, 0.42)) * vec2(1.4, 2.0);
        float belly = exp(-dot(bq, bq) * 30.0);
        col += vec3(1.0, 0.28, 0.1) * belly * (uEaten * (0.5 + 0.3 * sin(uT * 9.0)) + uFlash * 2.5) * smoothstep(0.3, 0.9, c.a);
        gl_FragColor = vec4(col, a);
      }`,
  }));
  shadow.position.set(SH_HOME.x, SH_HOME.y, -0.955);
  scene.add(shadow);
  function renderShadow() {
    shadowCam.position.set(holder.position.x, holder.position.y + 0.42, holder.position.z + 4);
    shadowCam.lookAt(holder.position.x, holder.position.y + 0.42, holder.position.z);
    for (const [o, , ink] of swaps) o.material = ink;
    const bg = scene.background, fog = scene.fog, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    scene.background = null; scene.fog = null;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(shadowRT);
    renderer.clear();
    renderer.render(scene, shadowCam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(cc, ca);
    scene.background = bg; scene.fog = fog;
    for (const [o, m] of swaps) o.material = m;
  }

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 60);
  const raycaster = new THREE.Raycaster();

  // ---------- 状態 ----------
  const st = { t: 0, enterAt: 0, points: [], drawn: 0, painted: new Uint8Array(GRID_W * GRID_H), coverage: 0, completeAt: null, holding: false, speed: 0, nozzle: null,
    licks: [], lickDrawn: 0, sh: { x: SH_HOME.x, y: SH_HOME.y, dir: 1, out: false, lastLick: 0 }, shAtComplete: null };
  let sprayLoop = null;

  // 吹いた点 i を canvas に描く：やわらかい芯＋まわりの飛沫（種 i の乱数）
  function stamp(i) {
    const p = st.points[i];
    const r = mulberry32(1000 + i);
    const x = p.u * canvas.width, y = (1 - p.v) * canvas.height, R = 24;
    const grad = g2.createRadialGradient(x, y, 0, x, y, R);
    grad.addColorStop(0, 'rgba(255,72,27,0.9)');
    grad.addColorStop(0.45, 'rgba(255,72,27,0.5)');
    grad.addColorStop(0.75, 'rgba(255,72,27,0.1)');
    grad.addColorStop(1, 'rgba(255,72,27,0)');
    g2.fillStyle = grad;
    g2.beginPath(); g2.arc(x, y, R, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = 'rgba(255,96,52,0.9)';
    for (let k = 0; k < 34; k++) {
      const a = r() * Math.PI * 2, d = R * (0.4 + r() * 1.4), s = 0.6 + r() * 1.8;
      g2.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, s, s);
    }
    // 升目に「塗れた」を記録
    const cx = Math.floor(p.u * GRID_W), cy = Math.floor((1 - p.v) * GRID_H), cr = Math.ceil(R / canvas.width * GRID_W);
    for (let yy = cy - cr; yy <= cy + cr; yy++) for (let xx = cx - cr; xx <= cx + cr; xx++) {
      if (xx < 0 || yy < 0 || xx >= GRID_W || yy >= GRID_H || (xx - cx) ** 2 + (yy - cy) ** 2 > cr * cr) continue;
      st.painted[yy * GRID_W + xx] = 1;
    }
  }
  // 影が舐め取った所：塗った跡を消す（升目の「塗れた」はそのまま。消されても完成は遠のかない）
  function lickStamp(i) {
    const p = st.licks[i];
    const x = p.u * canvas.width, y = (1 - p.v) * canvas.height, R = 34;
    const grad = g2.createRadialGradient(x, y, 0, x, y, R);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g2.globalCompositeOperation = 'destination-out';
    g2.fillStyle = grad;
    g2.beginPath(); g2.arc(x, y, R, 0, Math.PI * 2); g2.fill();
    g2.globalCompositeOperation = 'source-over';
  }
  function flush() {
    if (st.drawn === st.points.length && st.lickDrawn === st.licks.length) return;
    // 吹いた点と舐めた所を、起きた順に描く
    while (st.drawn < st.points.length || st.lickDrawn < st.licks.length) {
      if (st.lickDrawn < st.licks.length && st.licks[st.lickDrawn].n <= st.drawn) lickStamp(st.lickDrawn++);
      else stamp(st.drawn++);
    }
    paintTex.needsUpdate = true;
    let hit = 0;
    for (let i = 0; i < inLogo.length; i++) if (inLogo[i] && st.painted[i]) hit++;
    st.coverage = hit / logoCells;
  }
  // 画面の位置 → 塗れる面の上の uv
  function pick(ndc) {
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObject(paint)[0];
    return h ? { u: h.uv.x, v: h.uv.y, p: h.point } : null;
  }
  function addPoint(hitp) {
    const last = st.points[st.points.length - 1];
    // 間をあけすぎないように、離れていれば間を埋める
    if (last) {
      const d = Math.hypot(hitp.u - last.u, (hitp.v - last.v) / 1.5);
      const n = Math.min(8, Math.floor(d / 0.012));
      for (let k = 1; k <= n; k++) st.points.push({ u: last.u + (hitp.u - last.u) * k / (n + 1), v: last.v + (hitp.v - last.v) * k / (n + 1) });
    }
    st.points.push({ u: hitp.u, v: hitp.v });
  }

  function draw(look) {
    const t = st.t, since = st.completeAt === null ? -1 : t - st.completeAt;
    flush();
    // 完成：0.5秒で吹きつけるように現れ、そのあと垂れる
    reveal.value = since < 0 ? 0 : Math.min(1, since / 0.5);
    drip.value = since < 0.4 ? 0 : Math.min(1, ((since - 0.4) / 1.6) ** 2);
    melt.value = since < 0.5 || KEEP_OVERSPRAY ? 0 : Math.min(1, (since - 0.5) / 2.2);
    const hit = since < 0 ? 0 : Math.exp(-since * 4) * 0.8;
    // ノズルの光（吹いている所がぼんやり光る）
    if (st.nozzle && st.holding && st.completeAt === null) { nozzleLight.position.copy(st.nozzle).add(new THREE.Vector3(0, 0, 0.3)); nozzleLight.intensity = 0.6 + st.speed * 2; }
    else nozzleLight.intensity *= 0.8;
    lamp.intensity = 40 * (0.94 + 0.06 * Math.sin(t * 50) * (Math.sin(t * 0.7) > 0.95 ? 1 : 0.1));   // ときどきジジッとちらつく
    // けもの：ノズルを目で追う。完成で跳ねる
    const lk = st.nozzle ? { x: THREE.MathUtils.clamp((st.nozzle.x - holder.position.x) * 0.25 - 0.3, -1, 1), y: THREE.MathUtils.clamp((st.nozzle.y - 1.0) * 0.8, -1, 1) } : look;
    mon.update({ t, power: st.completeAt === null ? Math.min(0.6, st.coverage / COMPLETE_AT * 0.6) : 1, sinceImpact: since, look: lk });
    // 影：ふだんは本体の後ろの壁。這い出したら舐めに行く。完成で腹からタグを押し出し、本体へ引き戻される
    let sx = st.sh.x, sy = st.sh.y, dir = st.sh.dir;
    if (since >= 0 && st.shAtComplete) {
      const k = Math.max(0, Math.min(1, (since - 0.35) / 0.45)), back = 1 - (1 - k) ** 3;
      sx = st.shAtComplete.x + (SH_HOME.x - st.shAtComplete.x) * back;
      sy = st.shAtComplete.y + (SH_HOME.y - st.shAtComplete.y) * back;
      if (k > 0) dir = SH_HOME.x < st.shAtComplete.x ? -1 : 1;
      if (k >= 1) dir = 1;
    }
    const crawl = st.sh.out && since < 0 ? 1 : 0;
    shadow.position.set(sx, sy + Math.abs(Math.sin(t * 10)) * 0.03 * crawl, -0.955);
    shadow.scale.set(dir * (1 + Math.sin(t * 10) * 0.04 * crawl), 1 - Math.sin(t * 10) * 0.04 * crawl, 1);
    shadow.rotation.z = Math.sin(t * 5) * 0.06 * crawl;
    shadowU.uEaten.value = Math.min(1, st.licks.length / 25);
    shadowU.uFlash.value = since < 0 ? 0 : Math.exp(-since * 3) * (since < 0.5 ? 1 : 0.3);
    shadowU.uT.value = t;
    // 完成のタグは影の腹（影の中心より少し下）から広がる
    if (st.shAtComplete) origin.value.set((st.shAtComplete.x) / PAINT_W + 0.5, (st.shAtComplete.y - 0.1 - 1.55) / PAINT_H + 0.5);
    renderShadow();
    // カメラ：入ってきた瞬間は壁に近い位置から引く。マウスで少し覗き込む
    const intro = Math.min(1, (t - st.enterAt) / 0.9), e = 1 - (1 - intro) ** 3;
    const shake = hit * 0.05;
    camera.position.set(look.x * 0.3 + Math.sin(t * 57) * shake, 1.3 + look.y * 0.15 + Math.cos(t * 49) * shake, 2.2 + 2.6 * e);
    camera.lookAt(look.x * 0.1, 1.0, -1);
    // 入ってきた瞬間：前の場面から続くブラウン管の画素が縮んで、路地が現れる
    const mask = Math.max(0, 1 - (t - st.enterAt) / 0.6);
    const wipe = since < EXIT_AT ? 0 : Math.min(0.5, (since - EXIT_AT) / 1.0);
    return { hit: Math.max(hit, (1 - intro) * 0.3), power: Math.min(1, st.coverage / COMPLETE_AT) * 0.5, mask: mask * mask, wipe };
  }

  return {
    scene, camera, hint: 'DRAG',
    setQuality() {},
    reset() {
      st.t = 0; st.enterAt = 0; st.points = []; st.drawn = 0; st.painted.fill(0); st.coverage = 0; st.completeAt = null; st.holding = false; st.nozzle = null;
      st.licks = []; st.lickDrawn = 0; st.sh = { x: SH_HOME.x, y: SH_HOME.y, dir: 1, out: false, lastLick: 0 }; st.shAtComplete = null;
      g2.clearRect(0, 0, canvas.width, canvas.height); paintTex.needsUpdate = true;
    },
    enter() { sfx('rattle'); sprayLoop?.stop(); sprayLoop = sfx('spray', { gain: 0, loop: true }); },
    leave() { sprayLoop?.stop(0.1); sprayLoop = null; },
    down(ndc) { st.holding = true; const h = pick(ndc); if (h && st.completeAt === null) { addPoint(h); st.nozzle = h.p; } },
    up() { st.holding = false; },
    move(ndc, dist) {
      if (!st.holding || st.completeAt !== null) return;
      const h = pick(ndc);
      if (!h) return;
      addPoint(h);
      st.nozzle = h.p;
      st.speed = Math.min(1, st.speed + dist * 0.02);
    },
    tick(dt) {
      st.t += dt;
      st.speed *= Math.pow(0.02, dt);
      if (sprayLoop) sprayLoop.gain.gain.value = st.holding && st.completeAt === null ? 0.25 + st.speed * 0.75 : 0;
      // 影：ある程度塗られたら壁を這い出し、少し前に塗られた所へ向かって舐める
      if (st.completeAt === null) {
        const sh = st.sh;
        if (!sh.out && st.points.length > 25) { sh.out = true; sfx('rattle', { gain: 0.35, pan: -0.5 }); }
        const target = sh.out ? st.points[Math.max(0, st.points.length - 60)] : null;
        const tx = target ? (target.u - 0.5) * PAINT_W - sh.dir * 0.3 : SH_HOME.x, ty = target ? 1.55 + (target.v - 0.5) * PAINT_H - 0.05 : SH_HOME.y;
        const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
        if (d > 0.02) { const m = Math.min(d, SH_SPEED * dt); sh.x += dx / d * m; sh.y += dy / d * m; }
        if (Math.abs(dx) > 0.12) sh.dir = dx > 0 ? 1 : -1;
        // 口（進む向きの頭の先）で舐める。0.16秒ごと
        if (target && d < 0.4 && st.t - sh.lastLick > 0.16) {
          sh.lastLick = st.t;
          const mx = sh.x + sh.dir * 0.3, my = sh.y + 0.05;
          st.licks.push({ u: mx / PAINT_W + 0.5, v: (my - 1.55) / PAINT_H + 0.5, n: st.points.length });
          if (st.licks.length % 3 === 0) sfx('snap', { gain: 0.25, pan: Math.max(-1, Math.min(1, sh.x / 3)) });
        }
      }
      if (st.completeAt === null && st.coverage >= COMPLETE_AT) { st.shAtComplete = { x: st.sh.x, y: st.sh.y }; st.completeAt = st.t; sfx('final'); sfx('rattle'); sprayLoop?.stop(0.05); }
      if (st.completeAt !== null && st.t - st.completeAt > EXIT_AT + 0.5) return 'exit';
      return null;
    },
    progress() { return st.completeAt === null ? Math.min(1, st.coverage / COMPLETE_AT) : 0; },
    busy() { return st.completeAt !== null; },
    draw,
    state: () => ({ coverage: st.coverage, completed: st.completeAt !== null, points: st.points.length, licks: st.licks.length, shadowOut: st.sh.out, t: st.t }),
    // ?mode=render 用：台本どおりにジグザグに吹く（同じ t なら同じ絵）
    script(t) {
      this.reset();
      st.t = t; st.enterAt = -10;
      const n = Math.floor(Math.min(t, 3.0) * 90);
      for (let i = 0; i < n; i++) { const k = i / 270; st.points.push({ u: 0.08 + 0.84 * ((k * 5) % 1), v: 0.25 + 0.5 * Math.abs(Math.sin(k * 23)) }); }
      // 影：1.2秒から這い出して、塗った所を舐めている（確認用の固定の位置）
      if (t >= 1.2) {
        st.sh.out = true;
        const k = Math.min(1, (t - 1.2) / 1.0);
        st.sh.x = SH_HOME.x + (0.1 - SH_HOME.x) * k; st.sh.y = SH_HOME.y + (1.5 - SH_HOME.y) * k;
        for (let i = 0; i < Math.floor(k * 20); i++) st.licks.push({ u: 0.55 + i * 0.004, v: 0.5 + Math.sin(i) * 0.03, n: st.points.length });
      }
      flush();
      if (t >= 3.0) { st.completeAt = 3.0; st.shAtComplete = { x: st.sh.x, y: st.sh.y }; }
    },
    dust: null,
  };
}
