import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ease, mulberry32, range } from '../core/math.js';
import { textPlane } from '../core/text.js';

// シーン3：テーマカラーのポスターがパリーンと割れて、白地にロゴ。
// 記事 v9 の学び：「破片を2層に見せない。全破片を1つの式で動かす」
export function createShatterScene(env, { breakAt = 1.5 } = {}) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(CONFIG.paper);

  const camera = new THREE.PerspectiveCamera(35, CONFIG.width / CONFIG.height, 0.1, 100);
  camera.position.set(0, 0, 10);

  // ポスターのテクスチャ（1枚のグラフィックとして描く）
  const W = 9.6, H = 5.4;
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  const g = c.getContext('2d');
  g.fillStyle = CONFIG.theme; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = CONFIG.ink;
  g.font = '900 360px Inter, Arial, sans-serif';
  g.fillText('BREAK', 80, 640);
  g.font = '700 48px Inter, Arial, sans-serif';
  g.fillText('THE SCREEN / 2026', 92, 760);
  const poster = new THREE.CanvasTexture(c);
  poster.colorSpace = THREE.SRGBColorSpace;

  // 平面を三角形の破片に分割（ジッターで不規則に）
  const rand = mulberry32(CONFIG.seed);
  const nx = 18, ny = 10;
  const pts = [];
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const edge = x === 0 || y === 0 || x === nx || y === ny;
    const jx = edge ? 0 : (rand() - 0.5) * 0.7, jy = edge ? 0 : (rand() - 0.5) * 0.7;
    pts.push([((x + jx) / nx - 0.5) * W, ((y + jy) / ny - 0.5) * H]);
  }
  const shards = [];
  const mat = new THREE.MeshStandardMaterial({ map: poster, roughness: 0.4, metalness: 0, side: THREE.DoubleSide });
  const P = (x, y) => pts[y * (nx + 1) + x];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const quad = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)];
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const v = tri.map((i) => quad[i]);
      const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
      const pos = [], uv = [];
      for (const [px, py] of v) { pos.push(px - cx, py - cy, 0); uv.push(px / W + 0.5, py / H + 0.5); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, cy, 0);
      m.userData = { cx, cy, r: rand(), axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize() };
      scene.add(m);
      shards.push(m);
    }
  }

  const logo = textPlane('YOUR LOGO', 0.9, { color: CONFIG.ink });
  logo.material.opacity = 0;
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 2, 6);
  scene.add(logo, sun, new THREE.AmbientLight(0xffffff, 0.9));

  const impact = new THREE.Vector2(0.6, -0.3); // 割れの中心

  return {
    scene,
    camera,
    breakAt,
    update(t) {
      const s = Math.max(0, t - breakAt);
      // ↓ 全破片がこの1つの式で動く。中心から遠いほど速く外へ、重力で落ち、回転する。
      for (const m of shards) {
        const { cx, cy, r, axis } = m.userData;
        const dx = cx - impact.x, dy = cy - impact.y;
        const d = Math.hypot(dx, dy) + 0.001;
        const delay = d * 0.04; // 衝撃が中心から伝わる遅れ
        const k = Math.max(0, s - delay);
        const speed = 2.5 + 3 * r;
        m.position.set(cx + (dx / d) * speed * k, cy + (dy / d) * speed * k - 4.9 * k * k, 6 * k * (0.5 + r));
        m.setRotationFromAxisAngle(axis, k * (4 + 6 * r));
      }
      camera.position.z = 10 - 0.6 * ease.inOutCubic(range(t, 0, breakAt));
      logo.material.opacity = ease.outExpo(range(t, breakAt + 1.2, breakAt + 2));
      logo.scale.setScalar(0.9 + 0.1 * ease.outBack(range(t, breakAt + 1.2, breakAt + 2)));
    },
  };
}
