import * as THREE from 'three';
import { createWorld } from '../room/world.js';
import { createCreature } from '../chara/creature.js';
import { sfx } from '../audio.js';

// 場面1：ブラウン管の部屋。長押しで溜める → 衝撃 → けものが主役のテレビの画面に飛び込む → 次の場面へ
// 絵は state（t, power, impactAt）だけで決まる。操作はこの state を変えるだけ。
export const EXIT_WAIT = 1.6, EXIT_LEN = 1.5;   // 衝撃のあと少し待って、飛び込む

export async function createRoom(renderer, env) {
  const world = await createWorld(renderer, {
    logoD: new URL('../../assets/logo/logo_d_mono.png', import.meta.url).href,
    crt: new URL('../../assets/tex/crt_glass.jpg', import.meta.url).href,
    grain: new URL('../../assets/tex/riso_grain.jpg', import.meta.url).href,
    logoA: new URL('../../assets/logo/logo_a_mode.png', import.meta.url).href,
    logoB: new URL('../../assets/logo/logo_b_street.png', import.meta.url).href,
    street: new URL('../../assets/tex/street_wall.jpg', import.meta.url).href,
    paper: new URL('../../assets/tex/riso_paper.jpg', import.meta.url).href,
    plastic: new URL('../../assets/room/tv_plastic.jpg', import.meta.url).href,
    wood: new URL('../../assets/room/tv_wood.jpg', import.meta.url).href,
    floor: new URL('../../assets/room/floor_concrete.jpg', import.meta.url).href,
    wall: new URL('../../assets/room/wall_dark.jpg', import.meta.url).href,
    smudge: new URL('../../assets/room/glass_smudge.jpg', import.meta.url).href,
    dust: new URL('../../assets/room/dust_scratch.jpg', import.meta.url).href,
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

  const HOME = new THREE.Vector3(0.32, 1.12, 1.0), SCREEN = new THREE.Vector3(-0.15, 0.56, 1.62);
  const st = { t: 0, power: 0, impactAt: null, holding: false };
  let charge = null;
  const ease = (x) => x * x * (3 - 2 * x);

  function draw(look) {
    const { t, power } = st;
    const since = st.impactAt === null ? -1 : t - st.impactAt;
    const { hit } = world.update({ t, power, sinceImpact: since });
    mon.update({ t, power, sinceImpact: since, look });
    // 飛び込み：衝撃から EXIT_WAIT 秒後、弧を描いて主役の画面へ。小さくなって吸い込まれる
    const k = Math.max(0, Math.min(1, (since - EXIT_WAIT) / (EXIT_LEN * 0.6)));
    holder.position.lerpVectors(HOME, SCREEN, ease(k));
    holder.position.y += Math.sin(k * Math.PI) * 0.45;
    holder.scale.setScalar(0.74 * (1 - 0.9 * k * k));
    holder.rotation.y = -0.25 + k * 0.25;
    holder.visible = k < 0.99;
    monLight.intensity = 0.15 + Math.min(1, since >= 0 ? 1 : power) * 0.35 + hit * 1.2;
    // カメラ：ふだんはゆっくり寄りながら覗き込める。飛び込むときは主役の画面へ一気に寄る
    const dolly = 6.6 - Math.min(t, 20) * 0.02 - power * 0.35;
    const shake = hit * 0.06;
    const base = new THREE.Vector3(look.x * 0.45 + Math.sin(t * 61) * shake, 1.35 + look.y * 0.2 + Math.cos(t * 53) * shake, dolly);
    const dive = Math.max(0, Math.min(1, (since - EXIT_WAIT - EXIT_LEN * 0.3) / (EXIT_LEN * 0.7)));
    const d = dive * dive * dive;
    camera.position.lerpVectors(base, new THREE.Vector3(-0.15, 0.56, 1.75), d);
    const target = new THREE.Vector3(look.x * 0.15, 1.2 + look.y * 0.08, 0).lerp(new THREE.Vector3(-0.15, 0.56, 1.5), Math.min(1, d * 1.5));
    camera.lookAt(target);
    return { hit: Math.max(hit, d * d * 0.6), power };
  }

  return {
    scene: world.scene, camera, hint: 'HOLD',
    setQuality: world.setQuality,
    reset() { st.t = 0; st.power = 0; st.impactAt = null; st.holding = false; holder.visible = true; },
    down() { st.holding = true; },
    up() { st.holding = false; charge?.stop(0.08); charge = null; },
    move() {},
    // 1コマ分すすめる。戻り値 'exit' で次の場面へ
    tick(dt) {
      st.t += dt;
      const prev = st.power;
      if (st.impactAt === null) {
        if (st.holding) {
          if (!charge) charge = sfx('charge', { offset: Math.max(0, st.power * 1.6) });
          st.power = Math.min(1, st.power + dt * 0.55);
        } else st.power = Math.max(0, st.power - dt * 0.8);
        for (const tv of world.tvs) if (prev < tv.threshold && st.power >= tv.threshold) sfx('snap', { gain: tv.hero ? 1 : 0.45, pan: tv.pan });
        if (st.power >= 1) { st.impactAt = st.t; charge?.stop(0.02); charge = null; sfx('impact'); }
      } else {
        const since = st.t - st.impactAt;
        if (since - dt < EXIT_WAIT && since >= EXIT_WAIT) sfx('drop', { gain: 0.7 });
        if (since >= EXIT_WAIT + EXIT_LEN) return 'exit';
      }
      return null;
    },
    progress() { return st.impactAt === null ? st.power : 0; },
    busy() { return st.impactAt !== null; },
    draw,
    state: () => ({ power: st.power, impacted: st.impactAt !== null }),
    // ?mode=render 用：台本どおりに state を置く
    script(t) {
      const k = Math.max(0, Math.min(1, (t - 0.6) / 2.4));
      st.t = t; st.power = k * k * (3 - 2 * k); st.impactAt = t >= 3.0 ? 3.0 : null;
    },
    dust: world.tex.dust,
  };
}
