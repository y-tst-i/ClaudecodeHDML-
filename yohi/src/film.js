// YOHI IWAKIRI — 15秒のロゴ映像 v3。1枚のシェーダーで全カットを描く（時刻 t だけで画が決まる）。
// 絵の質感は実写素材（Codex生成）、動き・合成・グリッチはコード。
import { NOISE } from './noise.js';

export const BPM = 120; // 1拍 0.5秒
export const DURATION = 15;

export const frag = /* glsl */ `
precision highp float;
uniform sampler2D tA, tB, tD, tWall, tPaper, tGrain, tCrt, tMetal;
uniform float uT; uniform vec2 uRes;
varying vec2 vUv;
${NOISE}
const float ASP = 16.0 / 9.0;
const vec3 INK = vec3(0.06, 0.055, 0.06);
const vec3 ORANGE = vec3(1.0, 0.353, 0.122);
const float BEAT = 0.5;

float clamp01(float x){ return clamp(x, 0.0, 1.0); }
float range(float t, float a, float b){ return clamp01((t - a) / (b - a)); }
float outExpo(float x){ return x >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * x); }
float outBack(float x){ float c = 1.70158; return 1.0 + (c + 1.0) * pow(x - 1.0, 3.0) + c * pow(x - 1.0, 2.0); }
float inOut(float x){ return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }

// 画面座標 q（横 ±0.889、縦 ±0.5）→ ロゴ画像の uv（画像は 3:2）
vec2 logoUV(vec2 q, vec2 c, float w, float rot){
  vec2 d = q - c;
  float s = sin(rot), co = cos(rot);
  d = vec2(co * d.x - s * d.y, s * d.x + co * d.y);
  return d / (vec2(w, w / 1.5) * 2.0) + 0.5;
}
float inBox(vec2 u){ return step(0.0, u.x) * step(u.x, 1.0) * step(0.0, u.y) * step(u.y, 1.0); }
float logoA(sampler2D s, vec2 u){ return texture2D(s, u).a * inBox(u); }

// スプレーで描かれていく：左から右へ、ざらついた境界で現れる
float sprayReveal(vec2 u, float k){
  float edge = mix(-0.08, 1.08, k);
  float n = (vnoise(u * vec2(60.0, 40.0)) - 0.5) * 0.05 + (vnoise(u * 9.0) - 0.5) * 0.04;
  return smoothstep(edge + 0.015, edge - 0.015, u.x + n);
}

// ---------- C1 SIGNAL：ブラウン管の中で、D が帯ごとに組み上がる ----------
vec3 cutSignal(vec2 uv, float t){
  // 画面の歪み（ブラウン管のふくらみ）
  vec2 cc = uv - 0.5;
  cc *= 1.0 + dot(cc, cc) * 0.18;
  vec2 u2 = cc + 0.5;
  vec3 glass = texture2D(tCrt, u2).rgb * 0.45;
  vec2 q = (u2 - 0.5) * vec2(ASP, 1.0);
  // 2.0s（拍の頭）で電圧が跳ね上がる：ロゴが一瞬大きく、画面が揺れて白く焼ける
  float hit = step(2.0, t) * exp(-(t - 2.0) * 7.0);
  vec2 jolt = (vec2(hash12(vec2(floor(t * 30.0), 51.0)), hash12(vec2(floor(t * 30.0), 52.0))) - 0.5) * 0.03 * hit;
  vec2 lu = logoUV(q + jolt, vec2(0.0, -0.06), 0.6 * (1.0 + 0.16 * hit), 0.0);
  float band = floor(lu.y * 8.0);
  float start = 0.2 + (7.0 - band) * 0.17;   // 上の帯から順に、16分音符くらいの速さで畳みかける
  float k = outBack(range(t, start, start + 0.22));
  float dir = mod(band, 2.0) < 0.5 ? 1.0 : -1.0;
  vec2 lu2 = lu + vec2(dir * (1.0 - k) * 1.3, 0.0);
  // 動いている帯は横に流れる（モーションブラー）
  float blur = (1.0 - k) * 0.12;
  float mb = 0.0;
  for (int i = 0; i < 5; i++) mb += logoA(tD, lu2 + vec2(dir * blur * float(i) / 4.0, 0.0));
  mb /= 5.0;
  float on1 = step(0.001, k);
  // ガラス越しの像：画面の端ほど RGB の電子ビームが揃わず（色がにじみ）、暗くなる
  float conv = cc.x * 0.012;
  conv += hit * 0.02;
  vec3 a3 = (k < 0.999 ? vec3(mb) : vec3(logoA(tD, lu2 + vec2(conv, 0.0)), logoA(tD, lu2), logoA(tD, lu2 - vec2(conv, 0.0)))) * on1;
  // 蛍光体の光：近いにじみと、遠いにじみの2重
  float glow = 0.0, bleed = 0.0;
  for (int i = 0; i < 8; i++) {
    float an = float(i) / 8.0 * 6.2831 + 0.39;
    vec2 dir8 = vec2(cos(an), sin(an));
    glow += logoA(tD, lu2 + dir8 * 0.010);
    bleed += logoA(tD, lu2 + dir8 * 0.028);
  }
  glow = glow / 8.0 * on1; bleed = bleed / 8.0 * on1;
  vec3 phos = vec3(0.78, 1.0, 0.86);
  float flick = 0.92 + 0.08 * hash12(vec2(floor(t * 30.0), 3.0));
  float edgeFall = 1.0 - 0.45 * pow(abs(cc.x) * 2.0, 2.0);
  vec3 col = glass + (phos * a3 * 1.15 + phos * glow * 0.4 + vec3(0.35, 0.6, 0.45) * bleed * 0.35) * flick * edgeFall;
  // 衝撃の光：全体が焼けて、ロゴの高さに横一文字の光の筋
  col += phos * hit * (0.55 + 1.2 * exp(-abs(q.y + 0.06) * 18.0)) + phos * glow * hit * 1.5;
  // その後は拍ごとに呼吸する
  col *= 1.0 + 0.12 * step(2.0, t) * exp(-mod(t - 2.0, BEAT) * 8.0);
  // 走査線と、ゆっくり下りるロール帯
  col *= 0.82 + 0.18 * sin(u2.y * uRes.y * 3.14159);
  col += vec3(0.05, 0.07, 0.06) * smoothstep(0.08, 0.0, abs(fract(u2.y - t * 0.35) - 0.5));
  // 画面の外は真っ黒
  col *= step(0.0, u2.x) * step(u2.x, 1.0) * step(0.0, u2.y) * step(u2.y, 1.0);
  // 電源が入る：中央の横線から開く
  float on = outExpo(range(t, 0.0, 0.35));
  col *= smoothstep(0.5 * on + 0.002, 0.5 * on - 0.002, abs(uv.y - 0.5));
  return col;
}

// ---------- C2 STREET：夜の壁に B がスプレーで描かれ、垂れる ----------
// 手で描くリズム：速く走る → 一瞬溜める → 「I」を一気に → 残りを描き切る
float penFront(float t){
  if (t < 0.2) return -0.1;
  if (t < 0.62) return mix(-0.1, 0.42, inOut(range(t, 0.2, 0.62)));
  if (t < 0.85) return 0.42 + 0.01 * range(t, 0.62, 0.85);
  if (t < 1.0) return mix(0.43, 0.56, range(t, 0.85, 1.0));
  return mix(0.56, 1.1, inOut(range(t, 1.0, 1.75)));
}
bool isThin(vec2 u){ return logoA(tB, u + vec2(0.009, 0.0)) + logoA(tB, u - vec2(0.009, 0.0)) < 0.3; }
float sprayFront(vec2 u, float edge){
  float n = (vnoise(u * vec2(60.0, 40.0)) - 0.5) * 0.05 + (vnoise(u * 9.0) - 0.5) * 0.04;
  return smoothstep(edge + 0.015, edge - 0.015, u.x + n);
}
vec3 cutStreet(vec2 uv, float t){
  // 描き終わり（拍の頭 2.0s）でカメラがぐっと寄る
  float push = outExpo(range(t, 2.0, 2.35));
  float z = 1.0 + t * 0.012 + push * 0.05;
  vec2 shake = vec2(vnoise(vec2(t * 3.0, 1.0)) - 0.5, vnoise(vec2(t * 3.0, 7.0)) - 0.5) * 0.006;
  shake += vec2(0.0, 0.006) * (1.0 - range(t, 2.0, 2.2)) * step(2.0, t);
  vec2 wu = (uv - 0.5) / z + 0.5 + shake;
  vec3 wall = texture2D(tWall, wu).rgb;
  wall *= 0.9 + 0.1 * hash12(vec2(floor(t * 12.0), 9.0)); // ナトリウム灯のちらつき
  vec2 q = (wu - 0.5) * vec2(ASP, 1.0);
  vec2 lu = logoUV(q, vec2(0.0, 0.02), 0.78, -0.03);
  float front = penFront(t);
  float sweep = sprayFront(lu, front);
  // 垂れ：細い縦の線（＝滴り）だけを、描き終わってから重力で加速しながら伸ばす
  float g = range(t, 1.5, 2.9);
  float grow = g * g * (3.0 - 2.0 * g) * 0.2;
  float drip = 1.0;
  if (isThin(lu)) {
    float dd = 0.2;   // 上にある太い塗り（滴りの根元）までの距離
    for (int i = 1; i <= 20; i++) {
      vec2 up = lu + vec2(0.0, float(i) * 0.01);
      if (dd > 0.19 && logoA(tB, up) > 0.5 && !isThin(up)) dd = float(i) * 0.01;
    }
    drip = step(dd, grow);
  }
  float a = logoA(tB, lu) * sweep * drip;
  // 描き終わり（2.0s）から、塗料が長く垂れていく。1本ごとに位置・長さ・速さが違う
  float run = range(t, 1.95, 3.0);
  float wet = 0.0;
  float col60 = floor(lu.x * 60.0);
  float hasDrip = step(0.72, hash12(vec2(col60, 7.0)));
  float cx = (col60 + 0.3 + 0.4 * hash12(vec2(col60, 8.0))) / 60.0;
  float dw = 0.0045 + 0.004 * hash12(vec2(col60, 9.0));
  if (run > 0.0 && hasDrip > 0.5 && abs(lu.x - cx) < dw * 2.6 && lu.y > -0.3 && lu.y < 0.9 && logoA(tB, lu) < 0.5) {
    float dy = 1.0;   // 真上の塗り（垂れの根元）までの距離
    for (int i = 1; i <= 50; i++) {
      float d = float(i) * 0.006;
      if (dy > 0.99 && logoA(tB, vec2(cx, lu.y + d)) > 0.6) dy = d;
    }
    // 根元の位置を二分探索で細かく求める（粗いと先の玉がカクつく）
    float lo = dy - 0.006, hi = dy;
    for (int i = 0; i < 5; i++) {
      float m = (lo + hi) * 0.5;
      if (logoA(tB, vec2(cx, lu.y + m)) > 0.6) hi = m; else lo = m;
    }
    if (dy < 0.99) dy = hi;
    float rnd = hash12(vec2(col60, 3.0));
    float len = run * run * (0.07 + 0.2 * rnd) / (0.55 + 0.45 * rnd);
    float x = abs(lu.x - cx);
    float w = dw * mix(1.3, 0.75, dy / max(len, 0.001)) * (0.88 + 0.24 * vnoise(vec2(dy * 30.0, col60)));   // 根元は太く、先へ細く、少し揺らぐ            // 下へ行くほど少し細く
    float line = smoothstep(len + 0.004, len - 0.004, dy) * smoothstep(w, w * 0.6, x);
    float bead = smoothstep(dw * 1.9, dw * 1.5, length(vec2(x, (dy - len) / 1.5 + dw * 0.5)));   // 縦横比を補正して丸く   // 先の玉
    wet = max(line, bead * step(0.02, len)) * step(dy, 0.99);
  }
  a = max(a, wet);
  // 塗料の厚み：線の芯は濃く、縁は薄く壁が透ける
  float core = 0.0, mist = 0.0;
  for (int i = 0; i < 8; i++) {
    float an = float(i) / 8.0 * 6.2831;
    vec2 d8 = vec2(cos(an), sin(an));
    core += logoA(tB, lu + d8 * 0.006);
    mist += logoA(tB, lu + d8 * 0.03);
  }
  core = smoothstep(0.55, 1.0, core / 8.0);
  mist = mist / 8.0 * sweep * (0.3 + 0.7 * drip);
  // 縁の飛沫：線のまわりに細かい点（壁の座標で固定）
  float speck = step(0.955, hash12(floor(wu * vec2(1100.0, 620.0)))) * smoothstep(0.02, 0.35, mist) * (1.0 - a);
  float tex = vnoise(wu * 420.0);
  vec3 paint = mix(vec3(0.8, 0.79, 0.75), vec3(0.98, 0.97, 0.94), core) * (0.9 + 0.1 * tex);
  float dens = mix(0.68, 1.0, core) * (0.9 + 0.1 * tex);
  // ノズルの先：描いている位置が霧で明るく光る
  float nozzle = exp(-pow((lu.x - front) * 14.0, 2.0)) * step(0.2, t) * step(t, 1.75) * smoothstep(0.0, 0.3, mist + a);
  vec3 col = wall * (1.0 + mist * 0.3 + nozzle * 0.3);
  col = mix(col, paint, a * dens);
  col = mix(col, vec3(0.9, 0.89, 0.85), speck * 0.75);
  col += vec3(0.1) * wet * (0.6 + 0.4 * sin(lu.y * 90.0 - t * 6.0)); // 濡れたつや
  return col;
}

// ---------- C3 MODE ----------
// 「刷り」（v2のA/BでB案に決定）：紙が送られてきて、拍ごとにオレンジ版 → 黒版がガシャンと刷られ、最後に版がぴたっと揃う
vec3 cutMode(vec2 uv, float t){
  float feed = outExpo(range(t, 0.0, 0.4));
  float kick = 0.0; // 刷った瞬間の衝撃
  kick += (1.0 - range(t, 0.5, 0.62)) * step(0.5, t);
  kick += (1.0 - range(t, 1.0, 1.12)) * step(1.0, t);
  kick += 1.4 * (1.0 - range(t, 1.5, 1.66)) * step(1.5, t);
  vec2 sh = vec2(hash12(vec2(floor(t * 30.0), 5.0)) - 0.5, hash12(vec2(floor(t * 30.0), 6.0)) - 0.5) * 0.012 * kick;
  vec2 pu = uv + vec2(0.0, (1.0 - feed) * -1.05) + sh;   // 紙は下から送られてくる
  vec3 paper = texture2D(tPaper, pu).rgb * 1.02;
  vec2 q = (pu - 0.5) * vec2(ASP, 1.0);
  // 黒版は 1.5s まで大きくずれていて、拍の頭で一発で揃う
  float lock = step(1.5, t);
  vec2 offB = mix(vec2(-0.03, 0.022), vec2(0.0), lock);
  float punchO = 1.0 + 0.05 * (1.0 - outExpo(range(t, 0.5, 0.62)));
  float punchB = 1.0 + 0.05 * (1.0 - outExpo(range(t, 1.0, 1.12))) + 0.03 * (1.0 - outExpo(range(t, 1.5, 1.66))) * lock;
  vec2 luO = logoUV(q, vec2(0.0, 0.02), 0.8 * punchO, 0.0);
  vec2 luB = logoUV(q, vec2(0.0, 0.02) + offB, 0.8 * punchB, 0.0);
  float aO = logoA(tA, luO) * step(0.5, t);
  float aB = logoA(tA, luB) * step(1.0, t);
  // インクの手触り：黒ベタに紙の繊維に沿った細かな抜け
  float grain = texture2D(tGrain, pu).r;
  float fibre = vnoise(pu * vec2(900.0, 90.0));
  aB *= 1.0 - smoothstep(0.55, 0.85, grain * 0.6 + fibre * 0.6) * 0.8;
  aO *= 1.0 - grain * 0.4;
  // 揃ったあと、オレンジは黒の下からほんの少しだけ縁にのぞく
  vec2 luO2 = logoUV(q, vec2(0.003, 0.017), 0.8, 0.0);
  float aOedge = logoA(tA, luO2) * lock;
  vec3 col = paper;
  col *= mix(vec3(1.0), ORANGE, max(aO * (1.0 - lock), aOedge * 0.9));
  col *= mix(vec3(1.0), INK / max(paper, vec3(0.01)), aB * 0.97);
  // 紙の外は暗い台
  col *= step(0.0, pu.y) * 0.85 + 0.15;
  return col;
}

// ---------- C5 LOCKUP：金属の上で D と A。最後に B をオレンジで吹き付ける ----------
vec3 cutLockup(vec2 uv, float t){
  vec3 metal = texture2D(tMetal, uv).rgb * 0.7;
  float sweepX = mix(-0.3, 1.3, range(t, 0.2, 2.6));
  metal += vec3(0.12, 0.12, 0.13) * exp(-pow((uv.x + uv.y * 0.3 - sweepX) * 5.0, 2.0));
  vec2 q = (uv - 0.5) * vec2(ASP, 1.0);
  // D：上から落ちて止まる
  float dk = outBack(range(t, 0.0, 0.45));
  vec2 luD = logoUV(q, vec2(0.0, 0.16 + (1.0 - dk) * 0.6), 0.36, 0.0);
  float aD = logoA(tD, luD) * step(0.3, luD.y); // マークだけ（下の名前は使わない）
  // 金属の D：筋目の明暗＋光の帯
  float lum = dot(texture2D(tMetal, uv * 1.7).rgb, vec3(0.33));
  vec3 dCol = vec3(0.86, 0.87, 0.9) * (0.65 + lum * 0.7) + vec3(0.6) * exp(-pow((uv.x - sweepX) * 8.0, 2.0));
  // A：縦に伸びて現れる
  vec2 luA = logoUV(q, vec2(0.0, -0.205), 0.52, 0.0);
  float sa = outExpo(range(t, 0.35 + floor(luA.x * 16.0) * 0.03, 0.85 + floor(luA.x * 16.0) * 0.03));
  vec2 luA2 = vec2(luA.x, (luA.y - 0.5) / max(sa, 0.001) + 0.5);
  float aA = logoA(tA, luA2) * step(0.001, sa);
  // B：斜めにオレンジで吹き付け
  vec2 luB = logoUV(q, vec2(0.36, -0.33), 0.4, -0.14); // 右下にサインのように
  float bk = range(t, 0.9, 1.9);
  float aB = logoA(tB, luB) * sprayReveal(luB, bk);
  vec3 col = metal;
  col = mix(col, dCol, aD);
  col = mix(col, vec3(0.93, 0.92, 0.88), aA);
  col = mix(col, ORANGE * (0.92 + 0.08 * vnoise(uv * 300.0)), aB * 0.97);
  return col;
}

// ---------- C4 ----------
vec3 pickFace(vec2 uv, float slot){
  float m = floor(hash12(vec2(slot, 21.0)) * 3.0);
  if (m < 0.5) return cutSignal(uv, 2.99);
  if (m < 1.5) return cutStreet(uv, 2.99);
  return cutMode(uv, 2.99);
}
// 「整えたグリッチ」（v2のA/BでB案に決定）：色ずれは赤とシアンの細い縁だけ。横ずれは画面の一部の帯だけ
vec3 cutGlitch(vec2 uv, float t){
  float slot = floor(t / 0.25);
  float h = hash12(vec2(slot, 4.0));
  float row = floor(uv.y * 24.0);
  float bandC = floor(hash12(vec2(slot, 13.0)) * 18.0) + 3.0;   // ずれる帯はこの付近の数本だけ
  vec2 u = uv;
  if (abs(row - bandC) < 2.0 && hash12(vec2(row, slot)) > 0.35) u.x += (hash12(vec2(row, slot + 9.0)) - 0.5) * 0.07;
  float sp = 0.003 + 0.003 * h;
  vec3 col = pickFace(u, slot);
  col.r = pickFace(u + vec2(sp, 0.0), slot).r;
  float fl = 1.0 - range(mod(t, BEAT), 0.0, 0.06);
  return mix(col, vec3(1.0), fl * 0.12);
}

void main(){
  vec2 uv = vUv;
  float t = uT;
  vec3 col;
  if (t < 3.0) col = cutSignal(uv, t);
  else if (t < 6.0) col = cutStreet(uv, t - 3.0);
  else if (t < 9.0) col = cutMode(uv, t - 6.0);
  else if (t < 12.0) col = cutGlitch(uv, t - 9.0);
  else col = cutLockup(uv, t - 12.0);
  // カットの頭に1コマの白フラッシュ
  float cut = min(min(abs(t - 3.0), abs(t - 6.0)), min(abs(t - 9.0), abs(t - 12.0)));
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.05, cut)) * step(0.0, t - 2.9) * 0.8);
  // 仕上げ：フィルムの粒子（毎フレーム位置を変える）とビネット
  vec2 gu = uv * vec2(1.0, 1.0) + vec2(hash12(vec2(floor(t * 24.0), 1.0)), hash12(vec2(floor(t * 24.0), 2.0)));
  col += (texture2D(tGrain, fract(gu)).r - 0.15) * 0.05;
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;
