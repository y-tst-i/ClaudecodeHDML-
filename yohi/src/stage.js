import * as THREE from 'three';
import { frag } from './film.js';

// 映像（index.html）と体験型サイト（experience.html）で共通の描画部分。render(t) は時刻 t だけで絵が決まる
// 素材の場所は呼び出し側が渡す（映像は劣化のない PNG、Web は軽い JPEG。両方を参照するとビルドに両方入ってしまうため）
export async function createStage({ files, preserveDrawingBuffer = false }) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(1920, 1080, false);
  const uniforms = { uT: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) } };
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(files).map(async ([k, url]) => {
    const tex = await loader.loadAsync(url).catch(() => new THREE.DataTexture(new Uint8Array([40, 40, 40, 255]), 1, 1));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    uniforms[k] = { value: tex };
  }));
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag }));
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.Camera();
  return {
    canvas: renderer.domElement,
    render(t) { uniforms.uT.value = t; renderer.render(scene, cam); },
    // 画面サイズに合わせて内部解像度を変える（最大 1920x1080。絵の座標は 16:9 固定）
    setSize(w, h) { renderer.setSize(w, h, false); uniforms.uRes.value.set(w, h); },
  };
}
