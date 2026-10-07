// v2 試作：見せ場だけ。1行 = 1クリック。
// trans: 'pour'（生コンが流れ込み、固まって割れる）/ 'fade' / 省略（同じ世界ならカメラだけ動く）
// from: 最初の状態（そこから p へ dur 秒かけて動く） / impact: その秒に衝撃（揺れ＋白フラッシュ）
const JP = '"Noto Sans JP Variable", sans-serif';
const EN = '"Inter Variable", sans-serif';

const S1 = '01 / WHAT IS CONCRETE';
const S2 = '02 / HISTORY';

export const STEPS = [
  // ── 1. 壁に彫られたタイトルが、横からの光で浮かび上がる
  {
    scene: 'wall',
    from: { light: -0.6, lightY: 0.5, shade: 0.2 },
    p: { light: 0.46, lightY: 0.7, lightZ: 1.0, shade: 0, title: { lines: [{ text: 'コンクリート', x: 132, y: 560, size: 230 }, { text: '勉強会', x: 132, y: 820, size: 230 }] } },
    dur: 3.6,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="tag">Concrete study session — 2026</div>
      <p class="lead split" style="left:140px;top:880px" data-k="sub" data-d="4">毎日その上を歩いているのに、知らない素材の話。</p>`,
  },
  // ── 2. 壁に寄る。問い
  {
    scene: 'wall',
    p: { light: 0.85, lightY: 0.2, zoom: 2.4, panX: 0.5, panY: 0.25, shade: 0.42, title: null },
    dur: 1.6,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="q0">Question 01</div>
      <h2 class="xl split shadow" style="left:132px;top:300px" data-k="q1">世界で、水の次に<br>使われている物質は？</h2>`,
  },
  // ── 3. 答え：壁にひびが走る
  {
    scene: 'wall',
    p: { light: 0.85, lightY: 0.2, zoom: 2.4, panX: 0.5, panY: 0.25, shade: 0.5, crack: 1 },
    dur: 0.8, ease: 'expo', impact: 0.05,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="q0">Answer</div>
      <h2 class="mega slam ac shadow" style="left:120px;top:330px" data-k="a1">コンクリート</h2>
      <p class="lead split" style="left:136px;top:640px" data-k="a2" data-d="3">セメントだけで、世界で年間 約40億トンつくられている。</p>`,
  },
  // ── 4. 生コンが流れ込み、固まって割れると「01」
  {
    scene: 'wall', trans: 'pour',
    from: { light: 1.4, lightY: 0.55, shade: 0.35, zoom: 1, panX: 0, panY: 0, crack: 0 },
    p: { light: 0.62, lightY: 0.55, shade: 0.35, zoom: 1, crack: 0, title: { lines: [{ text: '01', x: 1800, y: 760, size: 640, font: EN, weight: 800, align: 'right' }] } },
    dur: 3.0, delay: 1.2, section: S1,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="c0" data-d="4">Chapter 01</div>
      <h2 class="xl split" style="left:132px;top:640px" data-k="c1" data-d="4">そもそも<br>コンクリートとは</h2>`,
  },
  // ── 5. 立方体
  {
    scene: 'cube', trans: 'fade', tone: 'light',
    from: { split: 0, camA: 1.6, dist: 12, camY: 3.4, spin: -0.6, fGravel: 1, fSand: 1, fPaste: 1, fAir: 1, dim: 1 },
    p: { split: 0, camA: 0.62, dist: 8.2, camY: 2.4, spin: 0, fGravel: 1, fSand: 1, fPaste: 1, fAir: 1, dim: 1 },
    dur: 2.4, section: S1,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="m0">Mix design</div>
      <h2 class="l split" style="left:132px;top:200px" data-k="m1">5つを混ぜて、<br>できている。</h2>`,
  },
  // ── 6. 真っ二つに割れて、断面が見える
  {
    scene: 'cube', tone: 'light',
    p: { split: 1, camA: 0.0, dist: 7.6, camY: 1.2, lookX: 1.9, spin: 0 },
    dur: 1.5, ease: 'expo', impact: 0.12, section: S1,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="m0">Mix design</div>
      <div class="rows" style="left:1200px;top:180px" data-k="rows">
        ${[
          ['砂利', 'Coarse aggregate / 5mm+', 40],
          ['砂', 'Fine aggregate / -5mm', 30],
          ['水', 'Water', 15],
          ['セメント', 'Cement / the glue', 10],
          ['空気', 'Air', 5],
        ].map(([n, s, v], i) => `<div class="r"><div><b>${n}</b><small>${s}</small></div><div class="num"><span data-count="${v}" data-delay="${0.3 + i * 0.12}">0</span><i>%</i></div></div>`).join('')}
        <p class="mono" style="margin-top:20px">* 体積のおおよその割合 / Approx. by volume</p>
      </div>`,
  },
  // ── 7. セメント（のり）だけを残す
  {
    scene: 'cube', tone: 'light',
    p: { split: 1, camA: 0.0, dist: 7.4, camY: 1.0, lookX: 2.5, fGravel: 0, fSand: 0, fPaste: 1, fAir: 0, dim: 0 },
    dur: 1.4, section: S1,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="m0">Mix design</div>
      <p class="lead split" style="left:1200px;top:330px" data-k="g1">固める「のり」の役目のセメントは</p>
      <h2 class="mega slam" style="left:1180px;top:410px" data-k="g2" data-d="2">たった<br><span class="ac">1</span>割</h2>`,
  },
  // ── 8. 生コン → 「02」
  {
    scene: 'wall', trans: 'pour',
    from: { light: 1.4, lightY: 0.55, shade: 0.35, zoom: 1, panX: 0, panY: 0, crack: 0 },
    p: { light: 0.6, lightY: 0.55, shade: 0.35, zoom: 1, crack: 0, title: { lines: [{ text: '02', x: 1800, y: 760, size: 640, font: EN, weight: 800, align: 'right' }] } },
    dur: 3.0, delay: 1.2, section: S2,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="c0" data-d="4">Chapter 02</div>
      <h2 class="xl split" style="left:132px;top:640px" data-k="c2" data-d="4">コンクリートの<br>歴史</h2>`,
  },
  // ── 9. パンテオンの中から、天窓を見上げる
  {
    scene: 'pantheon', trans: 'fade',
    from: { look: -0.15, camY: 1.7, camR: 14, beam: 0, fov: 60, yaw: -0.42 },
    p: { look: 0.85, camY: 1.7, camR: 14, beam: 0.4, fov: 78, yaw: -0.42 },
    dur: 4.0, section: S2,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="p0">Question 02</div>
      <h2 class="l split shadow" style="left:132px;top:200px" data-k="p1" data-d="2">このドーム、<br>何年前のもの？</h2>`,
  },
  {
    scene: 'pantheon',
    p: { look: 0.85, camY: 1.7, camR: 14, beam: 0.55, fov: 78, yaw: -0.42 },
    dur: 1.0, impact: 0.05, section: S2,
    html: `
      <div class="tag mono" style="left:136px;top:120px" data-k="p0">Pantheon, Rome — c. AD 125</div>
      <h2 class="mega slam shadow" style="left:120px;top:190px" data-k="p2">約<span class="ac">1900</span>年前</h2>
      <div style="left:136px;top:520px;width:760px" data-k="p3" data-d="3">
        <div class="dim" style="position:relative"></div>
        <div class="mono" style="margin-top:16px;display:flex;justify-content:space-between"><span>Ø 43.3 m</span><span>No rebar</span><span>Still standing</span></div>
      </div>
      <p class="lead split shadow" style="left:136px;top:640px" data-k="p4" data-d="4">直径43.3m。鉄筋なしで、今も建っている。</p>`,
  },
];
