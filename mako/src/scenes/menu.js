import * as THREE from 'three';
import { BEAT, CONFIG } from '../config.js';
import { ease, range } from '../../../src/core/math.js';

// C04：低いアングルの都市を背景に、懐かしい青いウィンドウのバトルメニュー。
// ゲージが溜まり READY →「たたかう」→ 斬撃。UIは Canvas に毎フレーム t から描く（決定論的）。
const W = CONFIG.width, H = CONFIG.height;
const FONT = '"Noto Sans JP", "Hiragino Sans", "Helvetica Neue", Arial, sans-serif';
const COMMANDS = ['たたかう', 'まほう', 'しょうかん', 'アイテム'];
const PARTY = [
  { name: 'VEGA', hp: '1987/2048', mp: '142', fill: [0.4, 1.55] },
  { name: 'ROOK', hp: '2316/2316', mp: ' 88', fill: [0.4, 2.3] },
  { name: 'IRIS', hp: '1504/1630', mp: '216', fill: [0.4, 2.7] },
];
export const SLASH_AT = 2.42; // シーン内時刻

export function createMenu(city) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const overlay = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  overlay.add(quad);
  const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const camera = new THREE.PerspectiveCamera(46, W / H, 0.05, 200);
  city.scene.add(camera);

  function win(x, y, w, h, open = 1) {
    if (open <= 0) return false;
    const hh = Math.max(2, h * open);
    const yy = y + (h - hh) / 2;
    const grd = g.createLinearGradient(x, yy, x + w * 0.6, yy + hh * 1.4);
    grd.addColorStop(0, '#5a74e2');
    grd.addColorStop(1, '#0b1352');
    g.save();
    g.globalAlpha = 0.94;
    g.beginPath(); g.roundRect(x, yy, w, hh, 8); g.fillStyle = grd; g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 3; g.strokeStyle = '#cfd3e6'; g.stroke();
    g.beginPath(); g.roundRect(x + 2.5, yy + 2.5, w - 5, hh - 5, 6); g.lineWidth = 1; g.strokeStyle = 'rgba(20,24,60,0.9)'; g.stroke();
    g.restore();
    return open >= 1;
  }
  function text(s, x, y, { size = 28, color = '#f4f6ff', weight = 700, align = 'left' } = {}) {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.85)';
    g.fillText(s, x + 2, y + 2);
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  function draw(t) {
    g.clearRect(0, 0, W, H);
    const open = ease.outExpo(range(t, 0.12, 0.42));
    // 上：敵の名前
    if (win(W / 2 - 220, 24, 440, 60, ease.outExpo(range(t, 0.05, 0.3)))) text('REACTOR GUARDIAN', W / 2, 54, { size: 24, align: 'center' });
    // 左下：コマンド
    const L = { x: 24, y: 488, w: 300, h: 208 };
    if (win(L.x, L.y, L.w, L.h, open)) {
      COMMANDS.forEach((c, i) => {
        const sel = i === 0 && t > 2.3 && t < 2.42 && Math.floor(t * 30) % 2 === 0;
        text(c, L.x + 64, L.y + 44 + i * 42, { color: sel ? '#fff6a0' : '#f4f6ff' });
      });
      // カーソル：READY 後に現れて上下に揺れる
      const ready = t > PARTY[0].fill[1];
      if (ready) {
        const bob = Math.sin(t * 18) * 3;
        const cx = L.x + 26 + bob, cy = L.y + 44;
        g.beginPath(); g.moveTo(cx, cy - 11); g.lineTo(cx + 22, cy); g.lineTo(cx, cy + 11); g.closePath();
        g.fillStyle = '#ffffff'; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowOffsetX = 2; g.shadowOffsetY = 2; g.fill(); g.shadowColor = 'transparent';
      }
    }
    // 右下：パーティ
    const R = { x: 336, y: 488, w: 920, h: 208 };
    if (win(R.x, R.y, R.w, R.h, open)) {
      text('NAME', R.x + 40, R.y + 30, { size: 18, color: '#9fb0ff' });
      text('HP', R.x + 330, R.y + 30, { size: 18, color: '#9fb0ff' });
      text('MP', R.x + 560, R.y + 30, { size: 18, color: '#9fb0ff' });
      text('TIME', R.x + 660, R.y + 30, { size: 18, color: '#9fb0ff' });
      PARTY.forEach((p, i) => {
        const y = R.y + 76 + i * 46;
        text(p.name, R.x + 40, y);
        text(p.hp, R.x + 330, y, { weight: 600 });
        text(p.mp, R.x + 560, y, { weight: 600 });
        // ゲージ
        const k = range(t, p.fill[0], p.fill[1]);
        const bx = R.x + 660, bw = 170, bh = 12;
        g.fillStyle = 'rgba(0,0,20,0.6)'; g.fillRect(bx, y - bh / 2, bw, bh);
        const gg = g.createLinearGradient(bx, 0, bx + bw, 0);
        gg.addColorStop(0, '#1d8a5c'); gg.addColorStop(1, CONFIG.mako);
        g.fillStyle = k >= 1 ? (Math.floor(t / (BEAT / 2)) % 2 ? '#fff3a6' : CONFIG.mako) : gg;
        g.fillRect(bx, y - bh / 2, bw * k, bh);
        g.strokeStyle = '#cfd3e6'; g.lineWidth = 1; g.strokeRect(bx, y - bh / 2, bw, bh);
        if (k >= 1) text('READY', bx + bw + 12, y, { size: 18, color: '#fff3a6' });
      });
    }
    // 斬撃：画面を斜めに横切る白い線
    const s = range(t, SLASH_AT, SLASH_AT + 0.12);
    if (t >= SLASH_AT) {
      const ax = -100, ay = H * 0.86, bx = W + 100, by = H * 0.08;
      const ex = ax + (bx - ax) * ease.outExpo(s), ey = ay + (by - ay) * ease.outExpo(s);
      const fade = 1 - range(t, SLASH_AT + 0.2, SLASH_AT + 0.6) * 0.4;
      g.save();
      g.lineCap = 'round';
      g.shadowColor = CONFIG.mako; g.shadowBlur = 40;
      g.strokeStyle = `rgba(220,255,236,${0.9 * fade})`; g.lineWidth = 26;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke();
      g.shadowBlur = 0; g.strokeStyle = `rgba(255,255,255,${fade})`; g.lineWidth = 7;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke();
      g.restore();
    }
    tex.needsUpdate = true;
  }

  return {
    camera,
    overlay,
    overlayCam,
    // t はシーン内時刻（0〜3秒）
    update(t, globalT) {
      city.pulse(globalT);
      // 都市の縁から中心の塔を見上げる低いアングル、ゆっくり前進＋斬撃で揺れる
      const shake = t > SLASH_AT ? Math.max(0, 1 - (t - SLASH_AT) / 0.4) * 0.12 : 0;
      const a = 2.75 + t * 0.03; // 炉と炉のあいだから塔を見る
      camera.position.set(Math.cos(a) * (11.5 - t * 0.5) + Math.sin(t * 90) * shake, 1.25 + Math.cos(t * 77) * shake, Math.sin(a) * (11.5 - t * 0.5));
      camera.lookAt(0, 3.2, 0);
      draw(t);
    },
  };
}
