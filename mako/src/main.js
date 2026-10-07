import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createTimeline } from './timeline.js';

// ?mode=film（既定）… ループ再生 / ?mode=render … 書き出し・撮影用（window.__seek）
const mode = new URLSearchParams(location.search).get('mode') ?? 'film';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(CONFIG.width, CONFIG.height, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const frame = document.createElement('div');
frame.className = 'frame';
frame.appendChild(renderer.domElement);
document.body.appendChild(frame);

const timeline = createTimeline(renderer);

if (mode === 'render') {
  window.__seek = (t) => timeline.render(t);
  window.__showreel = { ...CONFIG, seek: (t) => (timeline.render(t), renderer.domElement.toDataURL('image/png')) };
} else {
  const t0 = performance.now();
  renderer.setAnimationLoop(() => timeline.render(((performance.now() - t0) / 1000) % CONFIG.duration));
}
