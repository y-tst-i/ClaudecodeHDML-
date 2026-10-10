import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { PICTURE as PIC } from './picture.js';
import { createPictureCamera, setCrop, toThree, dirToThree } from './camera.js';
import { createGait } from './gait.js';
import { createRig } from './rig.js';
import { createPictureShade } from './shade.js';

// 一枚絵の中を VRM キャラが歩く（toolkit/SKILL.md の 1・3・4・5 を three.js で）。
//   ?mode=render … probe / 書き出し用（window.__showreel.seek(t)）
//   ?grid=1      … 1mマス目と身長の目印を重ねる（1-D の確認）
const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'film';
const showGrid = params.has('grid');
const noZoom = params.has('nozoom'); // 確認用：寄りを止める

const [, , OUT_W, OUT_H] = PIC.crop;
const DURATION = 14;
const SPRING_WINDOW = 1.0; // ばね骨は「直前1秒」を毎回計算し直す（t の純関数にするため）
const SPRING_DT = 1 / 60;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(OUT_W, OUT_H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
document.getElementById('stage').appendChild(renderer.domElement);

// ---- 絵（背景）：元の絵の crop 範囲をそのまま画面に
const tex = await new THREE.TextureLoader().loadAsync(PIC.src);
tex.colorSpace = THREE.SRGBColorSpace;
tex.generateMipmaps = false;
tex.minFilter = THREE.LinearFilter;
const bgScene = new THREE.Scene();
const bgCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const bgMat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, depthTest: false, toneMapped: false });
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
bgQuad.position.set(0.5, 0.5, 0);
bgScene.add(bgQuad);
function setBgCrop([x0, y0, w, h]) {
  tex.repeat.set(w / PIC.width, h / PIC.height);
  tex.offset.set(x0 / PIC.width, 1 - (y0 + h) / PIC.height);
}
setBgCrop(PIC.crop);

// ---- 3D：見えない床と、絵から推定したカメラ
const scene = new THREE.Scene();
const camera = createPictureCamera(PIC, PIC.crop);
const sunDir = dirToThree(PIC.sun.dir);
const shade = createPictureShade(PIC, tex, camera, sunDir);
scene.add(shade.createShadowFloor());

const pathPts = PIC.path.map(([x, z]) => toThree(x, z));
const center = pathPts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pathPts.length);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
sun.position.copy(center).addScaledVector(sunDir, 30);
sun.target.position.copy(center);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 2;
scene.add(sun, sun.target);
// 空と照り返し：上は空の青、下は歩道の明るい色
scene.add(new THREE.HemisphereLight(0xbcd6ff, 0xe8d6bc, 0.75));

// ---- キャラ
const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));
// ?chara=shino のように差し替えて比べられる（public/models/<名前>.vrm）
const charaSrc = params.get('chara') ? `/models/${params.get('chara')}.vrm` : PIC.chara.src;
const gltf = await loader.loadAsync(charaSrc);
const vrm = gltf.userData.vrm;
VRMUtils.rotateVRM0(vrm); // VRM0 は -Z を向いているので +Z へ（rig.js 側で回転を反転して渡す）
VRMUtils.removeUnnecessaryVertices(gltf.scene);
VRMUtils.combineSkeletons(gltf.scene);
vrm.scene.traverse((o) => {
  o.frustumCulled = false;
  if (o.isMesh) {
    o.castShadow = true;
    for (const m of [o.material].flat()) {
      if (m.isMToonMaterial && m.isOutline) {
        // 輪郭線：太めの焦げ茶。光に合わせて色も変わる（日陰では沈む）
        m.outlineWidthFactor *= 2.6;
        m.outlineColorFactor.setRGB(0.28, 0.18, 0.15);
        m.outlineLightingMixFactor = 1;
      }
      if (m.isMToonMaterial && !m.isOutline) {
        // 逆光の縁取り：太陽が後ろにあるので、輪郭だけ暖色に光らせる
        m.parametricRimColorFactor.setRGB(1.0, 0.72, 0.42).multiplyScalar(0.55);
        m.parametricRimFresnelPowerFactor = 3.2;
        m.parametricRimLiftFactor = 0.0;
        m.rimLightingMixFactor = 0.35;
      }
      // 頭まわり（顔・目・髪）は1点で明暗をそろえる。名前で判定（VRoid 系は Face_ / Eye / Hair）
      shade.patchChara(m, { face: /(Face|Eye|Hair)/.test(m.name) });
    }
  }
});
// 身長を決めた値にそろえる
vrm.scene.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(vrm.scene);
const SCALE = PIC.chara.height / (box.max.y - box.min.y);
vrm.scene.scale.setScalar(SCALE);
vrm.scene.updateMatrixWorld(true);
scene.add(vrm.scene);

// スカートのばね骨：歩くたびに広がりすぎるので、硬く・揺れが早く収まるように
for (const j of vrm.springBoneManager?.joints ?? []) {
  if (/skirt/i.test(j.bone.name)) {
    j.settings.stiffness *= 2.2;
    j.settings.dragForce = Math.max(j.settings.dragForce, 0.6);
  }
}

const rig = createRig(vrm, SCALE);
const legLen = rig.legLen;
const gait = createGait({
  points: pathPts,
  tStart: 0.8,
  stepLen: 0.78 * legLen,
  stepTime: 0.52,
  halfWidth: 0.085 * (PIC.chara.height / 1.6),
  foot: rig.footDims,
});

// ---- 足元の接地影：足が床に近いほど濃い（床の影と同じ「乗算」で絵を暗くする）
const blobTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const blobs = ['left', 'right'].map(() => {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(...PIC.shade.tint.map((c) => c * 0.8), THREE.SRGBColorSpace),
    alphaMap: blobTex, transparent: true, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
  return mesh;
});
function placeBlobs(g) {
  const fd = rig.footDims;
  for (const [i, f] of [g.feet.left, g.feet.right].entries()) {
    const lift = Math.max(0, f.pos.y - fd.ankle);
    const b = blobs[i];
    const fwd = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    b.position.copy(f.pos).setY(0.002).addScaledVector(fwd, fd.ball * 0.35);
    b.rotation.y = f.yaw;
    b.scale.set(fd.ball * 1.05, (fd.ball + fd.heel) * 1.45, 1).multiplyScalar(1 + lift * 2.5);
    b.material.opacity = 0.5 * (1 - THREE.MathUtils.smoothstep(lift, 0, 0.08));
  }
}

// ---- 寄り：止まってから、絵の切り出し範囲を狭めてキャラに寄る（カメラは同じ＝合成はずれない）
const endPt = pathPts[pathPts.length - 1].clone().setY(PIC.chara.height * 0.62).project(camera);
const endPx = [((endPt.x + 1) / 2) * OUT_W + PIC.crop[0], ((1 - endPt.y) / 2) * OUT_H + PIC.crop[1]];
function cropAt(t) {
  const [x0, y0, w0, h0] = PIC.crop;
  const k = noZoom ? 0 : THREE.MathUtils.smootherstep(t, gait.tEnd - 1.2, gait.tEnd + 2.6);
  const w = THREE.MathUtils.lerp(w0, w0 * 0.72, k);
  const h = (w * h0) / w0;
  const cx = THREE.MathUtils.lerp(x0 + w0 / 2, endPx[0], k);
  const cy = THREE.MathUtils.lerp(y0 + h0 / 2, endPx[1], k);
  const x = THREE.MathUtils.clamp(cx - w / 2, 0, PIC.width - w);
  const y = THREE.MathUtils.clamp(cy - h / 2, 0, PIC.height - h);
  return [x, y, w, h];
}

// まばたき（決まった時刻）
const BLINKS = [0.35, 2.9, 5.6, 7.15, 8.7, 10.4, 12.3, 13.4];
const blinkAt = (t) => {
  let w = 0;
  for (const b of BLINKS) {
    const x = (t - b) / 0.16;
    if (x > 0 && x < 1) w = Math.max(w, Math.sin(Math.PI * x));
  }
  return w;
};

// 時刻 t の姿勢（ばね骨以外）
function poseAt(t) {
  const g = gait.at(t);
  const after = t - gait.tEnd; // 止まってから
  const look = after > 0.15 ? camera.position : null;
  const lookWeight = THREE.MathUtils.smoothstep(after, 0.15, 0.9);
  rig.apply(g, {
    breathe: Math.sin(t * 2 * Math.PI * 0.28),
    look,
    lookWeight,
    tilt: 0.06 * THREE.MathUtils.smoothstep(after, 0.7, 1.4),
  });
  const em = vrm.expressionManager;
  if (em) {
    em.setValue('blink', blinkAt(t));
    em.setValue('happy', 0.35 * THREE.MathUtils.smoothstep(after, 0.5, 1.3));
  }
  if (vrm.lookAt) vrm.lookAt.target = null;
}

function setPose(t) {
  const t0 = Math.max(0, t - SPRING_WINDOW);
  poseAt(t0);
  vrm.humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  vrm.springBoneManager?.reset();
  const n = Math.round((t - t0) / SPRING_DT);
  for (let i = 1; i <= n; i++) {
    poseAt(t0 + (i / n) * (t - t0));
    vrm.update((t - t0) / n);
  }
  if (n === 0) vrm.update(0);
}

// ---- 1-D の確認用：1mマス目と身長の目印
if (showGrid) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false });
  const pts = [];
  for (let x = -3; x <= 3; x++) pts.push(toThree(x, 1.5, 0.002), toThree(x, 20, 0.002));
  for (let z = 2; z <= 20; z++) pts.push(toThree(-3, z, 0.002), toThree(3, z, 0.002));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat));
  const pm = new THREE.LineBasicMaterial({ color: 0xff481b, depthTest: false });
  for (const z of [3, 5, 8, 12]) {
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([toThree(-0.6, z, 0), toThree(-0.6, z, PIC.chara.height)]), pm));
  }
  g.renderOrder = 10;
  scene.add(g);
}

function render(t) {
  const crop = cropAt(t);
  setCrop(camera, PIC, crop);
  setBgCrop(crop);
  setPose(t);
  shade.setHead(vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.06, 0)));
  placeBlobs(gait.at(t));
  renderer.clear();
  renderer.render(bgScene, bgCam);
  renderer.render(scene, camera);
}

if (mode === 'render') {
  window.__walk = { vrm, scene, camera }; // 確認用
  window.__seek = (t) => render(t);
  window.__showreel = {
    width: OUT_W, height: OUT_H, fps: 30, duration: DURATION,
    seek(t) {
      render(t);
      return renderer.domElement.toDataURL('image/png');
    },
    // 確認用の数値（足が床に着いているか、など）
    debug(t) {
      const g = gait.at(t);
      return { s: g.s, walk: g.walk, feet: { L: g.feet.left.pos.toArray(), R: g.feet.right.pos.toArray() }, tEnd: gait.tEnd, legLen, SCALE };
    },
  };
} else {
  const t0 = performance.now();
  renderer.setAnimationLoop(() => render(((performance.now() - t0) / 1000) % DURATION));
}
