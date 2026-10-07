import * as THREE from 'three';
import { NOISE } from './glsl.js';

// 最終合成：前の画面(A)と次の画面(B)を、転換の種類に合わせて混ぜる。仕上げにグレイン・ビネット・揺れ。
// type 0 = そのまま / 1 = ディゾルブ / 2 = 生コンが流れ込み、固まって割れる / 3 = 衝撃（白フラッシュ）
const frag = /* glsl */ `
precision highp float;
uniform sampler2D tA, tB; uniform float uP, uType, uTime, uFlash, uGrain; uniform vec2 uShake, uRes;
varying vec2 vUv;
${NOISE}
vec3 fluid(vec2 uv, float wet){
  // 生コン：灰色のペーストに砂利、濡れたつや
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
  float flow = uTime * 0.25;
  float n = fbm(p * 3.0 + vec2(0.0, flow));
  vec3 v = voronoi(p * 18.0 + vec2(0.0, flow * 4.0));
  vec3 col = vec3(0.47, 0.46, 0.44) * (0.85 + 0.3 * n);
  col = mix(col, vec3(0.36, 0.34, 0.31) * (0.8 + 0.4 * v.z), smoothstep(0.26, 0.22, v.x) * 0.6);
  float e = 0.002;
  float nx = fbm((p + vec2(e, 0.0)) * 3.0 + vec2(0.0, flow)) - n;
  float ny = fbm((p + vec2(0.0, e)) * 3.0 + vec2(0.0, flow)) - n;
  vec3 N = normalize(vec3(-nx / e * 0.08, -ny / e * 0.08, 1.0));
  float spec = pow(max(dot(reflect(normalize(vec3(-0.4, 0.6, -1.0)), N), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  return col * (0.7 + 0.4 * N.z) + spec * 0.55 * wet;
}
void main(){
  vec2 uv = vUv + uShake;
  vec3 a = texture2D(tA, uv).rgb;
  vec3 b = texture2D(tB, uv).rgb;
  vec3 col = b;
  if (uType > 0.5 && uType < 1.5) {
    float e = smoothstep(0.0, 1.0, uP);
    vec3 bz = texture2D(tB, (uv - 0.5) * (1.0 - 0.04 * (1.0 - e)) + 0.5).rgb;
    col = mix(a, bz, e);
  } else if (uType > 1.5 && uType < 2.5) {
    if (uP < 0.55) {
      // 流れ込む：上から粘りのある前線が下りてくる
      float k = uP / 0.55; k = k * k * (3.0 - 2.0 * k);
      float front = 1.08 - k * 1.3;
      float x = uv.x * 4.0;
      float f = front + (fbm(vec2(x, uTime * 0.6)) - 0.5) * 0.18 + sin(x * 2.3 + uTime) * 0.025;
      float inside = smoothstep(f - 0.004, f + 0.004, uv.y);
      vec3 fl = fluid(uv, 1.0);
      fl *= 1.0 - smoothstep(f + 0.05, f, uv.y) * 0.35; // 前線の縁に厚み
      col = mix(a, fl, inside);
    } else {
      // 固まって割れ、破片が奥へ沈んで次の画面が現れる
      float k = (uP - 0.55) / 0.45;
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      vec2 p = uv * asp * 3.2;
      vec3 cell = voronoi(p);
      // セルの中心（近似）：最近点への方向から求める
      float d = length(uv - 0.5);
      float go = clamp((k * 1.7 - d * 1.2 - cell.z * 0.25) / 0.45, 0.0, 1.0);
      float s = 1.0 - go;
      vec3 crack = vec3(smoothstep(0.03, 0.0, cell.y));
      vec3 fl = fluid(uv, 1.0 - k);
      fl *= 1.0 - crack * smoothstep(0.0, 0.15, k) * 0.85;
      float keep = step(0.001, s) * smoothstep(0.0, 0.08, cell.y - (1.0 - s) * 0.5);
      fl *= 0.55 + 0.45 * s;
      col = mix(b, fl, keep);
    }
  }
  // 仕上げ：わずかな色収差・ビネット・フィルムグレイン
  vec2 d = vUv - 0.5;
  col = mix(col, vec3(1.0), uFlash);
  col *= 1.0 - dot(d, d) * 0.55;
  col += (hash12(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createComposite() {
  const uniforms = {
    tA: { value: null }, tB: { value: null }, uP: { value: 1 }, uType: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 },
    uGrain: { value: 0.035 }, uShake: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1920, 1080) },
  };
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag }));
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new THREE.Camera();
  return {
    uniforms,
    render(renderer) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
