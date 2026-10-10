import * as THREE from 'three';

// 歩きの仮の動き（ARDY の .npz が来るまでの代わり）。すべて時刻 t の純関数。
//
// 先に「足跡」を決め、そこから全部を決める:
//   - 足は着いている間、足跡の位置に固定（滑らない・つま先歩きにならない）
//   - 腰は「着地の瞬間に両足の中点」を通るように、なめらかにつなぐ
//   - かかと着地 → 足裏を床へ → かかとが浮く → つま先で蹴る、を足の傾き（pitch）で表す
// ツールキットの foot_correct.py が ARDY の動きを直す内容（足は平ら・腰は両足の平均・ひざは IK）を、
// 最初から満たすように作る。

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// 単調な3次補間（Fritsch–Carlson）。腰の進み方が後戻りしないように
function monotoneCubic(xs, ys) {
  const n = xs.length;
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); m[i] = s * a * d[i]; m[i + 1] = s * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], u = (x - xs[i]) / h;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u;
    const h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };
}

// opts: { points: THREE.Vector3[]（床の上の通り道）, tStart, stepLen, stepTime, halfWidth, foot: {ankle, ball, heel} }
export function createGait(opts) {
  const { tStart, stepTime, halfWidth, foot } = opts;
  const curve = new THREE.CatmullRomCurve3(opts.points, false, 'centripetal');
  const L = curve.getLength();
  const tSwing = stepTime * 0.8; // 1歩の時間のうち足が浮いている割合（両足支持は残り）

  // 足跡。k=0,1 は立っている最初の両足。最初の一歩は半歩、最後は両足をそろえる
  const n = Math.max(1, Math.ceil(L / opts.stepLen + 0.5));
  const Ls = L / (n - 0.5);
  // side: +1 = 左足（キャラの左＝進行方向に対して左）、-1 = 右足
  const steps = [
    { side: -1, d: 0, t: -Infinity, len: 0 },
    { side: 1, d: 0, t: -Infinity, len: 0 },
  ];
  for (let k = 1; k <= n + 1; k++) {
    const d = k <= n ? (k - 0.5) * Ls : L;
    const side = k % 2 === 1 ? 1 : -1; // 左足から踏み出す
    const prev = steps.findLast((s) => s.side === side);
    steps.push({ side, d, t: tStart + k * stepTime, len: d - prev.d });
  }
  const tEnd = steps[steps.length - 1].t;

  // 腰の進み：着地の瞬間に両足の中点
  const ks = [tStart], kd = [0];
  for (let i = 2; i < steps.length; i++) {
    const other = steps.slice(0, i).findLast((s) => s.side !== steps[i].side);
    ks.push(steps[i].t);
    kd.push((steps[i].d + other.d) / 2);
  }
  ks.push(tEnd + stepTime * 0.6);
  kd.push(L);
  const bodyS = monotoneCubic(ks, kd);
  const speed = (t) => (bodyS(t + 0.01) - bodyS(t - 0.01)) / 0.02;
  const cruise = Ls / stepTime;

  const frameAt = (d) => {
    const u = clamp01(d / L);
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).setY(0).normalize();
    const left = new THREE.Vector3().crossVectors(UP, tan).normalize();
    return { p, tan, left, yaw: Math.atan2(tan.x, tan.z) };
  };

  // 足の傾き pitch（+ = つま先が下）と回転の中心から、足首の位置を出す
  const ankleFrom = (g, f, pitch, pivot) => {
    const a0 = g.clone().addScaledVector(UP, foot.ankle);
    if (Math.abs(pitch) < 1e-6) return a0;
    const pv = g.clone().addScaledVector(f.tan, pivot === 'ball' ? foot.ball : -foot.heel);
    return a0.sub(pv).applyAxisAngle(f.left, pitch).add(pv);
  };
  const plantFrame = (s) => {
    const f = frameAt(s.d);
    return { ...f, g: f.p.clone().addScaledVector(f.left, s.side * halfWidth) };
  };

  const HEEL = THREE.MathUtils.degToRad(14); // かかと着地のつま先の上がり
  const TOE = THREE.MathUtils.degToRad(32); // 蹴り出しのつま先の下がり
  const ROLL = 0.11; // 着地から足裏が床に着くまで
  const HEELOFF = 0.2; // かかとが浮き始めてから足が離れるまで

  function footAt(side, t) {
    const mine = steps.filter((s) => s.side === side);
    let i = mine.length - 1;
    while (i > 0 && mine[i].t - tSwing > t) i--;
    const cur = mine[i];
    const next = mine[i + 1];
    const amp = (s) => clamp01(s.len / Ls); // 短い一歩は小さく
    if (t >= cur.t) {
      // 着いている：かかとから着く → 平ら → かかとが浮く
      const f = plantFrame(cur);
      let pitch = 0, pivot = 'heel';
      const roll = (t - cur.t) / ROLL;
      if (roll < 1) pitch = -HEEL * amp(cur) * (1 - smooth(roll));
      if (next) {
        const off = (t - (next.t - tSwing - HEELOFF)) / HEELOFF;
        if (off > 0) { pitch = TOE * amp(next) * smooth(off); pivot = 'ball'; }
      }
      return { pos: ankleFrom(f.g, f, pitch, pivot), yaw: f.yaw, pitch, planted: pitch === 0 ? 1 : 0.5, g: f.g };
    }
    // 浮いている：前の足跡（つま先で蹴った形）から次の足跡（かかと着地の形）へ
    const prev = mine[i - 1];
    const u = clamp01((t - (cur.t - tSwing)) / tSwing);
    const fa = plantFrame(prev), fb = plantFrame(cur);
    const pa = TOE * amp(cur), pb = -HEEL * amp(cur);
    const a = ankleFrom(fa.g, fa, pa, 'ball');
    const b = ankleFrom(fb.g, fb, pb, 'heel');
    const ue = u - Math.sin(2 * Math.PI * u) / (2 * Math.PI); // 真ん中で速い
    const pos = a.lerp(b, ue);
    pos.y += 0.075 * amp(cur) * Math.sin(Math.PI * Math.min(1, u * 1.15)); // 足を上げる
    const pitch = THREE.MathUtils.lerp(pa, pb, smooth(u / 0.75));
    let dy = fb.yaw - fa.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return { pos, yaw: fa.yaw + dy * ue, pitch, planted: 0, g: fa.g.clone().lerp(fb.g, ue) };
  }

  // 今どの一歩の途中か（0〜1）。腰の上下・左右の揺れに使う
  function stepPhase(t) {
    let k = 2;
    while (k < steps.length - 1 && steps[k].t <= t) k++;
    const t0 = k === 2 ? tStart : steps[k - 1].t;
    const t1 = steps[k].t;
    return { u: clamp01((t - t0) / (t1 - t0)), support: -steps[k].side, k };
  }

  function at(t) {
    const s = bodyS(t);
    const f = frameAt(s);
    const walk = clamp01(speed(t) / cruise); // 0=立ち 1=歩き
    const ph = stepPhase(t);
    const active = t > tStart && t < tEnd + 0.05 ? 1 : 0;
    // 腰の上下：着地の瞬間がいちばん低い。左右：支えている足の側へ
    const bob = -0.022 * walk * (0.5 + 0.5 * Math.cos(2 * Math.PI * ph.u)) * active;
    const sway = 0.022 * walk * Math.sin(Math.PI * ph.u) * ph.support * active;
    const pelvis = f.p.clone().addScaledVector(f.left, sway);
    return {
      s, walk, bob, yaw: f.yaw, tan: f.tan, left: f.left, pelvis,
      feet: { left: footAt(1, t), right: footAt(-1, t) },
    };
  }

  return { at, length: L, tEnd, steps, curve };
}
