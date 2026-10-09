import { createStage } from './stage.js';
import { DURATION } from './film.js';

// ?mode=render のとき window.__seek / __showreel を出す（scripts/render.mjs・shoot.mjs 用）
const mode = new URLSearchParams(location.search).get('mode') ?? 'film';
const u = (f) => new URL(`../assets/${f}`, import.meta.url).href;
const stage = await createStage({
  preserveDrawingBuffer: mode === 'render',
  files: {
    tA: u('logo/logo_a_mode.png'), tB: u('logo/logo_b_street.png'), tD: u('logo/logo_d_mono.png'),
    tWall: u('tex/street_wall.png'), tPaper: u('tex/riso_paper.png'), tGrain: u('tex/riso_grain.png'), tCrt: u('tex/crt_glass.png'), tMetal: u('tex/metal_brushed.png'),
  },
});
document.body.appendChild(stage.canvas);

if (mode === 'render') {
  window.__seek = stage.render;
  window.__showreel = { fps: 30, duration: DURATION, seek: (t) => (stage.render(t), stage.canvas.toDataURL('image/png')) };
} else {
  const t0 = performance.now();
  const loop = () => { stage.render(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
  loop();
}
