import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterialsScene } from './scenes/s1-materials.js';
import { createGalleryScene } from './scenes/s2-gallery.js';
import { createShatterScene } from './scenes/s3-shatter.js';
import { createStickerWipe } from './core/sticker.js';

// 全体の時間割。ここが「絵コンテ」のコード版。
// start/end はグローバル時間（秒）。各シーンには start からの経過時間が渡される。
export const SCENES = [
  { id: 'S1', start: 0, end: 5, create: createMaterialsScene },
  { id: 'S2', start: 5, end: 10, create: createGalleryScene },
  { id: 'S3', start: 10, end: 15, create: createShatterScene },
];
// 場面転換（ステッカー）。at の瞬間に全面が覆われ、そこでシーンが切り替わる。
export const TRANSITIONS = [{ at: 5, len: 1.0 }, { at: 10, len: 1.0 }];

export function createTimeline(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const scenes = SCENES.map((s) => ({ ...s, inst: s.create(env) }));
  const wipe = createStickerWipe();

  // 時刻 t の1フレームを描く。純粋に t だけで決まる → 映像書き出しもWebも同じ絵になる。
  function render(t) {
    const s = scenes.find((x) => t < x.end) ?? scenes[scenes.length - 1];
    s.inst.update(t - s.start);
    renderer.autoClear = true;
    renderer.render(s.inst.scene, s.inst.camera);

    const tr = TRANSITIONS.find((x) => Math.abs(t - x.at) < x.len / 2 + 0.25);
    if (tr) {
      wipe.progress = (t - tr.at) / (tr.len / 2) + 1; // at-len/2 → 0, at → 1, at+len/2 → 2
      renderer.autoClear = false;
      renderer.render(wipe.scene, wipe.camera);
    }
  }
  return { render };
}
