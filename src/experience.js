import { CONFIG } from './config.js';
import { createActionLabel } from './ui/action-label.js';

// 遷移アクション：スクロールで進めると行き過ぎたり体験を壊すので、
// シーンごとに「やること」を出し、クリアしたら次へ進む。
// loop  … [a,b] をループ再生しながらアクション待ち
// scrub … ドラッグ量で [a,b] を直接進める（歩いて美術館を巡る）
const STEPS = [
  { kind: 'loop', a: 1.0, b: 4.0, action: 'click', count: 3, anchor: [50, 50], label: (n) => `Click ${n}` },
  { kind: 'scrub', a: 5.6, b: 9.4, action: 'drag', px: 1600, anchor: [50, 78], label: (px) => `Drag ${px.toLocaleString()}px` },
  { kind: 'loop', a: 10.2, b: 11.3, action: 'click', count: 1, anchor: [55, 46], label: () => 'Click to break' },
];

export function startExperience(timeline) {
  document.body.classList.add('is-experience');
  const header = document.createElement('header');
  header.className = 'header';
  header.innerHTML = `<span class="header__title">Code Showreel</span><a class="btn" href="?mode=film">Watch film</a>`;
  document.body.appendChild(header);

  const label = createActionLabel(document.getElementById('stage'));
  let t = 0, step = 0, phase = 'play', remaining = 0, last = performance.now();

  function enterHold() {
    const s = STEPS[step];
    phase = 'hold';
    remaining = s.action === 'click' ? s.count : s.px;
    label.show(s.anchor, s.label(remaining));
  }
  function complete() {
    label.hide();
    phase = 'play';
    step++;
  }

  const stage = document.getElementById('stage');
  // ドラッグを離したときの click はクリックとして数えない（S2を終えた指でS3が割れてしまうのを防ぐ）
  let moved = 0;
  stage.addEventListener('click', () => {
    const s = STEPS[step];
    if (phase !== 'hold' || s.action !== 'click' || moved > 8) return;
    remaining--;
    remaining > 0 ? label.update(s.label(remaining)) : complete();
  });
  let dragX = null;
  stage.addEventListener('pointerdown', (e) => { dragX = e.clientX; moved = 0; });
  window.addEventListener('pointerup', () => (dragX = null));
  window.addEventListener('pointermove', (e) => {
    const s = STEPS[step];
    if (dragX === null) return;
    moved += Math.abs(e.clientX - dragX);
    if (phase !== 'hold' || s.action !== 'drag') return (dragX = e.clientX);
    remaining = Math.max(0, remaining - Math.abs(e.clientX - dragX));
    dragX = e.clientX;
    t = s.a + (1 - remaining / s.px) * (s.b - s.a);
    remaining > 0 ? label.update(s.label(Math.ceil(remaining))) : complete();
  });

  const replay = document.createElement('button');
  replay.className = 'btn replay';
  replay.textContent = 'Replay';
  replay.hidden = true;
  replay.onclick = () => { t = 0; step = 0; phase = 'play'; replay.hidden = true; };
  document.body.appendChild(replay);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const s = STEPS[step];
    if (phase === 'play') {
      t += dt;
      if (s && t >= s.a) { t = s.a; enterHold(); }
      if (!s && t >= CONFIG.duration - 0.01) { t = CONFIG.duration - 0.01; replay.hidden = false; }
    } else if (s.kind === 'loop') {
      t += dt;
      if (t > s.b) t = s.a;
    }
    timeline.render(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
