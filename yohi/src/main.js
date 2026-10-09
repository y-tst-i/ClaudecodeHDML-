import { createStage } from './stage.js';
import { DURATION } from './film.js';

// ?mode=render のとき window.__seek / __showreel を出す（scripts/render.mjs・shoot.mjs 用）
const mode = new URLSearchParams(location.search).get('mode') ?? 'film';
// 映像の書き出しは劣化のない PNG（new URL には文字列をそのまま書く：変数を混ぜると Vite が解決できない）
const stage = await createStage({
  preserveDrawingBuffer: mode === 'render',
  files: {
    tA: new URL('../assets/logo/logo_a_mode.png', import.meta.url).href, tB: new URL('../assets/logo/logo_b_street.png', import.meta.url).href,
    tD: new URL('../assets/logo/logo_d_mono.png', import.meta.url).href, tWall: new URL('../assets/tex/street_wall.png', import.meta.url).href,
    tPaper: new URL('../assets/tex/riso_paper.png', import.meta.url).href, tGrain: new URL('../assets/tex/riso_grain.png', import.meta.url).href,
    tCrt: new URL('../assets/tex/crt_glass.png', import.meta.url).href, tMetal: new URL('../assets/tex/metal_brushed.png', import.meta.url).href,
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
