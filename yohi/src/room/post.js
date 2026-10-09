import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 全場面で共通の仕上げ：光のにじみ（ブルーム）→ レンズ（色ずれ・周辺減光・埃と傷・フィルムの粒）→ 表示用の色へ
const lensFrag = /* glsl */ `
uniform sampler2D tDiffuse, uDust;
uniform float uT, uHit, uMask;   // uMask 0..1：画面に吸い込まれて、ブラウン管の画素が視界を埋める
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
  if (uMask > 0.0) {
    // 赤・緑・青の縦線（ブラウン管の蛍光体）。uMask が上がるほど太く拡大され、明るくなる
    float cells = mix(180.0, 4.0, pow(uMask, 0.55));
    float x = fract((vUv.x - 0.5) * cells * (uRes.x / uRes.y) * 0.5 + 0.5);
    float yb = smoothstep(0.0, 0.08, fract(vUv.y * cells * 0.5 + floor((vUv.x - 0.5) * cells * (uRes.x / uRes.y) * 0.5) * 0.5));
    // 3本の蛍光体の間に黒いすき間。この世界の色（緑白）に寄せて、緑を一番明るく
    vec3 tri = vec3(smoothstep(0.02, 0.05, x) * smoothstep(0.30, 0.27, x), smoothstep(0.36, 0.39, x) * smoothstep(0.64, 0.61, x), smoothstep(0.70, 0.73, x) * smoothstep(0.98, 0.95, x)) * yb;
    // 線が細すぎて画面の点より小さい間は、3色を混ぜた色にしておく（チラつき・モアレを防ぐ）
    float px = uRes.x / (cells * (uRes.x / uRes.y) * 0.5 * 3.0);
    tri = mix(vec3(0.42), tri, smoothstep(1.5, 4.0, px));
    // 明るさは頭打ちにする（白飛びした所に掛けると色が濁ってピンクになる）
    float lum = min(dot(col, vec3(0.3, 0.6, 0.1)), 1.0);
    vec3 masked = tri * (0.25 + lum * 0.9) * vec3(0.5, 1.0, 0.62);
    col = mix(col, masked, smoothstep(0.0, 0.35, uMask));
    col += vec3(0.6, 0.85, 0.7) * smoothstep(0.75, 1.0, uMask) * 0.9;   // 最後は緑白に満ちる
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

export function createPost(renderer, scene, camera, dustTex) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.9, 0.5, 0.8);
  composer.addPass(bloom);
  const lens = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uDust: { value: dustTex }, uT: { value: 0 }, uHit: { value: 0 }, uMask: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: lensFrag,
  });
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  return {
    // 場面を切り替える（仕上げの効果はそのまま共通で使う）
    setView(scene, camera) { renderPass.scene = scene; renderPass.camera = camera; },
    setSize(w, h) { composer.setSize(w, h); lens.uniforms.uRes.value.set(w, h); },
    render({ t, hit, power, mask = 0 }) {
      lens.uniforms.uMask.value = mask;
      bloom.strength = 0.7 + power * 0.4 + hit * 0.5;
      lens.uniforms.uT.value = t;
      lens.uniforms.uHit.value = hit;
      composer.render();
    },
  };
}
