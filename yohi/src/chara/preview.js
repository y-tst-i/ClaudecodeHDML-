import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCreature } from './creature.js';

// キャラの確認用：設定画と同じ薄いグレーの背景で、正面・横・後ろを撮る。
// ?mode=render のとき __seek(t)：t=0 正面 / 1 横（左向き）/ 2 後ろ / 3 以降は動き（power・衝撃）を確認
const RENDER = new URLSearchParams(location.search).get('mode') === 'render';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: RENDER });
renderer.setPixelRatio(1);
renderer.setSize(1536, 1024, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c9c9c9');
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = env;
const key = new THREE.DirectionalLight('#ffffff', 1.6);
key.position.set(2, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 6;
scene.add(key, new THREE.HemisphereLight('#ffffff', '#888888', 0.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const mon = createCreature({ envMap: env });
scene.add(mon.group);
const camera = new THREE.PerspectiveCamera(24, 1536 / 1024, 0.1, 50);
camera.position.set(0, 0.6, 3.9);
camera.lookAt(0, 0.46, 0);

function draw(t) {
  const view = Math.min(Math.round(t), 3);
  mon.group.rotation.y = [0, -Math.PI / 2, Math.PI, -0.5][view];
  if (t < 3) mon.update({ t: 1.0 });
  else mon.update({ t, power: Math.min(1, (t - 3) / 1.5), sinceImpact: t - 4.5 });
  renderer.render(scene, camera);
}
if (RENDER) {
  window.__seek = draw;
} else {
  const t0 = performance.now();
  const loop = () => { const t = (performance.now() - t0) / 1000; mon.group.rotation.y = t * 0.4; mon.update({ t }); renderer.render(scene, camera); requestAnimationFrame(loop); };
  loop();
}
