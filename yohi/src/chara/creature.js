import * as THREE from 'three';

// 電気のけもの（設定画：yohi/assets/chara/mon_b_spark.png）をコードで組み立てる。
// 高さ 1.0（耳の先まで）、足元が原点、顔は +z を向く。
// 動きは update({ t, power, sinceImpact, look }) の値だけで決まる（前のフレームの状態を持たない）。

const MINT = new THREE.Color('#c7ffdb');
const ORANGE = new THREE.Color('#ff481b');

// 角の丸い箱と球の中間（スーパー楕円体）。p が大きいほど四角く、2 で楕円体
function squircle(rx, ry, rz, p = 2.4, ws = 64, hs = 48) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const a = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i).normalize();
    const k = Math.pow(Math.abs(v.x) ** p + Math.abs(v.y) ** p + Math.abs(v.z) ** p, -1 / p);
    a.setXYZ(i, v.x * k * rx, v.y * k * ry, v.z * k * rz);
  }
  g.computeVertexNormals();
  return g;
}
// スーパー楕円体の表面の点と、その向き（目・ほっぺを表面に貼るため）
function surface(rx, ry, rz, p, x, y) {
  const s = 1 - Math.abs(x / rx) ** p - Math.abs(y / ry) ** p;
  const z = rz * Math.max(s, 0) ** (1 / p);
  const n = new THREE.Vector3(
    Math.sign(x) * Math.abs(x) ** (p - 1) / rx ** p,
    Math.sign(y) * Math.abs(y) ** (p - 1) / ry ** p,
    Math.abs(z) ** (p - 1) / rz ** p,
  ).normalize();
  return { pos: new THREE.Vector3(x, y, z), normal: n };
}
// 太さの変わるチューブ（しっぽ）。radius(t) で根元から先までの太さを決める
function taperedTube(curve, radius, t0, t1, seg = 48, rad = 20) {
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = t0 + (t1 - t0) * (i / seg);
    const p = curve.getPointAt(u), r = radius(u);
    const fi = Math.min(seg, Math.round(u * seg));
    const N = frames.normals[fi], B = frames.binormals[fi];
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      pos.push(p.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), p.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), p.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function createCreature({ envMap = null, glowScale = 1 } = {}) {
  // glowScale：暗い部屋（ブルームあり）では光る部分を弱めにしないと、にじみで体が白く霞む
  // ---------- 材質：つるっとしたソフビ ----------
  const vinyl = new THREE.MeshPhysicalMaterial({ color: '#2b1d1a', roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.16, envMap, envMapIntensity: 0.6 });
  // 光る所は「色を黒・発光だけ」にする（照明で白っぽくならず、ミントのまま光る）
  const glow = new THREE.MeshStandardMaterial({ color: '#000000', emissive: MINT, emissiveIntensity: 1.0, roughness: 0.3 });
  const glowEar = glow.clone(), glowCheek = glow.clone();
  const sclera = new THREE.MeshStandardMaterial({ color: '#000000', emissive: MINT, emissiveIntensity: 0.9, roughness: 0.2 });
  // 黒目は光を映さない真っ黒（周りの光を拾うと赤く濁る）。つやは白いハイライトの粒で描く
  const iris = new THREE.MeshBasicMaterial({ color: '#050303' });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const orange = new THREE.MeshPhysicalMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, envMap, envMapIntensity: 0.8 });

  const root = new THREE.Group();     // 足元（跳ねる・つぶれる）
  const rig = new THREE.Group();      // 体全体
  root.add(rig);
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // ---------- 体 ----------
  const Z0 = -0.08;                                   // 体の中心（頭より後ろ）
  const BODY = { rx: 0.22, ry: 0.155, rz: 0.27, p: 2.2 };
  const body = new THREE.Group();
  body.position.set(0, 0.255, Z0);
  body.rotation.x = -0.18;                           // 胸が少し上がる姿勢
  rig.add(body);
  const bodyMat = vinyl.clone();
  add(body, squircle(BODY.rx, BODY.ry, BODY.rz, BODY.p), bodyMat);
  // 胸の光るしま2本：横じまのシャツのように胸の前を巻く。体の材質に「帯」を描き込む
  // （面の法線を前へ傾けた平面で切った帯なので、正面からは水平、横からは斜めに見える）
  const stripeU = { uStripe: { value: 1.0 } };
  bodyMat.onBeforeCompile = (sh) => {
    sh.uniforms.uStripe = stripeU.uStripe;
    sh.vertexShader = 'varying vec3 vLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    sh.fragmentShader = 'varying vec3 vLocal;\nuniform float uStripe;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float d = dot(vLocal, normalize(vec3(0.0, 0.8, 0.6)));
      float band = 0.0;
      band += smoothstep(0.026, 0.016, abs(d - 0.178));
      band += smoothstep(0.026, 0.016, abs(d - 0.1));
      band *= smoothstep(-0.08, -0.02, vLocal.z);              // 胸（前半分）だけ
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0), band);   // 照明で白くならないよう、帯は発光だけ
      totalEmissiveRadiance += vec3(0.78, 1.0, 0.86) * band * uStripe;`);
  };
  // 足：短い円柱＋丸い肉球
  const legs = [];
  for (const [x, z, r] of [[-0.1, 0.15, 0.064], [0.1, 0.15, 0.064], [-0.12, -0.16, 0.07], [0.12, -0.16, 0.07]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0, Z0 + z);
    add(leg, new THREE.CylinderGeometry(r, r * 1.08, 0.14, 24), vinyl, 0, 0.11, 0);
    const paw = add(leg, new THREE.SphereGeometry(1, 32, 20), vinyl, 0, 0.045, 0.012);
    paw.scale.set(r * 1.3, 0.056, r * 1.5);
    rig.add(leg);
    legs.push(leg);
  }
  // しっぽ：おしりから上へ反り、先が太くなってオレンジ。右へ少し流れる
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.0, 0), new THREE.Vector3(0.02, 0.05, -0.08), new THREE.Vector3(0.06, 0.15, -0.13),
    new THREE.Vector3(0.13, 0.27, -0.12), new THREE.Vector3(0.2, 0.35, -0.06),
  ]);
  // 根元から先へ太くなり、最後の2割で炎のようにとがる
  const tailR = (u) => (0.05 + 0.03 * u) * (u > 0.78 ? Math.pow(Math.max(0, 1 - (u - 0.78) / 0.22), 0.75) : 1);
  const tail = new THREE.Group();
  tail.position.set(0, 0.36, Z0 - 0.22);
  rig.add(tail);
  add(tail, taperedTube(tailCurve, tailR, 0, 0.68), vinyl);
  add(tail, taperedTube(tailCurve, tailR, 0.66, 1.0), orange);
  // 火花：しっぽの先のまわりに短い光の線
  const tip = tailCurve.getPointAt(0.97);
  const sparks = [];
  for (let k = 0; k < 5; k++) {
    const a = -0.6 + k * 0.45;
    const s = add(tail, new THREE.BoxGeometry(0.008, 0.035, 0.008), glow, tip.x + Math.sin(a) * 0.09, tip.y + Math.cos(a) * 0.09, tip.z);
    s.rotation.z = -a;
    sparks.push(s);
  }

  // ---------- 頭 ----------
  const HEAD = { rx: 0.31, ry: 0.285, rz: 0.26, p: 2.5 };
  const head = new THREE.Group();
  head.position.set(0, 0.63, 0.08);
  rig.add(head);
  add(head, squircle(HEAD.rx, HEAD.ry, HEAD.rz, HEAD.p), vinyl);
  // 表面に部品を貼る
  const onFace = (x, y, lift = 0) => {
    const { pos, normal } = surface(HEAD.rx, HEAD.ry, HEAD.rz, HEAD.p, x, y);
    const g = new THREE.Group();
    g.position.copy(pos).addScaledVector(normal, lift);
    g.lookAt(g.position.clone().add(normal));
    head.add(g);
    return g;
  };
  // 目：光る白目 → 黒目 → ハイライト。上のまぶたが斜めにかかって、少し強気な目つき
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = onFace(side * 0.14, -0.075, -0.012);
    const inner = new THREE.Group();
    eye.add(inner);
    add(inner, new THREE.SphereGeometry(1, 40, 28), sclera).scale.set(0.088, 0.108, 0.03);
    const ir = add(inner, new THREE.SphereGeometry(1, 40, 28), iris, -side * 0.016, -0.014, 0.016);
    ir.scale.set(0.058, 0.074, 0.022);
    add(ir, new THREE.SphereGeometry(1, 16, 12), shine, side * 0.32, 0.38, 0.9).scale.setScalar(0.26);
    add(ir, new THREE.SphereGeometry(1, 12, 8), shine, -side * 0.25, -0.42, 0.9).scale.setScalar(0.12);
    // 目全体を少しだけ傾けて（目じりが上）、強気な目つきにする
    eye.rotateZ(side * 0.12);
    eyes.push({ inner, iris: ir });
  }
  // 鼻とほっぺ
  add(onFace(0, -0.15, 0.004), new THREE.SphereGeometry(1, 20, 14), iris).scale.set(0.02, 0.014, 0.014);
  for (const side of [-1, 1]) add(onFace(side * 0.215, -0.165, 0), new THREE.SphereGeometry(1, 24, 14), glowCheek).scale.set(0.036, 0.024, 0.008);
  // 耳：丸みのある三角錐、先だけ光る
  const earProfile = [[0.095, 0], [0.09, 0.045], [0.072, 0.095], [0.05, 0.132], [0.028, 0.158], [0.01, 0.173], [0, 0.178]].map(([r, y]) => new THREE.Vector2(r, y));
  const tipProfile = earProfile.filter((p) => p.y >= 0.095).map((p) => new THREE.Vector2(p.x * 1.03 + 0.001, p.y + 0.001));
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    const x = side * 0.175;
    const yTop = HEAD.ry * Math.pow(1 - Math.abs(x / HEAD.rx) ** HEAD.p, 1 / HEAD.p);
    ear.position.set(x, yTop - 0.035, -0.03);
    const e = add(ear, new THREE.LatheGeometry(earProfile, 32), vinyl);
    const et = add(ear, new THREE.LatheGeometry(tipProfile, 32), glowEar);
    e.scale.z = et.scale.z = 0.72;
    ear.rotation.z = -side * 0.28;
    head.add(ear);
    ears.push({ g: ear, side });
  }

  // ---------- 動き ----------
  function update({ t = 0, power = 0, sinceImpact = -1, look = { x: 0, y: 0 } } = {}) {
    const impacted = sinceImpact >= 0;
    // 跳ねる：衝撃の瞬間に沈んで → 跳ぶ → 着地でつぶれる
    let jump = 0, squash = 0;
    if (impacted) {
      const s = sinceImpact;
      if (s < 0.08) squash = s / 0.08 * 0.18;
      else if (s < 0.63) { const k = (s - 0.08) / 0.55; jump = 0.42 * 4 * k * (1 - k); squash = -0.1 * Math.sin(k * Math.PI); }
      else squash = 0.16 * Math.exp(-(s - 0.63) * 9) * Math.cos((s - 0.63) * 22);
    } else squash = power * 0.06 * (0.6 + 0.4 * Math.sin(t * 30));   // 溜めているあいだ、ぶるぶる震える
    const breath = Math.sin(t * 2.4) * 0.012;
    root.position.y = jump;
    rig.scale.set(1 + squash * 0.5, 1 - squash + breath, 1 + squash * 0.5);
    // 頭：マウスの方を見る。ゆっくり首をかしげる
    head.rotation.y = look.x * 0.45 + Math.sin(t * 0.7) * 0.05;
    head.rotation.x = -look.y * 0.18 + Math.sin(t * 0.9) * 0.02;
    head.rotation.z = Math.sin(t * 0.5) * 0.06;
    // まばたき（3.7秒ごと。衝撃の直後は目を見開く）
    const bk = (t / 3.7 + 0.31) % 1;
    const blink = bk < 0.05 ? Math.sin(bk / 0.05 * Math.PI) : 0;
    const wide = impacted ? Math.exp(-sinceImpact * 1.5) * 0.18 : 0;
    for (const e of eyes) { e.inner.scale.y = Math.max(0.08, 1 - blink * 0.95); e.iris.scale.set(0.058 * (1 + wide), 0.074 * (1 + wide), 0.022); }
    // 耳：ときどきピクッと動く。溜めると後ろへ倒れる
    const tw = hash(Math.floor(t / 2.9), 5) > 0.5 ? Math.max(0, Math.sin(((t % 2.9) / 0.25) * Math.PI)) * ((t % 2.9) < 0.25 ? 1 : 0) : 0;
    for (const e of ears) e.g.rotation.set(-0.1 - power * 0.35 + tw * 0.25, 0, -e.side * (0.28 + tw * 0.12));
    // しっぽ：ゆっくり揺れる。溜めると細かく震え、衝撃のあとは嬉しそうに大きく振る
    const wag = impacted ? Math.sin(t * 9) * 0.45 * (0.5 + 0.5 * Math.exp(-sinceImpact * 0.6)) : Math.sin(t * 1.8) * 0.22 + power * Math.sin(t * 40) * 0.06;
    tail.rotation.set(0.05 * Math.sin(t * 1.3), wag, 0);
    // 光：溜まるほど強く、ちらつく。衝撃で最大
    const flick = 0.85 + 0.15 * hash(Math.floor(t * 20), 3);
    const charge = impacted ? 0.4 + Math.exp(-sinceImpact * 3) * 3 : power * 2.2;
    stripeU.uStripe.value = (0.9 + charge) * (power > 0.05 && !impacted ? flick : 1) * glowScale;
    glowEar.emissiveIntensity = (1.0 + charge * 0.8) * glowScale;
    glowCheek.emissiveIntensity = (0.9 + charge * 0.3) * glowScale;
    sclera.emissiveIntensity = (0.8 + charge * 0.15) * glowScale;
    orange.emissiveIntensity = (0.35 + charge * 0.5) * glowScale;
    sparks.forEach((s, k) => { s.visible = hash(Math.floor(t * 15), k) < 0.35 + (impacted ? 0.5 : power * 0.6); });
  }
  update();
  return { group: root, update };
}
