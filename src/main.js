import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createTimeline } from './timeline.js';
import { startExperience } from './experience.js';

// ?mode=film       … 15秒の映像をループ再生（デフォルト）
// ?mode=experience … 同じ映像を「遷移アクション」で進める体験型サイト
// ?mode=render     … 書き出し用。scripts/render.mjs が1フレームずつ seek する
const mode = new URLSearchParams(location.search).get('mode') ?? 'film';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(CONFIG.width, CONFIG.height, false); // 内部解像度は固定、表示はCSSで拡縮
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('stage').appendChild(renderer.domElement);

const timeline = createTimeline(renderer);

if (mode === 'render') {
  window.__showreel = {
    ...CONFIG,
    seek(t) {
      timeline.render(t);
      return renderer.domElement.toDataURL('image/png');
    },
  };
} else if (mode === 'experience') {
  startExperience(timeline);
} else {
  const t0 = performance.now();
  renderer.setAnimationLoop(() => timeline.render(((performance.now() - t0) / 1000) % CONFIG.duration));
}
