import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 全場面で共通の仕上げ：光のにじみ（ブルーム）→ レンズ（色ずれ・周辺減光・埃と傷・フィルムの粒）→ 表示用の色へ
const lensFrag = /* glsl */ `
uniform sampler2D tDiffuse, uDust;
uniform float uT, uHit;
uniform vec2 uRes;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  float ca = 0.004 + 0.02 * uHit;                       // 端ほど色がずれる（衝撃で大きく）
  vec3 col;
  col.r = texture2D(tDiffuse, vUv - c * ca).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv + c * ca).b;
  col *= 1.0 - r2 * 1.1;                                 // 周辺減光
  float f = floor(uT * 24.0);                            // フィルムは 24 コマで粒が変わる
  col += (hash(vUv * uRes + f * 13.1) - 0.5) * 0.035;
  vec2 du = vUv * vec2(uRes.x / uRes.y, 1.0) * 0.6 + vec2(hash(vec2(floor(uT * 2.0), 1.0)), hash(vec2(floor(uT * 2.0), 2.0)));
  col += texture2D(uDust, du).r * 0.05;                  // レンズの埃と傷（半拍ごとに位置が変わる）
  col += vec3(0.9, 1.0, 0.95) * uHit * 0.08;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

export function createPost(renderer, scene, camera, dustTex) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.9, 0.5, 0.8);
  composer.addPass(bloom);
  const lens = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uDust: { value: dustTex }, uT: { value: 0 }, uHit: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: lensFrag,
  });
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  return {
    setSize(w, h) { composer.setSize(w, h); lens.uniforms.uRes.value.set(w, h); },
    render({ t, hit, power }) {
      bloom.strength = 0.7 + power * 0.4 + hit * 0.5;
      lens.uniforms.uT.value = t;
      lens.uniforms.uHit.value = hit;
      composer.render();
    },
  };
}
