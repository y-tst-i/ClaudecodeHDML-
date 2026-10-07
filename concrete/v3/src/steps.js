// v3 構成：写真 × 動く文字組み × 1場面1フック。1行 = 1クリック。
// data-k が同じ要素は前の画面から残る（積み上げ）。data-then は「残したまま次の状態へ」（例：3択の答え合わせ）。

const S0 = 'INTRODUCTION';
const S1 = '01 / WHAT IS CONCRETE';
const S2 = '02 / HISTORY';
const S3 = '03 / HOW IT HARDENS';
const S4 = '04 / PRECAST';

// 写真：kb = in（寄る）/ out（引く）/ left / right / up（流れる）, mode = fade / wipe / iris
const KB = {
  in: '--s0:1.04;--s1:1.16',
  out: '--s0:1.2;--s1:1.04',
  left: '--s0:1.15;--s1:1.15;--x0:3%;--x1:-3%',
  right: '--s0:1.15;--s1:1.15;--x0:-3%;--x1:3%',
  up: '--s0:1.15;--s1:1.15;--y0:3%;--y1:-3%',
  still: '--s0:1.02;--s1:1.02',
};
const ph = (name, { kb = 'in', mode = 'fade', shade = 0.55, k = name, flat = false, ox = '50%', oy = '50%' } = {}) =>
  `<div class="ph ${mode}${flat ? ' flat' : ''}" style="${KB[kb]};--shade:${shade};--ox:${ox};--oy:${oy}" data-k="ph-${k}"><img data-img="${name}" alt=""></div>`;
const tag = (t, k = 'tag', d = '') => `<div class="tag" style="left:128px;top:112px" data-k="${k}"${d ? ` data-d="${d}"` : ''}>${t}</div>`;
const flash = (d = 0) => `<div class="flash" style="--d:${d}s"></div>`;
const X = (left, top, size = 560, d = 0.5) => `<div class="stamp" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;--d:${d}s" data-k="x"><svg viewBox="0 0 100 100"><path d="M14 14 L86 86 M86 14 L14 86" stroke="#ff5a1f" stroke-width="13" stroke-linecap="square" fill="none"/></svg></div>`;

// ひび：点から放射状に走るギザギザの線（毎回同じ形になるよう乱数は固定）
function crackPaths(cx, cy, seed = 7, n = 9) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const len = 300 + r() * 900;
    let x = cx, y = cy, d = `M${cx} ${cy}`;
    for (let l = 0; l < len; l += 18 + r() * 26) {
      a += (r() - 0.5) * 0.55;
      x += Math.cos(a) * (18 + r() * 26);
      y += Math.sin(a) * (18 + r() * 26);
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const w = 2 + r() * 5;
    out.push(`<path d="${d}" style="--n:${i};stroke-width:${w.toFixed(1)}"/>`);
    // 枝
    if (r() < 0.7) {
      let bx = cx + Math.cos(a) * 140, by = cy + Math.sin(a) * 140, ba = a + (r() < 0.5 ? 0.8 : -0.8), bd = `M${bx.toFixed(1)} ${by.toFixed(1)}`;
      for (let l = 0; l < 220 + r() * 260; l += 22) {
        ba += (r() - 0.5) * 0.6;
        bx += Math.cos(ba) * 22;
        by += Math.sin(ba) * 22;
        bd += ` L${bx.toFixed(1)} ${by.toFixed(1)}`;
      }
      out.push(`<path d="${bd}" style="--n:${i + 3};stroke-width:1.6"/>`);
    }
  }
  return out.join('');
}
const crack = (cx, cy, d = 0, k = 'crack') => `<svg class="crack-svg" viewBox="0 0 1920 1080" style="--d:${d}ms" data-k="${k}">${crackPaths(cx, cy)}</svg>`;

// 図面の注記：写真上の点から、文字まで線が伸びる
const note = (px, py, lx, ly, title, sub, d = 0, k) => `
  <svg class="lead-line" viewBox="0 0 1920 1080" style="left:0;top:0;width:1920px;height:1080px;--d:${d}s" data-k="${k}-l"><path d="M${px} ${py} L${lx + (lx < px ? 260 : -20)} ${ly + 24} L${lx + (lx < px ? 300 : -60)} ${ly + 24}"/><circle cx="${px}" cy="${py}" r="9"/></svg>
  <div class="note-box in rise" style="left:${lx}px;top:${ly - 16}px;transition-delay:${d + 0.6}s" data-k="${k}">${title}<small>${sub}</small></div>`;

const card = (k, v, cls) => `<div class="card ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

export const STEPS = [
  // ── 0. つかみ ────────────────────────────────
  { section: S0, html: `<p class="type lead" style="left:128px;top:470px;font-size:44px" data-k="o1">今日、ここに来るまでに</p>` },
  {
    section: S0, html: `
      ${ph('city_aerial', { kb: 'in', shade: 0.65 })}
      <p class="lead" style="left:128px;top:300px;font-size:44px" data-k="o1x">今日、ここに来るまでに</p>
      <h2 class="xl split sh" style="left:120px;top:380px" data-k="o2" data-d="1">コンクリートを、<br>何回踏みましたか？</h2>
      <div class="in rise" style="left:128px;top:720px" data-k="o3" data-d="4"><div class="tag">Raise your hand</div><p class="lead" style="margin:16px 0 0">1回　／　10回　／　数えきれない</p></div>`,
  },
  {
    section: S0, html: `
      ${ph('city_aerial', { kb: 'in', shade: 0.7 })}
      <div class="tag in" style="left:128px;top:112px" data-k="o4">Steps on concrete today</div>
      <div class="num mega sh" style="left:112px;top:330px;font-size:300px" data-k="o5"><span data-count="9999" data-dur="2.4" data-fmt="comma">0</span><span style="font-size:120px">+</span></div>
      <p class="m in rise sh" style="left:128px;top:660px" data-k="o6" data-d="5">数えるのをやめたくなるくらい、<br>ほぼ全部コンクリートの上。</p>`,
  },
  {
    section: S0, html: `
      ${ph('hero_wall', { kb: 'right', mode: 'wipe', shade: 0.35 })}
      ${tag('Concrete study session — 2026', 'tag')}
      <h1 class="xxl split sh" style="left:120px;top:560px" data-k="title" data-d="1">コンクリート<br>勉強会</h1>
      <p class="lead in rise" style="left:128px;top:946px;font-size:26px" data-k="sub" data-d="4">毎日その上を歩いているのに、知らない素材の話。</p>`,
  },
  {
    section: S0, html: `
      ${tag('Quiz 01', 'q0')}
      <h2 class="l split" style="left:120px;top:190px" data-k="q1">世界で「水の次に」<br>たくさん使われている物質は？</h2>
      <div class="cards" style="left:128px;top:560px" data-k="q2">${card('A', '石油', 'no')}${card('B', '木材', 'no')}${card('C', 'コンクリート', 'yes')}</div>`,
  },
  {
    section: S0, html: `
      ${tag('Quiz 01', 'q0')}
      <h2 class="l split" style="left:120px;top:190px" data-k="q1">世界で「水の次に」<br>たくさん使われている物質は？</h2>
      <div class="cards" style="left:128px;top:560px" data-k="q2" data-then="reveal">${card('A', '石油', 'no')}${card('B', '木材', 'no')}${card('C', 'コンクリート', 'yes')}</div>`,
  },
  {
    section: S0, impact: 0.05, html: `
      ${ph('crack_macro', { kb: 'in', mode: 'iris', shade: 0.45, ox: '70%', oy: '45%' })}
      ${crack(1340, 470, 0)}
      ${flash(0)}
      ${tag('Answer', 'a0')}
      <h2 class="mega slam sh" style="left:110px;top:360px" data-k="a1">コンクリート</h2>
      <p class="lead in rise" style="left:128px;top:680px" data-k="a2" data-d="3">セメントだけで、世界で年間 約<span class="num">40</span>億トンつくられている。</p>`,
  },

  // ── 01 そもそも ───────────────────────────────
  {
    section: S1, html: `
      ${ph('fresh_pour', { kb: 'up', mode: 'wipe', shade: 0.6 })}
      <div class="num in" style="left:112px;top:150px;font-size:380px;line-height:.8;color:var(--accent)" data-k="c1n">01</div>
      <h2 class="xl split sh" style="left:120px;top:640px" data-k="c1t" data-d="1">そもそも<br>コンクリートとは</h2>`,
  },
  {
    section: S1, html: `
      ${tag('Etymology', 'e0')}
      <p class="num in" style="left:120px;top:250px;font-size:200px;font-weight:700;font-style:italic;letter-spacing:-0.03em" data-k="e1">concretus</p>
      <div class="in rise" style="left:128px;top:540px;display:flex;gap:56px" data-k="e2" data-d="2">
        <div><div class="mono">con-</div><div class="l">一緒に</div></div><div class="l" style="opacity:.5">＋</div><div><div class="mono">crescere</div><div class="l">育つ</div></div>
      </div>
      <h2 class="m split" style="left:128px;top:800px" data-k="e3" data-d="4">名前の意味は「<span class="ac">一緒に育ったもの</span>」。</h2>`,
  },
  {
    section: S1, html: `
      ${ph('macro_section', { kb: 'in', shade: 0.75, ox: '65%' })}
      ${tag('Mix design — cross section', 'm0')}
      <h2 class="l split sh" style="left:120px;top:190px" data-k="m1">断面を見ると、<br>5つでできている。</h2>
      ${note(1250, 360, 128, 520, '砂利', 'Coarse aggregate', 0.6, 'n1')}
      ${note(1330, 520, 128, 640, '砂', 'Fine aggregate', 0.9, 'n3')}
      ${note(1404, 590, 128, 760, '空気', 'Air void', 1.2, 'n2')}
      ${note(1560, 820, 128, 880, 'セメント＋水', 'Paste — the glue', 1.5, 'n4')}`,
  },
  {
    section: S1, html: `
      ${ph('cement_powder', { kb: 'up', mode: 'fade', shade: 0.65 })}
      ${tag('Volume ratio — approx.', 'm0b')}
      <div class="bars" style="left:128px;top:220px" data-k="bars">
        ${[['砂利', 40], ['砂', 30], ['水', 15], ['セメント', 10, 'hi'], ['空気', 5]].map(([n, v, hi], i) => `<div class="bar ${hi ?? ''}" style="--n:${i};--w:${v * 2.2}%"><b>${n}</b><div class="track"><div class="fill"></div></div><div class="num"><span data-count="${v}" data-delay="${0.3 + i * 0.12}">0</span>%</div></div>`).join('')}
      </div>
      <h2 class="m split" style="left:128px;top:720px" data-k="m3" data-d="4">固める「のり」のセメントは、たった<span class="ac">1割</span>。</h2>`,
  },
  {
    section: S1, html: `
      ${ph('macro_section', { kb: 'out', shade: 0.6, k: 'stone' })}
      <h2 class="xxl slam sh" style="left:120px;top:330px" data-k="joke1">つまり、<br>ほぼ<span class="ac">石</span>。</h2>`,
  },
  {
    section: S1, html: `
      <div class="ph press" style="--shade:.5" data-k="press"><img data-img="hero_wall" alt=""></div>
      ${tag('Compression', 'f0')}
      <h2 class="xl split sh" style="left:120px;top:400px" data-k="f1">押す力には、<br><span class="ac">強い</span>。</h2>`,
  },
  {
    section: S1, impact: 1.6, html: `
      <div class="pull" data-k="pull"><div><img data-img="crack_macro" alt=""></div><div><img data-img="crack_macro" alt=""></div></div>
      ${tag('Tension', 'f2')}
      <h2 class="xl split sh" style="left:120px;top:300px" data-k="f3">引っぱる力には、<br>弱い。</h2>
      <p class="lead in rise sh" style="left:128px;top:600px" data-k="f4" data-d="2">強さは、押すときの<span class="num" style="font-size:44px"> 約1/10</span>。</p>
      <p class="m in rise sh" style="left:128px;top:760px" data-k="f5" data-d="5">押しには強いけど、引っぱられると弱い。<br><span style="opacity:.7">…どこかで聞いた話。</span></p>`,
  },
  {
    section: S1, html: `
      ${ph('rebar_grid', { kb: 'in', mode: 'wipe', shade: 0.6 })}
      ${tag('Reinforced concrete', 'f6')}
      <h2 class="xl split sh" style="left:120px;top:380px" data-k="f7">だから、<br><span class="ac">鉄筋</span>を入れる。</h2>
      <p class="lead in rise sh" style="left:128px;top:720px" data-k="f8" data-d="3">押す力はコンクリート、引っぱる力は鉄。役割分担。</p>`,
  },

  // ── 02 歴史 ──────────────────────────────────
  {
    section: S2, html: `
      <div class="num in" style="left:112px;top:150px;font-size:380px;line-height:.8;color:var(--accent)" data-k="c2n">02</div>
      <h2 class="xl split" style="left:120px;top:640px" data-k="c2t" data-d="1">コンクリートの<br>歴史</h2>
      <div class="num" style="right:150px;top:150px;font-size:160px;opacity:.85" data-k="year"><span data-count="125" data-from="2026" data-dur="2.4" data-delay=".6">2026</span></div>
      <div class="mono in" style="right:150px;top:330px" data-k="yl" data-d="2">Rewinding to AD 125</div>`,
  },
  {
    section: S2, html: `
      ${ph('pantheon_oculus', { kb: 'in', shade: 0.6, ox: '64%', oy: '25%' })}
      ${tag('Quiz 02', 'p0')}
      <h2 class="l split sh" style="left:120px;top:200px" data-k="p1">このドーム、<br>何年前のもの？</h2>`,
  },
  {
    section: S2, html: `
      ${ph('pantheon_oculus', { kb: 'in', shade: 0.6, ox: '64%', oy: '25%' })}
      ${tag('Pantheon, Rome — c. AD 125', 'p0')}
      <h2 class="xl sh" style="left:120px;top:220px" data-k="p2">約<span class="num ac" data-count="1900" data-dur="1.4">0</span>年前</h2>
      <p class="lead in rise sh" style="left:128px;top:400px" data-k="p3" data-d="2">直径43.3m。鉄筋なしで、今も現役。</p>`,
  },
  {
    section: S2, html: `
      ${ph('pantheon_oculus', { kb: 'in', shade: 0.7, ox: '64%', oy: '25%' })}
      ${tag('Pantheon, Rome — c. AD 125', 'p0')}
      <h2 class="xl sh" style="left:120px;top:220px" data-k="p2">約<span class="num ac" data-count="1900" data-dur="1.4">0</span>年前</h2>
      <p class="lead sh" style="left:128px;top:400px" data-k="p3x">直径43.3m。鉄筋なしで、今も現役。</p>
      <div class="intrude" style="left:1040px;top:420px;--d:.3s" data-k="pc"><img data-img="old_pc" alt=""><div class="cap">会社のPCは、5年で引退します。</div></div>`,
  },
  {
    section: S2, html: `
      ${ph('roman_concrete_macro', { kb: 'in', mode: 'iris', shade: 0.85, ox: '60%' })}
      ${tag('Science Advances, 2023', 'r0')}
      <h2 class="l split sh" style="left:120px;top:220px" data-k="r1">ローマのコンクリートは、<br>ひびを<span class="ac">自分で治していた</span>。</h2>
      <p class="lead in rise sh" style="left:128px;top:520px;width:880px" data-k="r2" data-d="3">中の白い石灰の粒が、ひびに入った水と反応して、<br>すき間を埋める。</p>`,
  },
  {
    section: S2, html: `
      ${ph('monier_pot', { kb: 'right', shade: 0.6 })}
      ${tag('1867 — Reinforced concrete patent', 'mo0')}
      <h2 class="l split sh" style="left:120px;top:240px" data-k="mo1">鉄筋コンクリートを<br>発明したのは</h2>
      <h2 class="xxl sh in" style="left:120px;top:520px" data-k="mo2"><span class="strike" style="--sd:1.4s">建築家</span> <span class="swap ac" style="--wd:2s">庭師</span></h2>
      <p class="lead in rise sh" style="left:128px;top:760px" data-k="mo3" data-d="5">ジョゼフ・モニエ。植木鉢を割れにくくしたかった。</p>`,
  },
  {
    section: S2, html: `
      ${ph('hashima', { kb: 'left', mode: 'wipe', shade: 0.6 })}
      ${tag('1916 — Hashima Island, Nagasaki', 'h0')}
      <h2 class="l split sh" style="left:120px;top:240px" data-k="h1">日本初の<br>鉄筋コンクリートの<br>アパートは、</h2>
      <h2 class="xxl slam ac sh" style="left:120px;top:620px" data-k="h2" data-d="3">軍艦島。</h2>`,
  },

  // ── 03 原理 ──────────────────────────────────
  {
    section: S3, html: `
      <div class="num in" style="left:112px;top:150px;font-size:380px;line-height:.8;color:var(--accent)" data-k="c3n">03</div>
      <h2 class="xl split" style="left:120px;top:640px" data-k="c3t" data-d="1">コンクリートが<br>固まる原理</h2>`,
  },
  {
    section: S3, html: `
      <h2 class="xl split" style="left:120px;top:380px" data-k="d1">コンクリートは、<br>乾いて固まる。</h2>
      ${X(1180, 260, 560, 1.6)}`,
  },
  {
    section: S3, html: `
      ${ph('micro_csh', { kb: 'in', mode: 'iris', shade: 0.6, ox: '62%' })}
      ${tag('Hydration — C-S-H', 'hy0')}
      <h2 class="xl split sh" style="left:120px;top:250px" data-k="hy1"><span class="ac">水と反応</span>して<br>固まる。</h2>
      <p class="lead in rise sh" style="left:128px;top:560px;width:820px" data-k="hy2" data-d="3">セメントの粒から細い結晶が伸びて、絡み合い、すき間を埋めていく。これが「水和反応」。</p>`,
  },
  {
    section: S3, html: `
      ${ph('curing_water', { kb: 'in', mode: 'wipe', shade: 0.6 })}
      ${tag('Curing', 'cu0')}
      <h2 class="l split sh" style="left:120px;top:250px" data-k="cu1">反応に水が要るから、<br><span class="ac">水の中でも</span>固まる。</h2>
      <p class="lead in rise sh" style="left:128px;top:560px;width:860px" data-k="cu2" data-d="3">夏に水をまくのは、乾かさないため。</p>`,
  },
  {
    section: S3, html: `
      ${ph('hoover_dam', { kb: 'up', mode: 'fade', shade: 0.6 })}
      ${tag('Hoover Dam — USBR', 'hd0')}
      <h2 class="l split sh" style="left:120px;top:220px" data-k="hd1">反応すると、熱が出る。</h2>
      <p class="lead in rise sh" style="left:128px;top:400px;width:840px" data-k="hd2" data-d="2">フーバーダムを一気に流し込んでいたら、冷えるまで</p>
      <div class="sh" style="left:120px;top:520px" data-k="hd3"><span class="num" style="font-size:260px;line-height:.9" data-count="125" data-dur="2" data-delay="1.6">0</span><span class="l" style="margin-left:16px">年</span></div>
      <p class="lead in rise sh" style="left:128px;top:820px" data-k="hd4" data-d="5">だから、冷却パイプを通しながら少しずつ打った。</p>`,
  },
  {
    section: S3, html: `
      ${ph('slump_test', { kb: 'in', shade: 0.85 })}
      ${tag('Water-cement ratio', 'wc0')}
      <h2 class="l split sh" style="left:120px;top:250px" data-k="wc1">水を足すと、<br>流しやすいけど<span class="ac">弱くなる</span>。</h2>
      <p class="lead in rise sh" style="left:128px;top:560px" data-k="wc2" data-d="3">だから現場で、生コンに水を足すのは厳禁。</p>`,
  },
  {
    section: S3, html: `
      <div class="ph fade flat" style="${KB.still};--shade:0" data-k="ph-curry"><img data-img="curry" alt=""></div>
      ${X(1220, 240, 600, 0.9)}
      <h2 class="xl slam" style="left:110px;top:90px;color:#111" data-k="cr1" data-d="2">カレーとは<br>違います。</h2>`,
    tone: 'light',
  },

  // ── 04 プレキャスト ───────────────────────────
  {
    section: S4, html: `
      ${ph('precast_factory', { kb: 'right', mode: 'wipe', shade: 0.65 })}
      <div class="num in" style="left:112px;top:150px;font-size:380px;line-height:.8;color:var(--accent)" data-k="c4n">04</div>
      <h2 class="xl split sh" style="left:120px;top:620px" data-k="c4t" data-d="1">プレキャスト<br>コンクリート</h2>`,
  },
  {
    section: S4, html: `
      ${ph('rain_site', { kb: 'in', shade: 0.6 })}
      ${tag('Cast-in-place', 'ci0')}
      <h2 class="l split sh" style="left:120px;top:200px" data-k="ci1">これまで：<br>現場で流して、固まるのを待つ。</h2>
      <div class="sh" style="left:120px;top:500px" data-k="ci2"><span class="mono">Design strength at</span><br><span class="num" style="font-size:200px" data-count="28" data-dur="2.4" data-delay=".8">0</span><span class="l" style="margin-left:12px">日</span></div>
      <p class="lead in rise sh" style="left:128px;top:820px" data-k="ci3" data-d="5">天気・人手・待ち時間に、ぜんぶ左右される。</p>`,
  },
  {
    section: S4, html: `
      ${ph('precast_factory', { kb: 'left', shade: 0.6, k: 'pf2' })}
      ${tag('Precast', 'pc0')}
      <h2 class="l split sh" style="left:120px;top:240px" data-k="pc1">プレキャスト：<br><span class="ac">工場で</span>つくる。</h2>
      <p class="lead in rise sh" style="left:128px;top:520px;width:820px" data-k="pc2" data-d="3">屋根の下で、決まった手順で、同じ品質のものをくり返し。</p>`,
  },
  {
    section: S4, html: `
      ${ph('precast_lift', { kb: 'up', mode: 'wipe', shade: 0.55 })}
      <h2 class="l split sh" style="left:120px;top:240px" data-k="pl1">現場は、<br>吊って、並べて、つなぐだけ。</h2>`,
  },
  {
    section: S4, html: `
      ${ph('precast_line', { kb: 'right', mode: 'iris', shade: 0.55, ox: '70%' })}
      <h2 class="xxl slam sh" style="left:120px;top:360px" data-k="pl2">大人の、<br>ブロック遊び。</h2>`,
  },
  {
    section: S4, html: `
      ${tag('Construction workforce, Japan', 'wf0')}
      <h2 class="l split" style="left:120px;top:200px" data-k="wf1">働く人は、ピーク時から<br><span class="ac">約3割減</span>。</h2>
      <div class="dots" style="left:128px;top:520px" data-k="wf2">${Array.from({ length: 100 }, (_, i) => `<i class="${i >= 70 ? 'gone' : ''}" style="--n:${99 - i}"></i>`).join('')}</div>
      <p class="mono in" style="left:128px;top:920px" data-k="wf3" data-d="5">1997: 6.85M → 2023: 4.83M / 総務省 労働力調査</p>
      <p class="lead in rise" style="left:1080px;top:560px;width:700px" data-k="wf4" data-d="5">人が減るほど、<br>「工場でつくって、現場は組むだけ」が効いてくる。</p>`,
  },
  {
    section: S4, html: `
      ${ph('hero_wall', { kb: 'in', mode: 'fade', shade: 0.85, k: 'breathe' })}
      ${tag('Carbonation', 'co0')}
      <h2 class="l split sh" style="left:120px;top:250px" data-k="co1">コンクリートは何十年もかけて、<br>空気中の CO₂ を<span class="ac">少しずつ吸っている</span>。</h2>
      <p class="lead in rise sh" style="left:128px;top:560px;width:860px" data-k="co2" data-d="3">つくるときに出す CO₂ をどう減らすか。工場生産は、その答えの一つ。</p>`,
  },

  // ── ワークとまとめ ───────────────────────────
  {
    section: 'WORK', html: `
      ${tag('Work — 3 min', 'w0')}
      <h2 class="l split" style="left:120px;top:200px" data-k="w1">身のまわりで、<br>工場でつくれそうな<br>コンクリートは？</h2>
      <p class="lead in rise" style="left:128px;top:600px" data-k="w2" data-d="3">となりの人と、3つ挙げてみよう。</p>
      <div style="left:1180px;top:240px;width:600px;height:600px" data-timer="180" data-k="timer">
        <svg class="timer-ring" viewBox="0 0 600 600" style="position:absolute;inset:0"><circle cx="300" cy="300" r="280" stroke="rgba(236,233,227,.12)"/><circle class="prog" cx="300" cy="300" r="280" transform="rotate(-90 300 300)"/></svg>
        <div class="timer-txt" style="position:absolute;top:200px">3:00</div>
        <div class="timer-hint mono" style="position:absolute;top:420px;width:600px;text-align:center"></div>
      </div>`,
  },
  {
    section: 'CLOSING', html: `
      ${ph('hero_wall', { kb: 'out', mode: 'fade', shade: 0.5, k: 'end' })}
      <p class="num in" style="left:120px;top:200px;font-size:150px;font-weight:700;font-style:italic;opacity:.9" data-k="e1">concretus</p>
      <p class="mono in" style="left:128px;top:380px" data-k="e1b" data-d="1">= grown together</p>
      <h2 class="xl split sh" style="left:120px;top:560px" data-k="end" data-d="2">コンクリートは、<br>まだ<span class="ac">育っている</span>。</h2>
      <p class="lead in rise sh" style="left:128px;top:880px" data-k="end2" data-d="5">ご清聴ありがとうございました</p>`,
  },
];
