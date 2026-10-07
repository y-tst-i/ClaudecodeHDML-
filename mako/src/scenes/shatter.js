import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ease, mulberry32, range } from '../../../src/core/math.js';
import { textPlane } from '../../../src/core/text.js';

// C05：斬撃の瞬間の画面がそのまま割れて飛び散り、白地にタイトル。
// 全破片は1つの式で動く（層に分かれて見えないように）。
export function createShatter(freezeTexture, env) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(CONFIG.paper);
  const camera = new THREE.PerspectiveCamera(35, CONFIG.width / CONFIG.height, 0.1, 100);
  const dist = 10;
  const Hh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(35 / 2)); // 画面ぴったりの板の高さ
  const Ww = Hh * (CONFIG.width / CONFIG.height);
  camera.position.set(0, 0, dist);

  const rand = mulberry32(CONFIG.seed + 3);
  const mat = new THREE.MeshBasicMaterial({ map: freezeTexture, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshBasicMaterial({ color: CONFIG.mako, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const nx = 22, ny = 12;
  const pts = [];
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const edge = x === 0 || y === 0 || x === nx || y === ny;
    pts.push([((x + (edge ? 0 : (rand() - 0.5) * 0.8)) / nx - 0.5) * Ww, ((y + (edge ? 0 : (rand() - 0.5) * 0.8)) / ny - 0.5) * Hh]);
  }
  const P = (x, y) => pts[y * (nx + 1) + x];
  const shards = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const q = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)];
    for (const tri of rand() < 0.5 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 3], [1, 2, 3]]) {
      const v = tri.map((i) => q[i]);
      const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
      const pos = [], uv = [];
      for (const [px, py] of v) { pos.push(px - cx, py - cy, 0); uv.push(px / Ww + 0.5, py / Hh + 0.5); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const m = new THREE.Mesh(geo, mat);
      // 破片の縁を緑に光らせる（少し大きい裏板）
      const e = new THREE.Mesh(geo, edgeMat);
      e.scale.setScalar(1.04); e.position.z = -0.01;
      m.add(e);
      m.userData = { cx, cy, r: rand(), axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize() };
      scene.add(m);
      shards.push(m);
    }
  }

  const title = textPlane('MAKO CITY', 1.25, { color: CONFIG.ink, weight: 900 });
  const sub = textPlane('A FAN-MADE HOMAGE', 0.2, { color: '#5b605c', weight: 600 });
  sub.position.y = -1.0;
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.035), new THREE.MeshBasicMaterial({ color: CONFIG.mako, toneMapped: false }));
  rule.position.y = -0.72;
  for (const o of [title, sub]) o.material.opacity = 0;
  scene.add(title, sub, rule);

  // 割れの中心＝斬撃の線の中央付近
  const impact = new THREE.Vector2(0.1, 0.2);
  const breakAt = 0.12;
  return {
    scene,
    camera,
    update(t) {
      const s = Math.max(0, t - breakAt);
      for (const m of shards) {
        const { cx, cy, r, axis } = m.userData;
        const dx = cx - impact.x, dy = cy - impact.y;
        const d = Math.hypot(dx, dy) + 0.001;
        const k = Math.max(0, s - d * 0.03);
        const sp = 3 + 4 * r;
        m.position.set(cx + (dx / d) * sp * k, cy + (dy / d) * sp * k - 6 * k * k, 7 * k * (0.4 + r));
        m.setRotationFromAxisAngle(axis, k * (3 + 7 * r));
      }
      const ti = ease.outExpo(range(t, 0.95, 1.6));
      title.material.opacity = ti;
      title.scale.setScalar(1.12 - 0.12 * ti);
      sub.material.opacity = ease.outExpo(range(t, 1.25, 1.8));
      rule.scale.x = Math.max(0.001, 6.2 * ease.inOutCubic(range(t, 1.05, 1.7)));
      camera.position.z = dist - 0.4 * ease.outExpo(range(t, 0, 3));
    },
  };
}
