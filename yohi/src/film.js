// YOHI IWAKIRI — 15秒のロゴ映像。1枚のシェーダーで全カットを描く（時刻 t だけで画が決まる）。
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
  vec2 lu = logoUV(q, vec2(0.0, -0.06), 0.52, 0.0);
  float band = floor(lu.y * 8.0);
  float start = 0.25 + (7.0 - band) * 0.25;   // 上の帯から順に、8分音符ごと
  float k = outBack(range(t, start, start + 0.3));
  float dir = mod(band, 2.0) < 0.5 ? 1.0 : -1.0;
  vec2 lu2 = lu + vec2(dir * (1.0 - k) * 1.3, 0.0);
  float a = logoA(tD, lu2) * step(0.001, k);
  // 蛍光体の光：にじみ（周囲のサンプル）
  float glow = 0.0;
  for (int i = 0; i < 8; i++) {
    float an = float(i) / 8.0 * 6.2831;
    glow += logoA(tD, lu2 + vec2(cos(an), sin(an)) * 0.012);
  }
  glow /= 8.0;
  vec3 phos = vec3(0.78, 1.0, 0.86);
  float flick = 0.92 + 0.08 * hash12(vec2(floor(t * 30.0), 3.0));
  vec3 col = glass + phos * (a * 1.15 + glow * 0.45) * flick;
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
vec3 cutStreet(vec2 uv, float t){
  float z = 1.06 + t * 0.012;
  vec2 shake = vec2(vnoise(vec2(t * 3.0, 1.0)) - 0.5, vnoise(vec2(t * 3.0, 7.0)) - 0.5) * 0.006;
  vec2 wu = (uv - 0.5) / z + 0.5 + shake;
  vec3 wall = texture2D(tWall, wu).rgb;
  wall *= 0.9 + 0.1 * hash12(vec2(floor(t * 12.0), 9.0)); // ナトリウム灯のちらつき
  vec2 q = (wu - 0.5) * vec2(ASP, 1.0);
  vec2 lu = logoUV(q, vec2(0.0, 0.02), 0.78, -0.03);
  float k = range(t, 0.25, 1.9);
  float sweep = sprayReveal(lu, k);
  // 垂れ：文字の下側は、描き終わってから上→下へ伸びる
  float dripEdge = mix(0.42, 0.0, inOut(range(t, 1.6, 2.9)));
  float drip = lu.y > 0.42 ? 1.0 : step(dripEdge, lu.y);
  float a = logoA(tB, lu) * sweep * drip;
  // 吹き付けの霧（周りにうっすら）
  float mist = 0.0;
  for (int i = 0; i < 6; i++) {
    float an = float(i) / 6.0 * 6.2831;
    mist += logoA(tB, lu + vec2(cos(an), sin(an)) * 0.03);
  }
  mist = mist / 6.0 * sweep;
  // 白っぽいスプレー（チョークのように少しかすれる）。壁の凹凸で、ところどころ薄く
  vec3 paint = vec3(0.93, 0.91, 0.86) * (0.86 + 0.14 * vnoise(wu * 420.0));
  vec3 col = wall * (1.0 + mist * 0.25);
  col = mix(col, paint, a * (0.9 - 0.25 * smoothstep(0.55, 0.2, dot(wall, vec3(0.33)))));
  // ノズルの位置に、霧の明るい点
  return col;
}

// ---------- C3 MODE：紙に A。縦に伸びて現れ、版ズレした2色がぴたっと揃う ----------
vec3 cutMode(vec2 uv, float t){
  vec3 paper = texture2D(tPaper, uv).rgb * 1.02;
  vec2 q = (uv - 0.5) * vec2(ASP, 1.0);
  vec2 lu = logoUV(q, vec2(0.0, 0.02), 0.8, 0.0);
  float col16 = floor(lu.x * 16.0);
  float s = outExpo(range(t, 0.15 + col16 * 0.055, 0.75 + col16 * 0.055));
  vec2 lu2 = vec2(lu.x, (lu.y - 0.5) / max(s, 0.001) + 0.5);
  float mis = 1.0 - inOut(range(t, 1.5, 2.6));
  vec2 off = vec2(0.014, -0.01) * mis;
  float aBlack = logoA(tA, lu2) * step(0.001, s);
  float aOrange = logoA(tA, lu2 + off) * step(0.001, s);
  // インクのかすれ（リソグラフの粒子）
  float grain = texture2D(tGrain, uv * 1.0).r;
  aBlack *= 1.0 - grain * 0.55;
  aOrange *= 1.0 - grain * 0.45;
  vec3 col = paper;
  col *= mix(vec3(1.0), ORANGE, aOrange * 0.95 * mis + aOrange * 0.0);
  col *= mix(vec3(1.0), INK / max(paper, vec3(0.01)), aBlack * 0.97);
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

// ---------- C4 GLITCH：3つの顔が高速に入れ替わる ----------
vec3 pickFace(vec2 uv, float slot){
  float m = floor(hash12(vec2(slot, 21.0)) * 3.0);
  if (m < 0.5) return cutSignal(uv, 2.99);
  if (m < 1.5) return cutStreet(uv, 2.99);
  return cutMode(uv, 2.99);
}
vec3 cutGlitch(vec2 uv, float t){
  float slot = floor(t / 0.25);
  float h = hash12(vec2(slot, 4.0));
  // ブロックのずれ
  float row = floor(uv.y * 18.0);
  float hr = hash12(vec2(row, slot));
  vec2 u = uv;
  if (hr > 0.72) u.x += (hash12(vec2(row, slot + 9.0)) - 0.5) * 0.18;
  // RGB のずれ
  float sp = 0.006 + 0.012 * h;
  vec3 col;
  col.r = pickFace(u + vec2(sp, 0.0), slot).r;
  col.g = pickFace(u, slot).g;
  col.b = pickFace(u - vec2(sp, 0.0), slot).b;
  // ときどき反転
  if (hash12(vec2(slot, 11.0)) > 0.75) col = 1.0 - col;
  // 拍の頭で白く光る
  float fl = 1.0 - range(mod(t, BEAT), 0.0, 0.08);
  return mix(col, vec3(1.0), fl * 0.25);
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
