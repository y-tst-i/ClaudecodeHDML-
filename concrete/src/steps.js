// 構成表（＝スライドの中身）。1行 = 1クリック。
// scene: 背景の世界 / p: その世界のカメラや状態（数値は前の行から滑らかに動く）/ html: 文字
// data-k が前の行と同じ要素は、出し直さずにそのまま残る（積み上げていく見せ方）

const S1 = '01 そもそもコンクリートとは';
const S2 = '02 コンクリートの歴史';
const S3 = '03 コンクリートが固まる原理';
const S4 = '04 プレキャストコンクリートとその可能性';

const card = (n, title) => `
  <div class="tl" data-k="cardnum"><div class="card-num">${n}</div></div>
  <h2 class="bl xl" data-k="cardtitle" data-d="1">${title}</h2>`;

const mixRows = (n) =>
  [
    ['砂利', '粗骨材（5mm以上の石）', '40'],
    ['砂', '細骨材（5mm未満の粒）', '30'],
    ['水', '', '15'],
    ['セメント', '石灰石などを焼いた粉。これが「のり」になる', '10'],
    ['空気', '細かい泡。凍っても割れにくくする', '5'],
  ]
    .slice(0, n)
    .map(([name, sub, pct], i) => `<div class="row rp" style="top:${150 + i * 132}px" data-k="row${i}"><div><b>${name}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="num">${pct}<span style="font-size:32px">%</span></div></div>`)
    .join('');

const ticks = (active) =>
  `<div class="ticks bl" style="bottom:136px" data-k="ticks">${['練り混ぜ直後', '数時間後', '1日後', '28日後'].map((t, i) => `<span class="${i === active ? 'is' : ''}">${t}</span>`).join('')}</div>`;

export const STEPS = [
  // ── オープニング ──
  { scene: 'section', p: { x: 1600, y: 1000, z: 1.0, shade: 0.42 }, tone: 'dark', html: `
    <div class="tl chip en" data-k="eyebrow">STUDY SESSION</div>
    <h1 class="bl xxl on-tex" data-k="title" data-d="1">コンクリート<br>勉強会</h1>
    <p class="lead on-tex" style="left:124px;bottom:72px" data-k="sub" data-d="2">毎日その上を歩いているのに、意外と知らない素材の話。</p>` },
  { scene: 'section', p: { x: 1250, y: 820, z: 1.7, shade: 0.62 }, tone: 'dark', html: `
    <div class="tl chip en" data-k="quiz">QUIZ</div>
    <h2 class="cc xl on-tex" data-k="q" data-d="1">世界で「水の次に」<br>たくさん使われている物質は？</h2>` },
  { scene: 'section', p: { x: 1250, y: 820, z: 2.1, shade: 0.5 }, tone: 'dark', html: `
    <div class="tl chip en" data-k="quiz">QUIZ</div>
    <p class="tl m on-tex" style="top:184px" data-k="q2">世界で「水の次に」たくさん使われている物質は？</p>
    <h2 class="cc xxl ac" style="font-size:240px" data-k="a" data-d="1">コンクリート</h2>` },

  // ── 01 そもそもコンクリートとは ──
  { scene: 'section', p: { x: 700, y: 520, z: 2.8, shade: 0.84 }, tone: 'dark', section: S1, html: card('01', 'そもそも<br>コンクリートとは') },
  { scene: 'section', p: { x: 1900, y: 1000, z: 1.25, split: 1, fGravel: 1, fSand: 0, fPaste: 0, fAir: 0 }, section: S1, html: `
    <h2 class="rp l" style="top:56px;font-size:44px" data-k="mixh">5つを混ぜてできている</h2>${mixRows(1)}` },
  { scene: 'section', p: { x: 1900, y: 1000, z: 1.6, split: 1, fGravel: 0.15, fSand: 1, fPaste: 0, fAir: 0 }, section: S1, html: `
    <h2 class="rp l" style="top:56px;font-size:44px" data-k="mixh">5つを混ぜてできている</h2>${mixRows(2)}` },
  { scene: 'section', p: { x: 1900, y: 1000, z: 2.2, split: 1, fGravel: 0.15, fSand: 0.2, fPaste: 1, fAir: 0 }, section: S1, html: `
    <h2 class="rp l" style="top:56px;font-size:44px" data-k="mixh">5つを混ぜてできている</h2>${mixRows(4)}` },
  { scene: 'section', p: { x: 1900, y: 1000, z: 2.8, split: 1, fGravel: 0.15, fSand: 0.2, fPaste: 0.3, fAir: 1 }, section: S1, html: `
    <h2 class="rp l" style="top:56px;font-size:44px" data-k="mixh">5つを混ぜてできている</h2>${mixRows(5)}
    <p class="rp note" style="top:830px" data-k="mixnote">体積のおおよその割合。用途や配合で変わります</p>` },
  { scene: 'section', p: { x: 1600, y: 1000, z: 1.0, split: 0, fGravel: 1, fSand: 1, fPaste: 1, fAir: 1, shade: 0.55 }, tone: 'dark', section: S1, html: `
    <p class="tl m on-tex" data-k="k1">固める「のり」の役目のセメントは</p>
    <h2 class="cc xxl on-tex" data-k="k2" data-d="1">たった<span class="ac">1割</span>。</h2>` },
  { scene: 'force', p: { mode: 0 }, section: S1, html: `
    <h2 class="tl l" data-k="f1">押す力には、<span class="ac">強い</span>。</h2>
    <p class="tl lead" style="top:220px" data-k="f1s" data-d="1">圧縮強度。ビルの重さも支えられる</p>` },
  { scene: 'force', p: { mode: 1 }, section: S1, html: `
    <h2 class="tl l" data-k="f2">引っぱる力には、<span class="ac">弱い</span>。</h2>
    <p class="tl lead" style="top:220px" data-k="f2s" data-d="1">引っぱりの強さは、押す強さの 約1/10</p>` },
  { scene: 'force', p: { mode: 2 }, section: S1, html: `
    <h2 class="tl l" data-k="f3">だから、<span class="ac">鉄筋</span>を入れる。</h2>
    <p class="tl lead" style="top:220px" data-k="f3s" data-d="1">押す力はコンクリート、引っぱる力は鉄が受けもつ。これが鉄筋コンクリート</p>` },

  // ── 02 歴史 ──
  { scene: 'section', p: { x: 2500, y: 1500, z: 2.6, shade: 0.84 }, tone: 'dark', section: S2, html: card('02', 'コンクリートの<br>歴史') },
  { scene: 'timeline', p: { cx: 0, cur: 0, hide: 1 }, section: S2, html: `
    <div class="tl chip en" data-k="quiz">QUIZ</div>` },
  { scene: 'timeline', p: { cx: 0, cur: 0, hide: 0 }, section: S2 },
  { scene: 'timeline', p: { cx: 1, cur: 1 }, section: S2 },
  { scene: 'timeline', p: { cx: 2, cur: 2 }, section: S2 },
  { scene: 'timeline', p: { cx: 3, cur: 3 }, section: S2 },
  { scene: 'timeline', p: { cx: 4, cur: 4 }, section: S2 },
  { scene: 'timeline', p: { cx: 5, cur: 5 }, section: S2 },

  // ── 03 固まる原理 ──
  { scene: 'section', p: { x: 900, y: 1500, z: 2.8, shade: 0.84 }, tone: 'dark', section: S3, html: card('03', 'コンクリートが<br>固まる原理') },
  { scene: 'hydration', p: { p: 0 }, tone: 'dark', section: S3, html: `
    <h2 class="tl l" data-k="h1">乾いて固まる、<br>のではない。</h2>` },
  { scene: 'hydration', p: { p: 0 }, tone: 'dark', section: S3, html: `
    <h2 class="tl l" data-k="h1">乾いて固まる、<br>のではない。</h2>
    <h2 class="tl l" style="top:330px" data-k="h2" data-d="1"><span class="ac">水と反応</span>して<br>固まる。</h2>
    <p class="tl lead" style="top:560px" data-k="h3" data-d="2">水和反応（すいわはんのう）</p>${ticks(0)}` },
  { scene: 'hydration', p: { p: 0.36 }, dur: 2.4, tone: 'dark', section: S3, html: `
    <h2 class="tl m" data-k="h4">セメントの粒から、<br>細い結晶が伸びはじめる。</h2>${ticks(1)}` },
  { scene: 'hydration', p: { p: 0.64 }, dur: 2.4, tone: 'dark', section: S3, html: `
    <h2 class="tl m" data-k="h5">結晶どうしが絡みあい、<br>すき間を埋めていく。</h2>${ticks(2)}` },
  { scene: 'hydration', p: { p: 1 }, dur: 2.4, tone: 'dark', section: S3, html: `
    <h2 class="tl m" data-k="h6">28日で、<br>設計どおりの強さに。</h2>
    <p class="tl lead" style="top:300px" data-k="h7" data-d="1">反応に水が要るので、<br>水の中でも固まる。</p>${ticks(3)}` },
  { scene: 'chart', p: { m: 0.42 }, section: S3, html: `
    <h2 class="rp l" style="left:1220px;top:220px" data-k="c1">水を増やすと、<br><span class="ac">弱く</span>なる。</h2>
    <p class="rp lead" style="left:1220px;top:440px;width:600px" data-k="c2" data-d="1">流し込みやすくはなるが、<br>余った水が抜けたあとが<br>すき間になる。</p>` },
  { scene: 'chart', p: { m: 0.68 }, section: S3, html: `
    <h2 class="rp l" style="left:1220px;top:220px" data-k="c1">水を増やすと、<br><span class="ac">弱く</span>なる。</h2>
    <p class="rp lead" style="left:1220px;top:440px;width:600px" data-k="c2">流し込みやすくはなるが、<br>余った水が抜けたあとが<br>すき間になる。</p>
    <p class="rp m" style="left:1220px;top:720px;width:620px" data-k="c3" data-d="1">だから現場で生コンに<br>水を足すのは厳禁。</p>` },

  // ── 04 プレキャスト ──
  { scene: 'section', p: { x: 2300, y: 600, z: 2.8, shade: 0.84 }, tone: 'dark', section: S4, html: card('04', 'プレキャスト<br>コンクリートと<br>その可能性') },
  { scene: 'precast', p: { phase: 0 }, section: S4, html: `
    <h2 class="tl l" data-k="p1">これまで：<br>現場で、つくる。</h2>
    <p class="note" style="left:124px;top:330px;font-size:26px" data-k="p1s" data-d="1">天気・人手・待ち時間に左右される</p>` },
  { scene: 'precast', p: { phase: 1 }, section: S4, html: `
    <h2 class="tl l" data-k="p2">プレキャスト：<br>工場で、つくる。</h2>` },
  { scene: 'precast', p: { phase: 2 }, section: S4, html: `
    <h2 class="tl l" data-k="p3">現場は、<br><span class="ac">並べてつなぐ</span>だけ。</h2>` },
  ...[1, 2, 3, 4].map((n) => ({
    scene: 'plain', p: {}, section: S4,
    html: `<h2 class="tl l" data-k="mh">プレキャストの良いところ</h2>` +
      [
        ['品質がそろう', '屋根の下、決まった手順と養生'],
        ['工期が短くなる', '現場で固まるのを待たなくていい'],
        ['少ない人数でつくれる', '現場の作業は組み立てが中心'],
        ['天気に左右されない', '雨の日も工場は動ける'],
      ]
        .slice(0, n)
        .map(([h, sub], i) => `<div class="cell" style="left:${120 + (i % 2) * 860}px;top:${330 + Math.floor(i / 2) * 300}px" data-k="cell${i}"><div class="num">0${i + 1}</div><div class="m">${h}</div><p class="lead" style="margin:8px 0 0">${sub}</p></div>`)
        .join(''),
  })),
  { scene: 'plain', p: { dark: 1 }, tone: 'dark', section: S4, html: `
    <p class="tl lead" data-k="v0">これからの建設で</p>
    <h2 class="tl xl" style="top:200px" data-k="v1" data-d="1">働く人は、<br>ピーク時から<span class="ac">約3割減</span>。</h2>
    <p class="note" style="left:124px;top:560px;font-size:22px" data-k="v1s" data-d="2">建設業の就業者数 1997年 約685万人 → 2023年 約483万人（総務省 労働力調査）</p>` },
  { scene: 'plain', p: { dark: 1 }, tone: 'dark', section: S4, html: `
    <p class="tl lead" data-k="v0">これからの建設で</p>
    <h2 class="tl xl" style="top:200px" data-k="v2">セメントづくりは<br>世界のCO₂の<span class="ac">約8%</span>。</h2>
    <p class="note" style="left:124px;top:560px;font-size:22px" data-k="v2s" data-d="1">石灰石を高温で焼くときに多くのCO₂が出る</p>` },
  { scene: 'plain', p: { dark: 1 }, tone: 'dark', section: S4, html: `
    <p class="tl lead" data-k="v0">これからの建設で</p>
    <h2 class="tl xl" style="top:200px" data-k="v3">工場でつくる技術が、<br>その答えになる。</h2>
    <p class="tl lead" style="top:560px" data-k="v3s" data-d="1">少ない人数で、早く、ムダなく。<br>CO₂を吸わせるコンクリートや、3Dプリンターでつくる部材も。</p>` },

  // ── ワークとまとめ ──
  { scene: 'timer', p: { seconds: 180 }, tone: 'dark', html: `
    <div class="tl chip en" data-k="w0">WORK 3 MIN</div>
    <h2 class="tl l" style="top:176px" data-k="w1" data-d="1">身のまわりで<br>工場でつくれそうな<br>コンクリートは？</h2>
    <p class="tl lead" style="top:500px" data-k="w2" data-d="2">となりの人と、3つ挙げてみよう。</p>` },
  { scene: 'section', p: { x: 1600, y: 1000, z: 1.0, shade: 0.5 }, tone: 'dark', html: `
    <h2 class="bl xl on-tex" data-k="end">コンクリートは、<br>まだ<span class="ac">進化</span>している。</h2>
    <p class="tl lead on-tex" data-k="end2" data-d="1">ご清聴ありがとうございました</p>` },
];

// 断面シーンは、書いていない値を既定値で埋める（前の画面の暗幕などが残らないように）
const SECTION_DEFAULTS = { x: 1600, y: 1000, z: 1, shade: 0, split: 0, light: 0, fGravel: 1, fSand: 1, fPaste: 1, fAir: 1 };
for (const step of STEPS) if (step.scene === 'section') step.p = { ...SECTION_DEFAULTS, ...step.p };
