import * as THREE from 'three';
import { frag, DURATION } from './film.js';

// ?mode=render のとき window.__seek / __showreel を出す（scripts/render.mjs・shoot.mjs 用）
THREE.ColorManagement.enabled = false;
const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'film';
// ?c3=b&c4=b で B案（既定は A案）
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: mode === 'render' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1);
renderer.setSize(1920, 1080, false);
document.body.appendChild(renderer.domElement);

const files = {
  tA: '../assets/logo/logo_a_mode.png', tB: '../assets/logo/logo_b_street.png', tD: '../assets/logo/logo_d_mono.png',
  tWall: '../assets/tex/street_wall.png', tPaper: '../assets/tex/riso_paper.png', tGrain: '../assets/tex/riso_grain.png',
  tCrt: '../assets/tex/crt_glass.png', tMetal: '../assets/tex/metal_brushed.png',
};
const loader = new THREE.TextureLoader();
const uniforms = { uT: { value: 0 }, uC3: { value: params.get('c3') === 'b' ? 1 : 0 }, uC4: { value: params.get('c4') === 'b' ? 1 : 0 }, uRes: { value: new THREE.Vector2(1920, 1080) } };
await Promise.all(Object.entries(files).map(async ([k, f]) => {
  const tex = await loader.loadAsync(new URL(f, import.meta.url).href).catch(() => new THREE.DataTexture(new Uint8Array([40, 40, 40, 255]), 1, 1));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  uniforms[k] = { value: tex };
}));
const scene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag }));
quad.frustumCulled = false;
scene.add(quad);
const cam = new THREE.Camera();
const render = (t) => { uniforms.uT.value = t; renderer.render(scene, cam); };

if (mode === 'render') {
  window.__seek = render;
  window.__showreel = { fps: 30, duration: DURATION, seek: (t) => (render(t), renderer.domElement.toDataURL('image/png')) };
} else {
  const t0 = performance.now();
  renderer.setAnimationLoop(() => render(((performance.now() - t0) / 1000) % DURATION));
}
