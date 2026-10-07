import { T } from '../tokens.js';
import { buildSection, W as SW, H as SH } from './section.js';
import { arrow, clamp, ease, line, mulberry32, range } from './util.js';

// 各シーンは draw(g, s)。s.p = 補間済みのパラメータ / s.k = この画面に入ってからの秒数 / s.t = 全体の秒数
// 1920x1080 の座標で描く。線画は墨色、アクセントのオレンジは1画面に1か所だけ。

const paperBg = (g) => {
  g.fillStyle = T.paper;
  g.fillRect(0, 0, 1920, 1080);
  // 紙のムラ（コンクリート打ちっぱなしの壁のような）
  const grd = g.createRadialGradient(700, 300, 100, 960, 540, 1300);
  grd.addColorStop(0, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0.08)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1920, 1080);
};
const ink = (g, w = 3) => {
  g.strokeStyle = T.ink;
  g.fillStyle = T.ink;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
};
const text = (g, s, x, y, { size = 28, weight = 700, color = T.ink, font = T.jp, align = 'left', base = 'alphabetic' } = {}) => {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = base;
  g.fillText(s, x, y);
};

/* ---------- 圧縮と引張 ---------- */
let blockTex = null;
function concreteBlock() {
  if (blockTex) return blockTex;
  const L = buildSection(21);
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 900;
  const g = c.getContext('2d');
  for (const l of [L.paste, L.sand, L.gravel, L.air]) g.drawImage(l, 400, 300, 1600, 900, 0, 0, 1600, 900);
  blockTex = c;
  return c;
}
export const force = {
  draw(g, s) {
    paperBg(g);
    const { mode = 0 } = s.p;
    const k = s.k;
    const bw = 820, bh = 400, cx = 960, cy = 600;
    const tex = concreteBlock();
    const pull = mode >= 1 ? ease.out(range(k, 0.3, 1.2)) : 0;
    const crack = mode === 1 ? pull : mode === 2 ? Math.min(pull, 0.18) : 0;
    const gap = mode === 1 ? 10 * ease.outExpo(range(k, 1.0, 1.5)) : 0;
    const squish = mode === 0 ? 0.03 * ease.out(range(k, 0.3, 0.9)) : 0;
    const rand = mulberry32(5);
    const crackPts = [[0, -bh / 2]];
    for (let i = 1; i <= 12; i++) crackPts.push([(rand() - 0.5) * 46, -bh / 2 + (bh / 12) * i]);

    // 影
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.ellipse(cx, cy + bh / 2 + 34, bw * 0.55, 22, 0, 0, Math.PI * 2);
    g.fill();
    // ブロック（ひびが開くと左右に分かれる）
    for (const side of [-1, 1]) {
      g.save();
      g.translate(cx + (side * gap) / 2, cy);
      g.scale(1 + squish, 1 - squish);
      g.beginPath();
      if (mode === 1 && gap > 0) {
        // 片側だけを、ひびの線で切り取る
        g.moveTo(side * bw / 2, -bh / 2);
        for (const [x, y] of crackPts) g.lineTo(x, y);
        g.lineTo(side * bw / 2, bh / 2);
      } else if (side === 1) {
        g.restore();
        continue;
      } else {
        g.rect(-bw / 2, -bh / 2, bw, bh);
      }
      g.closePath();
      g.clip();
      g.drawImage(tex, -bw / 2, -bh / 2, bw, bh);
      // 鉄筋（オレンジ）
      if (mode === 2) {
        g.strokeStyle = T.accent;
        for (const y of [-120, -40, 40, 120]) {
          g.lineWidth = 16;
          line(g, -bw / 2 + 30, y, bw / 2 - 30, y);
          g.lineWidth = 3;
          for (let x = -bw / 2 + 40; x < bw / 2 - 30; x += 22) line(g, x, y - 10, x + 8, y + 10);
        }
      }
      g.restore();
    }
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = 'rgba(20,18,16,0.6)';
    g.lineWidth = 3;
    g.strokeRect(-bw / 2 - gap / 2, -bh / 2, bw + gap, bh);
    // ひびの線（伸びていく）
    if (crack > 0 && gap === 0) {
      g.strokeStyle = '#1b1916';
      g.lineWidth = 4;
      g.beginPath();
      const n = Math.max(1, Math.floor(crackPts.length * crack));
      crackPts.slice(0, n + 1).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    g.restore();

    // 力の矢印
    ink(g, 10);
    const a = 0.5 + 0.5 * Math.sin(s.t * 6) * (k > 0.3 ? 1 : 0);
    if (mode === 0) {
      for (const x of [-240, 0, 240]) {
        arrow(g, cx + x, cy - bh / 2 - 190 + a * 14, cx + x, cy - bh / 2 - 40 + a * 14, 34);
        arrow(g, cx + x, cy + bh / 2 + 190 - a * 14, cx + x, cy + bh / 2 + 60 - a * 14, 34);
      }
    } else {
      for (const y of [-90, 90]) {
        arrow(g, cx - bw / 2 - 40 - pull * 30, cy + y, cx - bw / 2 - 200 - pull * 30, cy + y, 34);
        arrow(g, cx + bw / 2 + 40 + pull * 30, cy + y, cx + bw / 2 + 200 + pull * 30, cy + y, 34);
      }
    }
  },
};

/* ---------- 歴史の年表（横に長い世界をカメラが進む） ---------- */
const EVENTS = [
  { year: '約1900年前', title: 'パンテオン（ローマ）', cap: '直径43.3mのドーム。鉄筋なしで、今も建っている', art: pantheon },
  { year: '1824', title: 'ポルトランドセメント誕生', cap: 'イギリスのアスプディンが特許をとる', art: kiln },
  { year: '1867', title: '鉄筋コンクリート誕生', cap: 'フランスの庭師モニエ。植木鉢を割れにくくしたかった', art: pot },
  { year: '1875', title: '日本でセメントづくりが始まる', cap: '東京・深川の官営工場で国産化', art: factory },
  { year: '1903', title: '日本初の鉄筋コンクリート橋', cap: '京都・琵琶湖疏水に今も残る', art: bridge },
  { year: 'いま', title: 'セメントは年間 約40億トン', cap: '世界の生産量。コンクリートは水の次に使われる物質', art: skyline },
];
const GAP = 1500;
export const timeline = {
  draw(g, s) {
    paperBg(g);
    const { cx = 0, cur = 0, hide = 0 } = s.p;
    const ox = 960 - (700 + cx * GAP);
    // 年表の線
    ink(g, 3);
    g.globalAlpha = 0.5;
    line(g, 0, 700, 1920, 700);
    g.globalAlpha = 1;
    EVENTS.forEach((ev, i) => {
      const x = ox + 700 + i * GAP;
      if (x < -900 || x > 2800) return;
      const isCur = Math.round(cur) === i;
      const reveal = i < Math.round(cur) ? 1 : isCur ? ease.out(range(s.k, 0.15, 1.3)) : 0;
      // 絵：左から描かれていく
      g.save();
      g.globalAlpha = i <= Math.round(cur) ? 1 : 0.14;
      g.beginPath();
      g.rect(x - 420, 120, 840 * (isCur ? reveal : 1), 560);
      g.clip();
      ink(g, 4);
      ev.art(g, x, 600);
      g.restore();
      // 点
      g.fillStyle = isCur ? T.accent : T.ink;
      g.beginPath();
      g.arc(x, 700, isCur ? 12 : 8, 0, Math.PI * 2);
      g.fill();
      // 文字（クイズ中は年を伏せる）
      g.globalAlpha = i <= Math.round(cur) ? 1 : 0.25;
      const yearHidden = isCur && hide > 0.5;
      text(g, yearHidden ? '？' : ev.year, x, 830, { size: ev.year.length > 4 ? 84 : 120, weight: 900, font: /\d/.test(ev.year) && ev.year.length === 4 ? T.en : T.jp, align: 'center' });
      if (yearHidden) {
        text(g, 'このドーム、何年前の建物？', x, 910, { size: 44, weight: 850, align: 'center' });
      } else {
        text(g, ev.title, x, 906, { size: 42, weight: 850, align: 'center' });
        text(g, ev.cap, x, 962, { size: 30, weight: 600, color: '#4a463f', align: 'center' });
      }
      g.globalAlpha = 1;
    });
  },
};
function pantheon(g, x, y) {
  // 基壇
  g.strokeRect(x - 330, y - 20, 660, 20);
  g.strokeRect(x - 300, y - 40, 600, 20);
  // ドーム（後ろ）
  g.beginPath();
  g.arc(x + 60, y - 230, 250, Math.PI, 0);
  g.stroke();
  g.beginPath();
  g.ellipse(x + 60, y - 478, 34, 8, 0, 0, Math.PI * 2);
  g.stroke();
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.arc(x + 60, y - 230, 250 - i * 6, Math.PI * (1 + i * 0.07), Math.PI * (1.5 - i * 0.05));
    g.stroke();
  }
  // ドラム（円筒部）
  g.strokeRect(x - 190, y - 230, 500, 190);
  // 正面の列柱と三角破風
  g.fillStyle = T.paper;
  g.fillRect(x - 280, y - 330, 300, 290);
  g.strokeRect(x - 280, y - 290, 300, 30);
  g.beginPath();
  g.moveTo(x - 290, y - 290);
  g.lineTo(x - 130, y - 380);
  g.lineTo(x + 30, y - 290);
  g.closePath();
  g.fillStyle = T.paper;
  g.fill();
  g.stroke();
  for (let i = 0; i < 6; i++) line(g, x - 262 + i * 52, y - 258, x - 262 + i * 52, y - 40);
  g.fillStyle = T.ink;
}
function kiln(g, x, y) {
  // 回転窯（斜めの長い筒）と煙突
  g.save();
  g.translate(x - 40, y - 150);
  g.rotate(-0.12);
  g.strokeRect(-300, -50, 560, 100);
  for (const r of [-180, -20, 140]) g.strokeRect(r, -62, 26, 124);
  g.restore();
  for (const sx of [-260, 0, 200]) line(g, x + sx - 40, y - 100 + sx * 0.1, x + sx - 40, y);
  line(g, x - 360, y, x + 330, y);
  g.strokeRect(x + 240, y - 420, 60, 420);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(x + 270 + i * 40, y - 460 - i * 50, 24 + i * 10, 0, Math.PI * 2);
    g.stroke();
  }
}
function pot(g, x, y) {
  g.beginPath();
  g.moveTo(x - 200, y - 300);
  g.lineTo(x + 200, y - 300);
  g.lineTo(x + 150, y);
  g.lineTo(x - 150, y);
  g.closePath();
  g.stroke();
  g.strokeRect(x - 220, y - 340, 440, 40);
  // 中の網（鉄筋）
  g.save();
  g.strokeStyle = T.accent;
  g.lineWidth = 3;
  for (let i = -3; i <= 3; i++) line(g, x + i * 48, y - 290, x + i * 38, y - 10);
  for (let j = 1; j <= 4; j++) line(g, x - 196 + j * 9, y - 300 + j * 60, x + 196 - j * 9, y - 300 + j * 60);
  g.restore();
  // 植物
  for (const [a, l] of [[-0.6, 200], [0, 240], [0.55, 190], [-0.25, 160], [0.3, 170]]) {
    const ex = x + Math.sin(a) * l, ey = y - 340 - Math.cos(a) * l;
    g.beginPath();
    g.moveTo(x, y - 340);
    g.quadraticCurveTo(x + Math.sin(a) * l * 0.3, ey + 60, ex, ey);
    g.stroke();
    g.beginPath();
    g.ellipse(ex, ey, 34, 14, a - 1, 0, Math.PI * 2);
    g.stroke();
  }
}
function factory(g, x, y) {
  line(g, x - 360, y, x + 360, y);
  g.beginPath();
  g.moveTo(x - 330, y);
  g.lineTo(x - 330, y - 180);
  for (let i = 0; i < 4; i++) {
    g.lineTo(x - 330 + i * 120 + 120, y - 260);
    g.lineTo(x - 330 + i * 120 + 120, y - 180);
  }
  g.lineTo(x + 150, y - 180);
  g.lineTo(x + 150, y);
  g.stroke();
  for (let i = 0; i < 4; i++) g.strokeRect(x - 300 + i * 110, y - 120, 60, 70);
  g.strokeRect(x + 200, y - 440, 56, 440);
  g.strokeRect(x + 190, y - 460, 76, 20);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(x + 240 + i * 45, y - 500 - i * 55, 26 + i * 12, 0, Math.PI * 2);
    g.stroke();
  }
}
function bridge(g, x, y) {
  // 水面
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    for (let j = 0; j <= 20; j++) g.lineTo(x - 360 + j * 36, y - 20 + i * 14 + Math.sin(j * 1.3 + i) * 4);
    g.stroke();
  }
  // アーチ橋
  g.strokeRect(x - 340, y - 260, 680, 36);
  g.beginPath();
  g.moveTo(x - 300, y - 30);
  g.quadraticCurveTo(x, y - 300, x + 300, y - 30);
  g.stroke();
  for (let i = -5; i <= 5; i++) {
    const t = (i + 5) / 10;
    const ay = (1 - t) * (1 - t) * (y - 30) + 2 * t * (1 - t) * (y - 300) + t * t * (y - 30);
    line(g, x + i * 55, y - 224, x + i * 55, ay);
  }
  line(g, x - 340, y - 260, x - 340, y - 30);
  line(g, x + 340, y - 260, x + 340, y - 30);
  for (let i = 0; i < 12; i++) line(g, x - 330 + i * 60, y - 300, x - 330 + i * 60, y - 260);
  line(g, x - 340, y - 300, x + 340, y - 300);
}
function skyline(g, x, y) {
  line(g, x - 380, y, x + 380, y);
  const b = [[-360, 220, 90], [-260, 360, 110], [-140, 280, 80], [-50, 460, 120], [80, 320, 90], [180, 400, 100], [290, 250, 80]];
  for (const [bx, h, w] of b) {
    g.strokeRect(x + bx, y - h, w, h);
    for (let wy = y - h + 24; wy < y - 20; wy += 34) for (let wx = x + bx + 16; wx < x + bx + w - 14; wx += 24) g.strokeRect(wx, wy, 8, 14);
  }
  // クレーン
  line(g, x + 360, y - 260, x + 360, y - 520);
  line(g, x + 200, y - 500, x + 440, y - 500);
  line(g, x + 360, y - 520, x + 200, y - 500);
  line(g, x + 230, y - 500, x + 230, y - 420);
}

/* ---------- 水和反応（顕微鏡の中） ---------- */
let grains = null;
export const hydration = {
  draw(g, s) {
    const { p = 0 } = s.p;
    g.fillStyle = '#101314';
    g.fillRect(0, 0, 1920, 1080);
    const cx = 1260, cy = 540, R = 450;
    if (!grains) {
      const rand = mulberry32(11);
      grains = [];
      for (let tries = 0; tries < 4000 && grains.length < 30; tries++) {
        const r = 22 + rand() * 30;
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (R - 40);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (grains.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 46)) continue;
        const n = 8;
        const pts = Array.from({ length: n }, (_, i) => {
          const aa = (i / n) * Math.PI * 2;
          const rr = r * (0.75 + rand() * 0.35);
          return [Math.cos(aa) * rr, Math.sin(aa) * rr];
        });
        const needles = Array.from({ length: 46 }, () => ({ a: rand() * Math.PI * 2, l: 24 + rand() * 80, d: rand() * 0.55, w: 1 + rand() * 1.4 }));
        const plates = rand() < 0.5 ? [{ a: rand() * 6.28, dist: r + 30 + rand() * 30, s: 10 + rand() * 12 }] : [];
        grains.push({ x, y, r, pts, needles, plates });
      }
    }
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    // 水 → だんだん「のり」で埋まって灰色に
    const fill = ease.inOut(range(p, 0.3, 1));
    g.fillStyle = `rgb(${Math.round(36 + fill * 120)},${Math.round(58 + fill * 100)},${Math.round(68 + fill * 86)})`;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    // 水のゆらぎ
    g.globalAlpha = 0.18 * (1 - fill);
    g.strokeStyle = '#cfe3ea';
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      for (let j = 0; j <= 30; j++) g.lineTo(cx - R + j * 32, cy - R + 60 + i * 100 + Math.sin(j * 0.6 + s.t * 1.5 + i) * 8);
      g.stroke();
    }
    g.globalAlpha = 1;
    // C-S-H の針（粒の表面から伸びて、すき間を埋める）
    for (const gr of grains) {
      for (const nd of gr.needles) {
        const grow = ease.out(clamp((p - nd.d) / (1 - nd.d + 0.001)));
        if (grow <= 0) continue;
        const len = nd.l * grow * (0.6 + p * 0.6);
        const sx = gr.x + Math.cos(nd.a) * gr.r * 0.85, sy = gr.y + Math.sin(nd.a) * gr.r * 0.85;
        g.strokeStyle = `rgba(236,230,216,${0.55 + 0.4 * grow})`;
        g.lineWidth = nd.w;
        line(g, sx, sy, sx + Math.cos(nd.a) * len, sy + Math.sin(nd.a) * len);
      }
      // 水酸化カルシウム（六角の板）
      for (const pl of gr.plates) {
        const k2 = ease.outBack(range(p, 0.55, 0.85));
        if (k2 <= 0) continue;
        g.save();
        g.translate(gr.x + Math.cos(pl.a) * pl.dist, gr.y + Math.sin(pl.a) * pl.dist);
        g.scale(k2, k2);
        g.beginPath();
        for (let i = 0; i < 6; i++) g.lineTo(Math.cos((i / 6) * 6.283) * pl.s, Math.sin((i / 6) * 6.283) * pl.s);
        g.closePath();
        g.fillStyle = 'rgba(210,225,230,0.55)';
        g.fill();
        g.restore();
      }
    }
    // セメントの粒（反応して少しずつ小さくなる）
    for (const gr of grains) {
      g.save();
      g.translate(gr.x, gr.y);
      const sc = 1 - 0.25 * ease.inOut(p);
      g.scale(sc, sc);
      g.beginPath();
      gr.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      const grd = g.createRadialGradient(-gr.r * 0.3, -gr.r * 0.3, 2, 0, 0, gr.r);
      grd.addColorStop(0, '#8b8e8f');
      grd.addColorStop(1, '#3d4042');
      g.fillStyle = grd;
      g.fill();
      g.restore();
    }
    g.restore();
    // 顕微鏡の枠
    g.strokeStyle = 'rgba(231,227,220,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
    g.globalAlpha = 0.35;
    line(g, cx - R - 30, cy, cx - R + 20, cy);
    line(g, cx + R - 20, cy, cx + R + 30, cy);
    line(g, cx, cy - R - 30, cx, cy - R + 20);
    line(g, cx, cy + R - 20, cx, cy + R + 30);
    g.globalAlpha = 1;
    // 呼び出し線
    // ラベルは画面の右端（x=1880）に右揃え。線は文字の左端まで
    const call = (tx, ty, ly, label, alpha) => {
      if (alpha <= 0) return;
      g.globalAlpha = alpha;
      g.font = `700 26px ${T.jp}`;
      const lx = 1880 - g.measureText(label).width - 14;
      g.strokeStyle = T.paper;
      g.lineWidth = 1.5;
      line(g, tx, ty, lx, ly - 9);
      g.fillStyle = T.paper;
      g.beginPath();
      g.arc(tx, ty, 5, 0, 6.283);
      g.fill();
      text(g, label, 1880, ly, { size: 26, weight: 700, color: T.paper, align: 'right' });
      g.globalAlpha = 1;
    };
    const g0 = grains.reduce((a, b) => (b.x - b.y * 0.5 > a.x - a.y * 0.5 ? b : a));
    call(g0.x, g0.y, 70, 'セメントの粒', 1 - range(p, 0.2, 0.35));
    call(cx + 200, cy + 330, 1030, '水', 1 - range(p, 0.2, 0.35));
    const g1 = grains.reduce((a, b) => (b.x + b.y * 0.3 > a.x + a.y * 0.3 ? b : a));
    call(g1.x + g1.r + 20, g1.y, 70, 'C-S-H（ケイ酸カルシウム水和物）＝結晶の「のり」', range(p, 0.3, 0.45));
  },
};

/* ---------- 水セメント比と強さ（イメージ図） ---------- */
export const chart = {
  draw(g, s) {
    paperBg(g);
    const { m = 0.45, show = 1 } = s.p;
    const X0 = 220, X1 = 1060, Y0 = 860, Y1 = 230;
    const wx = (w) => X0 + ((w - 0.3) / 0.45) * (X1 - X0);
    const fy = (w) => Y0 - Math.exp(-3.2 * (w - 0.3)) * (Y0 - Y1);
    ink(g, 3);
    arrow(g, X0, Y0, X1 + 60, Y0, 18);
    arrow(g, X0, Y0, X0, Y1 - 60, 18);
    text(g, '強さ', X0 - 24, Y1 - 80, { size: 30, weight: 800, align: 'right' });
    text(g, '水の量（水セメント比）', X1 + 60, Y0 + 60, { size: 26, weight: 700, align: 'right' });
    text(g, '少ない', X0, Y0 + 44, { size: 22, weight: 500, color: T.sub });
    text(g, '多い', X1, Y0 + 44, { size: 22, weight: 500, color: T.sub, align: 'right' });
    const draw = ease.inOut(range(s.k, 0.1, 1.4)) * show + (1 - show);
    g.lineWidth = 7;
    g.beginPath();
    for (let i = 0; i <= 100 * draw; i++) {
      const w = 0.3 + (i / 100) * 0.45;
      i ? g.lineTo(wx(w), fy(w)) : g.moveTo(wx(w), fy(w));
    }
    g.stroke();
    // 目印（オレンジ）
    if (draw > 0.95) {
      const x = wx(m), y = fy(m);
      g.setLineDash([8, 10]);
      g.lineWidth = 2;
      g.strokeStyle = T.sub;
      line(g, x, y, x, Y0);
      line(g, x, y, X0, y);
      g.setLineDash([]);
      g.fillStyle = T.accent;
      g.beginPath();
      g.arc(x, y, 18, 0, Math.PI * 2);
      g.fill();
    }
    text(g, '※ 考え方を示すイメージ図', X0, 1010, { size: 20, weight: 500, color: T.sub });
  },
};

/* ---------- 現場打ち と プレキャスト ---------- */
function culvert(g, x, y, s = 1, fill = '#cfc9bf') {
  // ボックスカルバート（四角いトンネルの部材）を斜め上から
  const w = 150 * s, h = 120 * s, d = 60 * s, t = 22 * s;
  g.fillStyle = fill;
  g.strokeStyle = T.ink;
  g.lineWidth = 3;
  // 奥行き面
  g.beginPath();
  g.moveTo(x, y - h); g.lineTo(x + d, y - h - d * 0.6); g.lineTo(x + w + d, y - h - d * 0.6); g.lineTo(x + w, y - h); g.closePath();
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(x + w, y - h); g.lineTo(x + w + d, y - h - d * 0.6); g.lineTo(x + w + d, y - d * 0.6); g.lineTo(x + w, y); g.closePath();
  g.fillStyle = '#b3ada3';
  g.fill(); g.stroke();
  // 正面（穴あき）
  g.beginPath();
  g.rect(x, y - h, w, h);
  g.rect(x + t, y - h + t, w - t * 2, h - t * 2);
  g.fillStyle = fill;
  g.fill('evenodd');
  g.stroke();
  g.fillStyle = '#3a3733';
  g.fillRect(x + t, y - h + t, w - t * 2, h - t * 2);
}
export const precast = {
  draw(g, s) {
    paperBg(g);
    const { phase = 0 } = s.p;
    const k = s.k;
    ink(g, 3);
    if (phase < 0.5) {
      // 現場打ち：手順が順番に並び、雨が降る
      const steps = ['型枠を組む', '鉄筋を組む', '流し込む', '固まるまで待つ', '型枠を外す'];
      steps.forEach((label, i) => {
        const a = ease.out(range(k, 0.2 + i * 0.25, 0.6 + i * 0.25));
        const x = 260 + i * 350, y = 620;
        g.globalAlpha = a;
        g.strokeRect(x - 110, y - 220, 220, 220);
        // それぞれのアイコン
        if (i === 0) { g.strokeRect(x - 70, y - 170, 140, 120); g.strokeRect(x - 50, y - 150, 100, 80); }
        if (i === 1) for (let j = 0; j < 4; j++) { line(g, x - 70, y - 170 + j * 36, x + 70, y - 170 + j * 36); line(g, x - 60 + j * 40, y - 180, x - 60 + j * 40, y - 60); }
        if (i === 2) { g.strokeRect(x - 70, y - 120, 140, 70); g.beginPath(); g.moveTo(x - 20, y - 190); g.lineTo(x + 20, y - 190); g.lineTo(x + 6, y - 130); g.lineTo(x - 6, y - 130); g.closePath(); g.stroke(); }
        if (i === 3) { g.beginPath(); g.arc(x, y - 110, 62, 0, 6.283); g.stroke(); line(g, x, y - 110, x, y - 155); line(g, x, y - 110, x + 34, y - 92); }
        if (i === 4) { g.strokeRect(x - 70, y - 150, 140, 100); line(g, x - 90, y - 170, x - 60, y - 140); line(g, x + 90, y - 170, x + 60, y - 140); }
        text(g, label, x, y + 60, { size: 30, weight: 800, align: 'center' });
        if (i < 4) arrow(g, x + 130, y - 110, x + 210, y - 110, 16);
        g.globalAlpha = 1;
      });
      // 雨（現場は天気に左右される）
      const rain = range(k, 1.6, 2.2);
      if (rain > 0) {
        g.strokeStyle = `rgba(80,100,115,${0.5 * rain})`;
        g.lineWidth = 2;
        const rand = mulberry32(9);
        for (let i = 0; i < 160; i++) {
          const x = rand() * 1920, sp = 900 + rand() * 500;
          const y = (rand() * 1080 + s.t * sp) % 1180 - 100;
          line(g, x, y, x - 10, y + 34);
        }
      }
      return;
    }
    // プレキャスト：工場でつくり、運び、並べる
    line(g, 80, 820, 1840, 820);
    // 工場
    g.beginPath();
    g.moveTo(120, 820); g.lineTo(120, 560);
    for (let i = 0; i < 3; i++) { g.lineTo(120 + i * 110 + 110, 480); g.lineTo(120 + i * 110 + 110, 560); }
    g.lineTo(470, 560); g.lineTo(470, 820);
    g.stroke();
    text(g, '工場', 295, 880, { size: 30, weight: 800, align: 'center' });
    text(g, '屋根の下で、決まった手順で', 295, 920, { size: 22, weight: 500, color: T.sub, align: 'center' });
    if (phase < 1.5) {
      // ベルトコンベアで次々に出てくる
      line(g, 470, 820, 1180, 820);
      for (let i = 0; i < 4; i++) {
        const x = 480 + ((s.t * 120 + i * 200) % 800);
        if (x < 1150) culvert(g, x, 812, 0.9);
      }
      text(g, '同じ品質のものを、くり返しつくれる', 820, 900, { size: 26, weight: 700, align: 'center' });
      return;
    }
    // 現場：クレーンで並べる
    text(g, '現場', 1350, 880, { size: 30, weight: 800, align: 'center' });
    text(g, '並べて、つなぐだけ', 1350, 920, { size: 22, weight: 500, color: T.sub, align: 'center' });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = ease.outBack(range(k, 0.2 + i * 0.35, 0.6 + i * 0.35));
      const x = 900 + i * 150;
      const y = 812 - (1 - a) * 380;
      if (a > 0) culvert(g, x, y, 1, i === n - 1 && a < 1 ? '#d8d2c8' : '#cfc9bf');
    }
    // クレーン（フックだけオレンジ）
    const hookX = 900 + Math.min(n - 1, Math.floor(range(k, 0.2, 0.2 + n * 0.35) * n)) * 150 + 75;
    ink(g, 5);
    line(g, 1820, 820, 1820, 140);
    line(g, 760, 160, 1880, 160);
    line(g, 1820, 120, 1300, 160);
    g.strokeStyle = T.accent;
    g.lineWidth = 3;
    line(g, hookX, 160, hookX, 360);
    g.lineWidth = 8;
    g.beginPath();
    g.arc(hookX, 380, 18, -Math.PI / 2, Math.PI);
    g.stroke();
  },
};

/* ---------- 文字だけの画面（明 / 暗） ---------- */
export const plain = {
  draw(g, s) {
    if ((s.p.dark ?? 0) > 0.5) {
      g.fillStyle = T.dark;
      g.fillRect(0, 0, 1920, 1080);
    } else paperBg(g);
  },
};

/* ---------- ワークのタイマー ---------- */
export const timer = {
  draw(g, s) {
    g.fillStyle = T.dark;
    g.fillRect(0, 0, 1920, 1080);
    const total = s.p.seconds ?? 180;
    const left = Math.max(0, total - (s.timerElapsed ?? 0));
    const cx = 1380, cy = 540, R = 300;
    g.strokeStyle = 'rgba(231,227,220,0.14)';
    g.lineWidth = 18;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = left <= 30 ? T.accent : T.paper;
    g.lineCap = 'butt';
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (left / total) * Math.PI * 2);
    g.stroke();
    const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
    text(g, `${mm}:${String(ss).padStart(2, '0')}`, cx, cy + 70, { size: 200, weight: 800, font: T.en, color: T.paper, align: 'center' });
    text(g, s.timerElapsed == null ? 'クリックでスタート' : left === 0 ? 'そこまで！' : '', cx, cy + 160, { size: 26, weight: 600, color: 'rgba(231,227,220,0.6)', align: 'center' });
  },
};

export const SECTION_SIZE = { W: SW, H: SH };
