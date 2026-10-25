import * as THREE from 'three';
import { createWorld } from '../room/world.js';
import { createCreature } from '../chara/creature.js';
import { sfx } from '../audio.js';

// 場面1：ブラウン管の部屋。長押しで溜める → 衝撃 → けものが主役のテレビの画面に飛び込む → 次の場面へ
// 絵は state（t, power, impactAt）だけで決まる。操作はこの state を変えるだけ。
export const EXIT_WAIT = 1.6, EXIT_LEN = 2.4;   // 衝撃のあと少し待って、飛び込む

export async function createRoom(renderer, env) {
  const world = await createWorld(renderer, {
    logoD: new URL('../../assets/logo/logo_d_mono.webp', import.meta.url).href,
    crt: new URL('../../assets/tex/crt_glass.webp', import.meta.url).href,
    grain: new URL('../../assets/tex/riso_grain.webp', import.meta.url).href,
    logoA: new URL('../../assets/logo/logo_a_mode.webp', import.meta.url).href,
    logoB: new URL('../../assets/logo/logo_b_street.webp', import.meta.url).href,
    street: new URL('../../assets/tex/street_wall.webp', import.meta.url).href,
    paper: new URL('../../assets/tex/riso_paper.webp', import.meta.url).href,
    plastic: new URL('../../assets/room/tv_plastic.webp', import.meta.url).href,
    wood: new URL('../../assets/room/tv_wood.webp', import.meta.url).href,
    floor: new URL('../../assets/room/floor_concrete.webp', import.meta.url).href,
    wall: new URL('../../assets/room/wall_dark.webp', import.meta.url).href,
    smudge: new URL('../../assets/room/glass_smudge.webp', import.meta.url).href,
    dust: new URL('../../assets/room/dust_scratch.webp', import.meta.url).href,
  });
  const mon = createCreature({ envMap: env, glowScale: 0.4 });
  mon.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.35; });
  // 置き場所は外側の入れ物で決める（キャラ自身の position.y は跳ねる動きに使う）
  const holder = new THREE.Group();
  holder.add(mon.group);
  world.scene.add(holder);
  const monLight = new THREE.PointLight(0xc8ffe0, 0, 2.2, 1.5);
  monLight.position.set(0.1, 1.05, 1.75);
  world.scene.add(monLight);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 60);

  const HOME = new THREE.Vector3(0.32, 1.12, 1.0);
  const FRONT = new THREE.Vector3(-0.12, 0.0, 2.35);   // 画面の前の床に降りる
  const SCREEN = new THREE.Vector3(-0.15, 0.5, 1.6);   // 画面の表面（ここへ吸い込まれる）
  const st = { t: 0, power: 0, impactAt: null, holding: false, sneezeAt: null, lastBite: 0, secret: null };   // secret：{ i（テレビの番号）, at }
  const SNEEZE = 0.6;   // 満腹になってから、くしゃみ（＝衝撃）までの「ハ…ハ…」
  // G1「光を噛む」：主役の画面から、けものの口へ流れ込む光の粒（すべて同じ式で動かす）
  const N_BITE = 42;
  const biteMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8ffe0).multiplyScalar(2.2) }), N_BITE);
  biteMesh.frustumCulled = false;
  world.scene.add(biteMesh);
  const B0 = new THREE.Vector3(-0.15, 0.98, 1.6), B1 = new THREE.Vector3(0.05, 1.45, 1.55), B2 = new THREE.Vector3(0.27, 1.5, 1.2);
  const bm = new THREE.Object3D(), bp = new THREE.Vector3();
  function placeBite(amount, t) {
    for (let i = 0; i < N_BITE; i++) {
      const u = (t * 1.3 + i / N_BITE) % 1, a = 1 - u;
      bp.set(0, 0, 0).addScaledVector(B0, a * a).addScaledVector(B1, 2 * a * u).addScaledVector(B2, u * u);   // 2次ベジェ
      bp.x += Math.sin(i * 12.9 + t * 7) * 0.03 * a; bp.y += Math.cos(i * 7.3 + t * 6) * 0.03 * a;
      bm.position.copy(bp);
      bm.scale.setScalar(amount * (0.006 + 0.012 * ((i * 0.618) % 1)) * (1 - u * 0.6));
      bm.updateMatrix();
      biteMesh.setMatrixAt(i, bm.matrix);
    }
    biteMesh.instanceMatrix.needsUpdate = true;
    biteMesh.visible = amount > 0.001;
  }
  // 隠しチャンネル：消えているテレビを押すと、その1台に「そのテレビから見た部屋」が暗視カメラで映る。
  // けものが気づいて振り向き、カメラ（＝そのテレビ）を覗き込む
  const SECRET_LEN = 3.2;
  const cctvRT = new THREE.WebGLRenderTarget(320, 240, { type: THREE.HalfFloatType });
  const cctv = new THREE.PerspectiveCamera(24, 4 / 3, 0.05, 30);
  const ir = new THREE.PointLight(0xffffff, 0, 7, 1.2);   // 暗視用の光（カメラ用に描く間だけ点ける）
  world.scene.add(ir);
  const ray = new THREE.Raycaster();
  const screens = world.tvs.filter((tv) => !tv.hero).map((tv) => tv.screen);
  let snapped = false;   // エンディング用に1コマ撮ったか
  let charge = null, bgm = null, pulse = null;   // BGM：暗いパッド＋電気が溜まるほど大きくなる脈
  const ease = (x) => x * x * (3 - 2 * x);

  // そのテレビの位置から、けものを撮る（その画面自身は元の映像に戻して描く＝自分を映し込まない）
  const tmpV = new THREE.Vector3();
  function renderSecret(tv) {
    tv.screen.getWorldPosition(tmpV);
    cctv.position.copy(tmpV).add(new THREE.Vector3(0, 0, 0.12));
    cctv.lookAt(holder.position.x, holder.position.y + 0.32, holder.position.z);
    ir.position.copy(cctv.position); ir.intensity = 7;
    const u = tv.mat.uniforms, keep = u.uRT.value, wetOn = world.wet.visible;
    u.uRT.value = tv.baseRT; world.wet.visible = false;
    renderer.setRenderTarget(cctvRT);
    renderer.render(world.scene, cctv);
    renderer.setRenderTarget(null);
    u.uRT.value = keep; world.wet.visible = wetOn; ir.intensity = 0;
  }

  function draw(look) {
    const { t, power } = st;
    const since = st.impactAt === null ? -1 : t - st.impactAt;
    const sec = st.secret && st.impactAt === null && t - st.secret.at < SECRET_LEN ? { tv: world.tvs[st.secret.i], since: t - st.secret.at } : null;
    const { hit } = world.update({ t, power, sinceImpact: since, bite: true, secret: sec && { ...sec, texture: cctvRT.texture, len: SECRET_LEN } });
    // 噛む：押しているあいだ、うつむいて光を食べ、体がふくらむ。満腹で「ハ…ハ…」とのけぞり、くしゃみで全部のテレビへ光を吐き戻す
    const eating = st.impactAt === null && st.sneezeAt === null && st.holding && power > 0.02;
    const sneeze = st.sneezeAt !== null && st.impactAt === null ? Math.min(1, (t - st.sneezeAt) / (SNEEZE * 0.9)) : 0;
    const fat = st.impactAt === null ? power : Math.max(0, 1 - since * 4);
    placeBite(eating ? Math.min(1, power * 10) : 0, t);
    // 覗き込む：首をかしげながら、すこし上目づかい
    const peek = sec && !eating && sec.since > 0.7 ? { x: Math.sin(sec.since * 2.2) * 0.35, y: 0.25 } : null;
    mon.update({ t, power, sinceImpact: since, look: eating ? { x: -0.6, y: -0.6 } : peek ?? look, chomp: eating ? 1 : 0, fat, sneeze });
    // ---- 飛び込み（衝撃から EXIT_WAIT 秒後。e = 飛び込みの経過秒）----
    // 0.00–0.55 テレビの上から画面の前の床へ跳び降りる
    // 0.55–0.90 画面の方を向いて、かがむ（溜め）
    // 0.90–1.15 画面へ跳ぶ。進む向きに体が伸び、小さくなって吸い込まれる
    // 1.10–     画面に波紋が広がる。1.2 からカメラが画面へ突っ込み、ブラウン管の画素が視界を埋める
    const e = since - EXIT_WAIT;
    const seg = (a, b) => Math.max(0, Math.min(1, (e - a) / (b - a)));
    holder.scale.setScalar(0.74);
    holder.visible = true;
    if (e < 0) {
      holder.position.copy(HOME); holder.rotation.y = -0.25;
      // 隠しチャンネル：0.35秒で気づいて振り向き（小さく跳ねる）、カメラを覗き込み、最後に向き直る
      if (sec && !eating) {
        const tp = sec.tv.group.position;
        const face = Math.atan2(tp.x - HOME.x, tp.z - HOME.z);
        let d = face - (-0.25); d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = sec.since, turn = ease(Math.min(1, Math.max(0, (k - 0.35) / 0.35))) * (1 - ease(Math.min(1, Math.max(0, (k - SECRET_LEN + 0.6) / 0.45))));
        holder.rotation.y = -0.25 + d * turn;
        holder.position.y += Math.max(0, Math.sin(Math.min(1, Math.max(0, (k - 0.35) / 0.3)) * Math.PI)) * 0.12;
      }
    } else if (e < 0.55) {
      const k = seg(0, 0.55);
      holder.position.lerpVectors(HOME, FRONT, ease(k));
      holder.position.y += Math.sin(k * Math.PI) * 0.35;
      holder.rotation.y = -0.25 + (Math.PI - 0.25 + 0.25) * ease(k);          // くるっと画面の方を向く
    } else if (e < 0.9) {
      const k = seg(0.55, 0.9);
      holder.position.copy(FRONT); holder.rotation.y = Math.PI;
      const crouch = Math.sin(k * Math.PI * 0.5);                              // かがんで溜める
      holder.scale.set(0.74 * (1 + crouch * 0.18), 0.74 * (1 - crouch * 0.28), 0.74 * (1 + crouch * 0.18));
    } else {
      const k = seg(0.9, 1.15);
      holder.position.lerpVectors(FRONT, SCREEN, k * k);
      holder.position.y += Math.sin(k * Math.PI) * 0.2;
      holder.rotation.y = Math.PI;
      const sz = 0.74 * (1 - 0.85 * k);
      holder.scale.set(sz * (1 - 0.5 * k), sz * (1 - 0.5 * k), sz * (1 + 2.2 * k));   // 進む向きに伸びる
      holder.visible = k < 1;
    }
    world.hero.mat.uniforms.uRipple.value = e >= 1.1 ? e - 1.1 : -1;
    const dive = seg(1.2, 2.15), dd = dive * dive * (3 - 2 * dive);
    const mask = seg(1.75, EXIT_LEN);
    monLight.intensity = 0.15 + Math.min(1, since >= 0 ? 1 : power) * 0.35 + hit * 1.2;
    // カメラ：ふだんはゆっくり寄りながら覗き込める。飛び込むときは主役の画面へ一気に寄る
    const dolly = 6.6 - Math.min(t, 20) * 0.02 - power * 0.35;
    const shake = hit * 0.06;
    const base = new THREE.Vector3(look.x * 0.45 + Math.sin(t * 61) * shake, 1.35 + look.y * 0.2 + Math.cos(t * 53) * shake, dolly);
    // 飛び降りる間はけものを追い、そのあと画面へ突っ込む
    const follow = seg(0, 0.9) * (1 - dive);
    const watch = base.clone().lerp(new THREE.Vector3(0.2, 1.0, 4.6), follow * 0.6);
    camera.position.lerpVectors(watch, new THREE.Vector3(-0.15, 0.53, 1.66), dd);
    const target = new THREE.Vector3(look.x * 0.15, 1.2 + look.y * 0.08, 0).lerp(new THREE.Vector3(-0.1, 0.7, 2.0), follow).lerp(new THREE.Vector3(-0.15, 0.5, 1.5), Math.min(1, dd * 1.4));
    camera.lookAt(target);
    camera.fov = 34 - dd * 8;
    camera.updateProjectionMatrix();
    if (sec) renderSecret(sec.tv);
    return { hit, power, mask };
  }

  return {
    scene: world.scene, camera, hint: 'HOLD',
    snapNow() { return st.impactAt !== null && st.t - st.impactAt >= 0.35 && !snapped && (snapped = true); },
    setQuality: world.setQuality,
    reset() { snapped = false; st.t = 0; st.power = 0; st.impactAt = null; st.holding = false; st.sneezeAt = null; st.lastBite = 0; st.secret = null; holder.visible = true; world.hero.mat.uniforms.uRipple.value = -1; camera.fov = 34; camera.updateProjectionMatrix(); },
    enter() {
      this.leave();
      bgm = sfx('bgm_room', { gain: 0.9, loop: true });
      pulse = sfx('bgm_room_pulse', { gain: 0, loop: true, at: bgm?.start ?? 0 });
    },
    leave() { bgm?.stop(0.3); pulse?.stop(0.3); bgm = pulse = null; charge?.stop(0.05); charge = null; },
    down(ndc) {
      st.holding = true;
      if (st.impactAt !== null || !ndc || (st.secret && st.t - st.secret.at < SECRET_LEN)) return;
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(screens, false)[0];
      if (!h) return;
      st.secret = { i: world.tvs.findIndex((tv) => tv.screen === h.object), at: st.t };
      sfx('chan', { gain: 0.9 });
    },
    up() { st.holding = false; charge?.stop(0.08); charge = null; },
    move() {},
    // 1コマ分すすめる。戻り値 'exit' で次の場面へ
    tick(dt) {
      st.t += dt;
      const prev = st.power;
      if (pulse) pulse.gain.gain.value = st.impactAt === null ? 0.15 + st.power * 0.85 : 1;
      if (st.impactAt === null) {
        if (st.holding) {
          if (!charge) charge = sfx('charge', { offset: Math.max(0, st.power * 1.6) });
          st.power = Math.min(1, st.power + dt * 0.55);
        } else if (st.sneezeAt === null) st.power = Math.max(0, st.power - dt * 0.8);
        if (prev < 0.02 && st.power >= 0.02) sfx('snap', { gain: 1 });                       // 主役の画面だけ点く
        // 噛む音：押しているあいだ、0.22秒ごとに「カプッ」
        if (st.holding && st.sneezeAt === null && st.power > 0.02 && st.t - st.lastBite > 0.22) { st.lastBite = st.t; sfx('snap', { gain: 0.35, pan: 0.2 }); }
        if (st.power >= 1 && st.sneezeAt === null) { st.sneezeAt = st.t; charge?.stop(0.05); charge = null; sfx('charge', { gain: 0.5, offset: 1.2 }); }
        if (st.sneezeAt !== null && st.t - st.sneezeAt >= SNEEZE) { st.impactAt = st.t; sfx('impact'); sfx('hit', { gain: 0.9 }); }
      } else {
        const since = st.t - st.impactAt;
        const e = since - EXIT_WAIT, pe = e - dt;
        const at = (x) => pe < x && e >= x;
        if (at(0)) sfx('rattle', { gain: 0.6 });               // 跳び降りる
        if (at(0.5)) sfx('snap', { gain: 0.9 });               // 床に着地
        if (at(0.9)) sfx('drop', { gain: 0.8 });               // 画面へ跳ぶ
        if (at(1.1)) sfx('hit', { gain: 0.7 });                // 吸い込まれる
        if (at(1.75)) sfx('charge', { gain: 0.5, offset: 1.0 });   // 画素に吸い込まれていく唸り
        if (since >= EXIT_WAIT + EXIT_LEN) return 'exit';
      }
      return null;
    },
    progress() { return st.impactAt === null ? st.power : 0; },
    busy() { return st.impactAt !== null; },
    draw,
    state: () => ({ power: st.power, impacted: st.impactAt !== null, secret: st.secret ? st.t - st.secret.at : null }),
    // 確認用：i 番目の消えたテレビを押したことにする
    poke(i = 0) { st.secret = { i: world.tvs.indexOf(world.tvs.filter((tv) => !tv.hero)[i]), at: st.t }; },
    // ?mode=render 用：台本どおりに state を置く
    script(t) {
      const k = Math.max(0, Math.min(1, (t - 0.6) / 2.4));
      st.t = t; st.power = k * k * (3 - 2 * k); st.holding = t > 0.6 && t < 3.0;
      st.sneezeAt = t >= 3.0 ? 3.0 : null; st.impactAt = t >= 3.0 + SNEEZE ? 3.0 + SNEEZE : null;
      // ?secret=N：溜めずに、0.3秒に N 番目の消えたテレビを押す（隠しチャンネルの確認用）
      const sp = new URLSearchParams(location.search).get('secret');
      if (sp !== null) { st.power = 0; st.holding = false; st.sneezeAt = null; st.impactAt = null; this.poke(Number(sp)); st.secret.at = 0.3; }
    },
    dust: world.tex.dust,
  };
}
