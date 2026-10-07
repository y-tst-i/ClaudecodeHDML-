import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BEAT, CONFIG } from './config.js';
import { createPost } from './post.js';
import { createCity } from './scenes/city.js';
import { createOrb } from './scenes/orb.js';
import { createMenu, SLASH_AT } from './scenes/menu.js';
import { createShatter } from './scenes/shatter.js';
import { range } from '../../src/core/math.js';

// 時間割（絵コンテのコード版）
//  0–6  CITY   C01 斜め俯瞰（PS1） / C02 急降下、4.29s で HD へ
//  6–9  ORB    C03 光が集まり宝珠に。ビートで5色
//  9–12 MENU   C04 青いウィンドウ、ゲージ → たたかう → 斬撃
// 12–15 BREAK  C05 画面が割れて白地にタイトル
export const SCENES = { city: [0, 6], orb: [6, 9], menu: [9, 12], shatter: [12, 15] };

// PS1 → HD：hdAt から半拍ごとに 5 → 3 → 2 → 1 と解像度が上がる
export function retroAt(t) {
  if (t < CONFIG.hdAt) return { pixel: 5, retro: 1, bloom: 0 };
  const step = Math.floor((t - CONFIG.hdAt) / (BEAT / 2));
  const pixel = [3, 2, 1][Math.min(step, 2)];
  return { pixel, retro: pixel > 1 ? 1 : 0, bloom: pixel > 1 ? 0.4 : 1.1 };
}
const flashAfter = (t, at, len, amount) => (t >= at ? Math.max(0, 1 - (t - at) / len) * amount : 0);

export function createTimeline(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const post = createPost(renderer);
  const city = createCity(env);
  const orb = createOrb(env);
  const menu = createMenu(city);
  const freeze = new THREE.WebGLRenderTarget(CONFIG.width, CONFIG.height, { colorSpace: THREE.LinearSRGBColorSpace });
  const shatter = createShatter(freeze.texture, env);

  // 斬撃直後の画面を RT に描く（割れる板のテクスチャ）
  function renderFreeze() {
    const lt = SLASH_AT + 0.16;
    menu.update(lt, SCENES.menu[0] + lt);
    renderer.setRenderTarget(freeze);
    renderer.autoClear = true;
    renderer.render(city.scene, menu.camera);
    renderer.autoClear = false;
    renderer.render(menu.overlay, menu.overlayCam);
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
  }

  function render(t) {
    city.setRetro(t < CONFIG.hdAt);
    if (t < SCENES.city[1]) {
      city.update(t);
      const flash = flashAfter(t, CONFIG.hdAt, 0.25, 0.45) + range(t, 5.75, 6) * 0.8;
      post.render(city.scene, city.camera, { ...retroAt(t), flash, flashColor: '#d8ffe9', time: t });
    } else if (t < SCENES.orb[1]) {
      orb.update(t - SCENES.orb[0]);
      post.render(orb.scene, orb.camera, { bloom: 0.55, flash: flashAfter(t, 6, 0.35, 0.8), flashColor: '#d8ffe9', time: t });
    } else if (t < SCENES.menu[1]) {
      menu.update(t - SCENES.menu[0], t);
      const lt = t - SCENES.menu[0];
      post.render(city.scene, menu.camera, { bloom: 0.9, flash: flashAfter(t, 9, 0.12, 0.6) + flashAfter(lt, SLASH_AT + 0.05, 0.3, 0.5), time: t });
      renderer.autoClear = false;
      renderer.render(menu.overlay, menu.overlayCam);
      renderer.autoClear = true;
    } else {
      renderFreeze();
      const lt = t - SCENES.shatter[0];
      shatter.update(lt);
      post.render(shatter.scene, shatter.camera, { bloom: 0, flash: flashAfter(lt, 0.1, 0.25, 0.7), time: t });
    }
  }
  return { render };
}
