import { T } from '../tokens.js';
import { mulberry32 } from './util.js';

// コンクリートの断面。砂利・砂・セメントペースト・気泡を別々のレイヤーに描いておき、
// 「砂利だけ見せる」のように強調を切り替えられるようにする。
export const W = 3200, H = 2000;

function layer() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c;
}

function stone(g, rand, x, y, r) {
  const n = 7 + Math.floor(rand() * 5);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const rr = r * (0.7 + rand() * 0.45);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * (0.75 + rand() * 0.3)]);
  }
  const tones = ['#8d877d', '#a49c8f', '#76716a', '#b8ab96', '#958a7a', '#6c6862', '#a8a39b'];
  const base = tones[Math.floor(rand() * tones.length)];
  const grd = g.createLinearGradient(x - r, y - r, x + r, y + r);
  grd.addColorStop(0, shade(base, 18));
  grd.addColorStop(1, shade(base, -22));
  g.beginPath();
  // 角を少し丸めた多角形
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(ax, ay, mx, my);
  }
  const [ax, ay] = pts[0], [bx, by] = pts[1];
  g.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
  g.closePath();
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(40,36,30,0.45)';
  g.stroke();
  // 石の中の筋や粒
  g.save();
  g.clip();
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rand() * 0.08})`;
    g.beginPath();
    g.arc(x + (rand() - 0.5) * r * 1.6, y + (rand() - 0.5) * r * 1.6, 1 + rand() * r * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function buildSection(seed = 7) {
  const rand = mulberry32(seed);
  const paste = layer(), gravel = layer(), sand = layer(), air = layer();

  // セメントペースト（地）：細かいムラ
  let g = paste.getContext('2d');
  g.fillStyle = '#bdb7ac';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '60,55,48'},${0.04 + rand() * 0.06})`;
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 1 + rand() * 3);
  }

  // 砂利（粗骨材）：重ならないように置く
  g = gravel.getContext('2d');
  const placed = [];
  for (let tries = 0; tries < 9000 && placed.length < 340; tries++) {
    const r = 18 + Math.pow(rand(), 1.6) * 78;
    const x = rand() * W, y = rand() * H;
    if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < (pr + r) * 0.98)) continue;
    placed.push([x, y, r]);
    stone(g, rand, x, y, r);
  }

  // 砂（細骨材）：砂利のすき間に細かい粒
  g = sand.getContext('2d');
  for (let i = 0; i < 52000; i++) {
    const x = rand() * W, y = rand() * H;
    if (placed.some(([px, py, pr]) => Math.abs(px - x) < pr && Math.abs(py - y) < pr && Math.hypot(px - x, py - y) < pr * 0.8)) continue;
    const r = 1.2 + rand() * 3.2;
    const v = 110 + Math.floor(rand() * 90);
    g.fillStyle = `rgb(${v + 14},${v + 8},${v - 6})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }

  // 気泡：内側に影のある小さな穴
  g = air.getContext('2d');
  for (let i = 0; i < 140; i++) {
    const x = rand() * W, y = rand() * H;
    if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + 10)) continue;
    const r = 3 + rand() * 9;
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grd.addColorStop(0, '#3b3732');
    grd.addColorStop(0.75, '#5d5850');
    grd.addColorStop(1, 'rgba(230,226,218,0.9)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return { paste, gravel, sand, air };
}

let layers = null;

// cam: { x, y, z } 断面上の注視点と倍率（z=1 で断面の横幅が画面にぴったり）
// focus: 各レイヤーの強さ 0〜1 / shade: 文字を読ませるための暗幕 0〜1 / tint: 暗幕の色
export const section = {
  draw(g, s) {
    layers ??= buildSection();
    const { x = W / 2, y = H / 2, z = 1, fGravel = 1, fSand = 1, fPaste = 1, fAir = 1, shade = 0, light = 0, split = 0 } = s.p;
    const scale = (1920 / W) * z;
    g.save();
    const focusing = Math.min(fGravel, fSand, fPaste, fAir) < 0.99;
    g.fillStyle = focusing ? '#dcd7ce' : '#2a2724';
    g.fillRect(0, 0, 1920, 1080);
    g.translate(960, 540);
    g.scale(scale, scale);
    g.translate(-x, -y);
    g.globalAlpha = 0.18 + 0.82 * fPaste;
    g.drawImage(layers.paste, 0, 0);
    g.globalAlpha = 0.1 + 0.9 * fSand;
    g.drawImage(layers.sand, 0, 0);
    g.globalAlpha = 0.1 + 0.9 * fGravel;
    g.drawImage(layers.gravel, 0, 0);
    g.globalAlpha = 0.1 + 0.9 * fAir;
    g.drawImage(layers.air, 0, 0);
    g.restore();
    // ほんのり上から光（立体感）
    const lg = g.createLinearGradient(0, 0, 0, 1080);
    lg.addColorStop(0, `rgba(255,250,240,${0.08 + light * 0.2})`);
    lg.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = lg;
    g.fillRect(0, 0, 1920, 1080);
    if (shade > 0) {
      g.fillStyle = `rgba(14,13,12,${shade})`;
      g.fillRect(0, 0, 1920, 1080);
    }
    // 右側に紙のパネル（説明を読ませる場所）
    if (split > 0.001) {
      g.fillStyle = T.paper;
      g.fillRect(1920 - 800 * split, 0, 800 * split + 1, 1080);
    }
  },
};
