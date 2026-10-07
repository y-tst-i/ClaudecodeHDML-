import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ease, lerp, range } from '../core/math.js';
import { textPlane } from '../core/text.js';

// シーン2：「素材の図鑑」美術館。像を台座に並べ、ease-in-out でカメラが1体ずつ巡る。
// 記事の v5 の学び：「像は画面中央、展示ごとに画角を変える」
export function createGalleryScene(env) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color('#141416');
  scene.fog = new THREE.Fog('#141416', 6, 18);

  const camera = new THREE.PerspectiveCamera(30, CONFIG.width / CONFIG.height, 0.1, 100);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.6, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor, new THREE.HemisphereLight('#ffffff', '#202024', 0.25));

  const exhibits = [
    { name: 'BRONZE', mat: new THREE.MeshStandardMaterial({ color: '#8c6a3f', metalness: 1, roughness: 0.45 }), geo: new THREE.IcosahedronGeometry(0.7, 0) },
    { name: 'CLAY', mat: new THREE.MeshStandardMaterial({ color: '#c9a184', roughness: 1 }), geo: new THREE.SphereGeometry(0.65, 64, 32) },
    { name: 'GLASS', mat: new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, roughness: 0.05, thickness: 1, ior: 1.5 }), geo: new THREE.TorusGeometry(0.5, 0.22, 48, 96) },
    { name: 'NEON', mat: new THREE.MeshStandardMaterial({ color: '#000', emissive: CONFIG.theme, emissiveIntensity: 1.2 }), geo: new THREE.OctahedronGeometry(0.7) },
  ];

  const pedestalMat = new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.8 });
  exhibits.forEach((ex, i) => {
    const x = i * 4;
    // 台座は低め・像は大きめ（記事 v6 の FB）
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.2), pedestalMat);
    ped.position.set(x, 0.35, 0);
    ex.mesh = new THREE.Mesh(ex.geo, ex.mat);
    ex.mesh.position.set(x, 1.5, 0);
    // 天窓からのスポット：像だけを照らし、通路は暗く落とす（陰影で奥行きを出す）
    const spot = new THREE.SpotLight('#fff4e0', 40, 8, 0.45, 0.6);
    spot.position.set(x, 5, 1);
    spot.target = ex.mesh;
    const label = textPlane(ex.name, 0.14, { color: '#2a2a2e', weight: 700 }); // 台座のプレート
    label.position.set(x, 0.5, 0.61);
    scene.add(ped, ex.mesh, spot, label);
  });

  // 展示ごとに異なる画角（カメラの位置/注視点）
  const shots = [
    { pos: [-1.2, 1.4, 3.2], look: [0, 1.4, 0] },
    { pos: [4.0, 2.4, 2.8], look: [4, 1.4, 0] },
    { pos: [9.4, 1.0, 3.0], look: [8, 1.6, 0] },
    { pos: [12.0, 1.6, 4.0], look: [12, 1.4, 0] },
  ];
  const dwell = 5 / shots.length;
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();

  return {
    scene,
    camera,
    update(t) {
      exhibits.forEach((ex, i) => (ex.mesh.rotation.y = t * 0.7 + i));
      const i = Math.min(shots.length - 1, Math.floor(t / dwell));
      const next = Math.min(shots.length - 1, i + 1);
      // 各ショットの後半 40% でだけ次へ移動 → 「止まって見せる→動く」の緩急
      const k = ease.inOutCubic(range(t - i * dwell, dwell * 0.6, dwell));
      p.set(...shots[i].pos).lerp(new THREE.Vector3(...shots[next].pos), k);
      l.set(...shots[i].look).lerp(new THREE.Vector3(...shots[next].look), k);
      p.x += lerp(0, 0.15, Math.sin(t)); // 手持ち感のわずかな揺れ
      camera.position.copy(p);
      camera.lookAt(l);
    },
  };
}
