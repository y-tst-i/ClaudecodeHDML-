import * as THREE from 'three';
import { BEAT, CONFIG } from '../config.js';
import { ease, range } from '../core/math.js';
import { textPlane } from '../core/text.js';

// シーン1：キャラ（の代わりのオブジェクト）が登場し、ビートごとに質感が切り替わる。
// 記事の v2→v3 の学び：「未完成っぽい質感（Normal等）は削り、かっこいいクロームを目立たせる」
export function createMaterialsScene(env) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(CONFIG.ink);

  const camera = new THREE.PerspectiveCamera(35, CONFIG.width / CONFIG.height, 0.1, 100);

  const geo = new THREE.TorusKnotGeometry(1, 0.34, 320, 48);
  const theme = new THREE.Color(CONFIG.theme);
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 }), // chrome
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }), // wire
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 }), // chrome
    new THREE.MeshToonMaterial({ color: theme }), // toon
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 1, roughness: 0.25, emissive: theme, emissiveIntensity: 0.15 }), // 赤リム
  ];
  const hero = new THREE.Mesh(geo, materials[0]);
  scene.add(hero);

  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 4, 5);
  const rim = new THREE.PointLight(theme, 60, 20);
  rim.position.set(-3, 1, -3);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.2));

  // 太いタイポは「奥の空間に置く」：画面に貼るだけより WebGL ワールドの一部に見える
  const words = ['CODE', 'ONLY', 'MOTION'].map((w, i) => {
    const m = textPlane(w, 3.4, { color: i === 2 ? CONFIG.theme : '#ffffff' });
    m.position.set(0, 0, -6);
    m.material.opacity = 0;
    scene.add(m);
    return m;
  });

  return {
    scene,
    camera,
    // t はこのシーン内のローカル時間（秒）。同じ t なら必ず同じ絵になる。
    update(t) {
      const intro = ease.outExpo(range(t, 0, 1.2));
      hero.scale.setScalar(0.2 + 0.8 * intro);
      hero.rotation.set(t * 0.6, t * 0.9, 0);

      const beat = Math.floor(t / BEAT);
      hero.material = materials[beat % materials.length];
      scene.background.set(beat % materials.length === 4 ? CONFIG.theme : CONFIG.ink);

      // ビート頭でワードを切り替え、ズームで押し出す
      words.forEach((w, i) => {
        const on = Math.floor(beat / 2) % words.length === i && t > 0.5;
        const local = (t % (BEAT * 2)) / (BEAT * 2);
        w.material.opacity = on ? 1 : 0;
        w.scale.setScalar(1 + local * 0.25);
      });

      const r = 7 - 1.5 * ease.inOutCubic(range(t, 0, 5));
      camera.position.set(Math.sin(t * 0.3) * r * 0.3, 0.4, r);
      camera.lookAt(0, 0, 0);
    },
  };
}
