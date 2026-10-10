import * as THREE from 'three';

// 絵から推定したカメラ（toolkit/scripts/camera.py と同じ約束）を three.js のカメラにする。
//   ツールキットの世界: x=右, y=上, z=奥（左手系）  →  three.js: (x, y, -z)
//   yaw=右向き+, pitch=上向き+。主点 (cx, cy) は絵の中心でなくてもよい（レンズが横にずれた絵）。
export const toThree = (x, z, y = 0) => new THREE.Vector3(x, y, -z);
export const dirToThree = ([x, y, z]) => new THREE.Vector3(x, y, -z).normalize();

export function focalFromHfov(hfovDeg, widthPx) {
  return widthPx / 2 / Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2);
}

// 主点を中心にした「仮想の大きな絵」を考え、元の絵をその一部として切り出す
function virtualFrame(pic) {
  const { width: W, height: H } = pic;
  const { cx = W / 2, cy = H / 2 } = pic.cam;
  const vw = 2 * Math.max(cx, W - cx);
  const vh = 2 * Math.max(cy, H - cy);
  return { vw, vh, ox: vw / 2 - cx, oy: vh / 2 - cy, F: focalFromHfov(pic.cam.hfov, W) };
}

// crop = 出力に使う元の絵の範囲 [x0, y0, w, h]（px）
export function createPictureCamera(pic, crop) {
  const v = virtualFrame(pic);
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(v.vh / 2 / v.F));
  const cam = new THREE.PerspectiveCamera(vfov, v.vw / v.vh, 0.05, 200);
  cam.position.set(0, pic.cam.height, 0);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = -THREE.MathUtils.degToRad(pic.cam.yaw);
  cam.rotation.x = THREE.MathUtils.degToRad(pic.cam.pitch);
  setCrop(cam, pic, crop);
  return cam;
}

export function setCrop(cam, pic, [x0, y0, w, h]) {
  const v = virtualFrame(pic);
  cam.aspect = v.vw / v.vh; // three.js は view 使用時、aspect を「全体」の縦横比として扱う
  cam.setViewOffset(v.vw, v.vh, x0 + v.ox, y0 + v.oy, w, h);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
