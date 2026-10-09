import '@fontsource/jetbrains-mono/600.css';
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPost } from './post.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCreature } from '../chara/creature.js';
import { prepareAudio, resumeAudio, sfx, setMuted, audioState } from '../audio.js';

// ブラウン管の部屋：長押しで電気が溜まり、テレビが主役から順に点いていく。溜めきると全部が光る。
// 絵は (t, power, sinceImpact) だけで決まる。?mode=render では power を台本どおりに動かして __seek(t) を出す。
const params = new URLSearchParams(location.search);
const RENDER = params.get('mode') === 'render';
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: RENDER, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(1);
$('screen').appendChild(renderer.domElement);

const world = await createWorld(renderer, {
  logoD: new URL('../../assets/logo/logo_d_mono.png', import.meta.url).href,
  crt: new URL('../../assets/tex/crt_glass.jpg', import.meta.url).href,
  grain: new URL('../../assets/tex/riso_grain.jpg', import.meta.url).href,
  logoA: new URL('../../assets/logo/logo_a_mode.png', import.meta.url).href,
  logoB: new URL('../../assets/logo/logo_b_street.png', import.meta.url).href,
  street: new URL('../../assets/tex/street_wall.jpg', import.meta.url).href,
  paper: new URL('../../assets/tex/riso_paper.jpg', import.meta.url).href,
  plastic: new URL('../../assets/room/tv_plastic.jpg', import.meta.url).href,
  wood: new URL('../../assets/room/tv_wood.jpg', import.meta.url).href,
  floor: new URL('../../assets/room/floor_concrete.jpg', import.meta.url).href,
  wall: new URL('../../assets/room/wall_dark.jpg', import.meta.url).href,
  smudge: new URL('../../assets/room/glass_smudge.jpg', import.meta.url).href,
  dust: new URL('../../assets/room/dust_scratch.jpg', import.meta.url).href,
});
// 電気のけもの：主役のテレビの上に座っている。部屋が暗いので、映り込み用の環境光は弱く
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const mon = createCreature({ envMap: env, glowScale: 0.4 });
// 置き場所は外側の入れ物で決める（キャラ自身の position.y は跳ねる動きに使うため）
const monHolder = new THREE.Group();
monHolder.add(mon.group);
monHolder.scale.setScalar(0.74);
monHolder.position.set(0.32, 1.12, 1.0);
monHolder.rotation.y = -0.25;
mon.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.35; });
world.scene.add(monHolder);
// テレビの画面の光が下からけものを照らす
const monLight = new THREE.PointLight(0xc8ffe0, 0, 2.2, 1.5);
monLight.position.set(0.1, 1.05, 1.75);
world.scene.add(monLight);
const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 60);
const post = createPost(renderer, world.scene, camera, world.tex.dust);

// カメラ：ゆっくり寄りながら、マウスで少し覗き込める。衝撃で揺れる
function placeCamera(t, look, hit, power) {
  const dolly = 6.6 - Math.min(t, 20) * 0.02 - power * 0.35;
  const shake = hit * 0.06;
  camera.position.set(look.x * 0.45 + Math.sin(t * 61) * shake, 1.35 + look.y * 0.2 + Math.cos(t * 53) * shake, dolly);
  camera.lookAt(look.x * 0.15, 1.2 + look.y * 0.08, 0);
}
function draw(t, power, sinceImpact, look = { x: 0, y: 0 }) {
  const { hit } = world.update({ t, power, sinceImpact });
  mon.update({ t, power, sinceImpact, look });
  monLight.intensity = 0.15 + Math.min(1, sinceImpact >= 0 ? 1 : power) * 0.35 + hit * 1.2;
  placeCamera(t, look, hit, power);
  post.render({ t, hit, power });
}
// 画質の段階（パソコンの速さを測って自動で下げる）：描く解像度 → 床の映り込み
const QUALITY = [{ name: 'HIGH', scale: 1, dpr: 2 }, { name: 'MID', scale: 0.72, dpr: 1.25 }, { name: 'LOW', scale: 0.5, dpr: 1 }];
let quality = 0;
function fit() {
  const Q = QUALITY[quality];
  const w = RENDER ? 1920 : Math.min(innerWidth, innerHeight * 16 / 9) * Q.scale, dpr = RENDER ? 1 : Math.min(devicePixelRatio || 1, Q.dpr);
  const pw = Math.min(1920, Math.round(w * dpr)), ph = Math.round(pw * 9 / 16);
  renderer.setSize(pw, ph, false);
  post.setSize(pw, ph);
  camera.aspect = 16 / 9;
  camera.updateProjectionMatrix();
}
fit();

if (RENDER) {
  // 台本：0.6秒から長押し、3.0秒で溜めきって衝撃
  const scripted = (t) => {
    const k = Math.max(0, Math.min(1, (t - 0.6) / 2.4));
    return { power: k * k * (3 - 2 * k), sinceImpact: t - 3.0 };
  };
  window.__seek = (t) => { const s = scripted(t); draw(t, s.power, s.sinceImpact); };
  window.__showreel = { fps: 30, duration: 6, seek: (t) => (window.__seek(t), renderer.domElement.toDataURL('image/png')) };
} else {
  addEventListener('resize', fit);
  prepareAudio();
  let started = false, holding = false, power = 0, impactAt = null, charge = null, muted = false, t = 0;
  const look = { x: 0, y: 0 }, lookTarget = { x: 0, y: 0 };
  const begin = () => { resumeAudio(); if (!started) { started = true; sfx('power', { gain: 0.8 }); } };
  const down = () => { begin(); holding = true; };
  const up = () => { holding = false; charge?.stop(0.08); charge = null; };
  const surface = $('screen');
  surface.addEventListener('pointerdown', (e) => { surface.setPointerCapture(e.pointerId); down(); });
  surface.addEventListener('pointerup', up);
  surface.addEventListener('pointercancel', up);
  addEventListener('pointermove', (e) => { lookTarget.x = e.clientX / innerWidth * 2 - 1; lookTarget.y = -(e.clientY / innerHeight * 2 - 1); });
  addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'BUTTON') { e.preventDefault(); down(); } });
  addEventListener('keyup', (e) => { if (e.code === 'Space') up(); });
  $('sound').addEventListener('click', () => { muted = !muted; setMuted(muted); $('sound').textContent = muted ? 'SOUND OFF' : 'SOUND ON'; });
  $('replay').addEventListener('click', () => { power = 0; impactAt = null; $('replay').hidden = true; $('hint').textContent = 'HOLD'; });

  // 1コマの時間を測り、遅ければ1段ずつ軽くする（上げ直しはしない：行ったり来たりでガタつかないように）
  const showQuality = () => { $('quality').textContent = QUALITY[quality].name; };
  showQuality();
  let samples = [], settleUntil = performance.now() + 1500;
  const measure = (raw, now) => {
    if (now < settleUntil || quality >= QUALITY.length - 1) return;
    samples.push(raw);
    // 45コマ集まるか、1.5秒たったら判定（遅いパソコンほど早く軽くなる）
    const spent = samples.reduce((a, b) => a + b, 0);
    if (samples.length < 45 && !(spent > 1.5 && samples.length >= 4)) return;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    samples = [];
    if (avg > 0.028) { quality++; fit(); world.setQuality(quality); showQuality(); settleUntil = now + 1500; }
  };
  let last = performance.now();
  const frame = (now) => {
    const raw = (now - last) / 1000;
    const dt = Math.min(0.05, raw);
    last = now;
    measure(raw, now);
    t += dt;
    const prev = power;
    if (impactAt === null) {
      if (holding) {
        if (!charge) charge = sfx('charge', { offset: Math.max(0, power * 1.6) });
        power = Math.min(1, power + dt * 0.55);
      } else power = Math.max(0, power - dt * 0.8);
      // 点いた瞬間に「カチッ」（左右の位置もテレビに合わせる）
      for (const tv of world.tvs) if (prev < tv.threshold && power >= tv.threshold) sfx('snap', { gain: tv.hero ? 1 : 0.45, pan: tv.pan });
      if (power >= 1) {
        impactAt = t; charge?.stop(0.02); charge = null; sfx('impact');
        $('hint').textContent = '';
        setTimeout(() => { $('replay').hidden = false; }, 2500);
      }
    }
    look.x += (lookTarget.x - look.x) * Math.min(1, dt * 3);
    look.y += (lookTarget.y - look.y) * Math.min(1, dt * 3);
    $('bar').style.transform = `scaleX(${impactAt === null ? power : 0})`;
    draw(t, power, impactAt === null ? -1 : t - impactAt, look);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__room = { state: () => ({ started, power, impacted: impactAt !== null, quality: QUALITY[quality].name, audio: audioState() }) };
}
