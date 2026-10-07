import * as THREE from 'three';
import { CONFIG } from '../config.js';

// 場面転換：ステッカーが画面を覆い、剥がれると次のシーンになっている。
// progress: 0 = 何もない / 1 = 全面が覆われている / 2 = すべて剥がれた
export function createStickerWipe() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    uniforms: {
      uProgress: { value: 0 },
      uAspect: { value: CONFIG.width / CONFIG.height },
      uTheme: { value: new THREE.Color(CONFIG.theme) },
      uPaper: { value: new THREE.Color(CONFIG.paper) },
      uInk: { value: new THREE.Color(CONFIG.ink) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress, uAspect;
      uniform vec3 uTheme, uPaper, uInk;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vec2(vUv.x * uAspect, vUv.y) * 5.0;
        vec2 cell = floor(p);
        float bestZ = -1.0; vec3 col = vec3(0.0); float alpha = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = cell + vec2(i, j);
          float h = hash(c);
          vec2 center = c + 0.5 + (vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5) * 0.5;
          float delay = h * 0.45;
          float on = smoothstep(delay, delay + 0.5, uProgress) - smoothstep(1.0 + delay, 1.5 + delay, uProgress);
          float r = 1.15 * on;
          float d = length(p - center);
          if (d < r && h > bestZ) {
            bestZ = h;
            vec3 fill = h < 0.5 ? uTheme : (h < 0.8 ? uInk : uPaper);
            col = d > r - 0.07 ? uPaper : fill; // 白いフチ = ステッカーらしさ
            alpha = 1.0;
          }
        }
        float full = smoothstep(0.9, 1.0, uProgress) * (1.0 - smoothstep(1.0, 1.1, uProgress));
        col = mix(col, uTheme, full * (1.0 - alpha));
        alpha = max(alpha, full);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return { scene, camera: new THREE.Camera(), set progress(v) { material.uniforms.uProgress.value = v; } };
}
