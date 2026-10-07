import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';

// 仕上げ：PS1風（低解像度・15bitカラー・ディザ）⇄ HD（ブルーム）を1本のパイプラインで切り替える
const RetroShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(CONFIG.width, CONFIG.height) },
    uPixel: { value: 1 }, // 1ピクセルの大きさ。4 ≒ 320x180
    uRetro: { value: 0 }, // 1 = 色数削減＋ディザ
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#ffffff') },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.04 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uPixel, uRetro, uFlash, uVignette, uGrain, uTime; uniform vec3 uFlashColor;
    varying vec2 vUv;
    float bayer4(vec2 p){
      int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
      int i = x + y * 4;
      int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
      return float(m[i]) / 16.0 - 0.5;
    }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 px = floor(vUv * uRes / uPixel);
      vec2 uv = uPixel > 1.0 ? (px + 0.5) * uPixel / uRes : vUv;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      if (uRetro > 0.5) {
        c = floor(c * 31.0 + 0.5 + bayer4(px) * 1.2) / 31.0; // 15bit + ディザ
      } else {
        c += (hash(vUv * uRes + uTime) - 0.5) * uGrain; // HD側は粒子感で実写寄りに
      }
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * dot(d, d) * 2.0;
      c = mix(c, uFlashColor, clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPost(renderer) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(CONFIG.width, CONFIG.height);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(CONFIG.width, CONFIG.height), 1.0, 0.6, 0.6);
  const retro = new ShaderPass(RetroShader);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(retro);
  const u = retro.uniforms;
  return {
    composer,
    render(scene, camera, { pixel = 1, retro: r = 0, bloom: b = 1, flash = 0, flashColor = '#ffffff', time = 0 } = {}) {
      renderPass.scene = scene;
      renderPass.camera = camera;
      bloom.strength = b;
      u.uPixel.value = pixel;
      u.uRetro.value = r;
      u.uFlash.value = flash;
      u.uFlashColor.value.set(flashColor);
      u.uTime.value = time;
      composer.render();
    },
  };
}
