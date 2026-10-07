import * as THREE from 'three';

// Canvasで文字を描いてテクスチャにする。フォントファイル不要で太いタイポが出せる。
export function textTexture(text, { size = 256, color = '#fff', bg = null, weight = 900, font = 'Inter, "Helvetica Neue", Arial, sans-serif', pad = 0.15 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${weight} ${size}px ${font}`;
  const w = Math.ceil(ctx.measureText(text).width + size * pad * 2);
  const h = Math.ceil(size * 1.2);
  c.width = w;
  c.height = h;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size * pad, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect: w / h };
}

export function textPlane(text, height, opts) {
  const { tex, aspect } = textTexture(text, opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), mat);
}
