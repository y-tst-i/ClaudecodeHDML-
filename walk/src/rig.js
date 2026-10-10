import * as THREE from 'three';

// gait.js の結果（腰の位置・足首の位置と向き）を VRM の正規化ボーンに載せる。
//   - 腰の高さは「脚が伸びきらない高さ」で頭打ちにする（toolkit の max_leg_stretch_m が 0 になる条件）
//   - ひざは二関節IK（太もも・すねの長さは変えない）。式は toolkit/SKILL.md の 4 と同じ
// VRM1 の正規化ボーンは「Tポーズで全部が無回転・キャラは +Z を向く・キャラの左が +X」。

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const q = () => new THREE.Quaternion();
const v = () => new THREE.Vector3();
const yawQ = (a) => q().setFromAxisAngle(Y, a);
const euler = (x, y, z, order = 'XYZ') => q().setFromEuler(new THREE.Euler(x, y, z, order));

// Y軸（骨の向きの逆）と Z軸（前）から姿勢を作る
function basisQ(boneDir, fwd) {
  const y = boneDir.clone().negate().normalize();
  const z = fwd.clone().addScaledVector(y, -fwd.dot(y)).normalize();
  const x = v().crossVectors(y, z).normalize();
  return q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// 二関節IK：hip と ankle からひざの位置（pole = ひざを出す向き）
export function solveKnee(hip, ankle, l1, l2, pole) {
  const d = v().subVectors(ankle, hip);
  const D = Math.min(d.length(), (l1 + l2) * 0.9999);
  const dn = d.normalize();
  const a = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const pp = pole.clone().addScaledVector(dn, -pole.dot(dn)).normalize();
  return hip.clone().addScaledVector(dn, a).addScaledVector(pp, h);
}

export function createRig(vrm, scale) {
  const H = vrm.humanoid;
  const bone = (name) => H.getNormalizedBoneNode(name);
  const restPos = (name) => {
    const n = bone(name);
    return n ? n.getWorldPosition(v()) : null;
  };
  vrm.scene.updateMatrixWorld(true);

  const hips = bone('hips');
  const rest = { hips: restPos('hips'), head: restPos('head') };
  const legs = {};
  for (const [side, s] of [['left', 1], ['right', -1]]) {
    const hip = restPos(`${side}UpperLeg`), knee = restPos(`${side}LowerLeg`), ankle = restPos(`${side}Foot`);
    const toes = restPos(`${side}Toes`);
    legs[side] = {
      s,
      offset: v().subVectors(hip, rest.hips), // 腰の中心 → 股関節（腰の座標で）
      l1: hip.distanceTo(knee),
      l2: knee.distanceTo(ankle),
      // 休みの姿勢での骨の向き（ほぼ真下だが少しずれている分を打ち消す）
      a1: q().setFromUnitVectors(DOWN, v().subVectors(knee, hip).normalize()).invert(),
      a2: q().setFromUnitVectors(DOWN, v().subVectors(ankle, knee).normalize()).invert(),
      ankleH: ankle.y,
      ball: toes ? toes.z - ankle.z : 0.12 * scale,
      upper: bone(`${side}UpperLeg`), lower: bone(`${side}LowerLeg`), foot: bone(`${side}Foot`),
    };
  }
  const footDims = {
    ankle: (legs.left.ankleH + legs.right.ankleH) / 2,
    ball: (legs.left.ball + legs.right.ball) / 2,
    heel: 0.35 * ((legs.left.ball + legs.right.ball) / 2),
  };
  const legLen = legs.left.l1 + legs.left.l2;

  // pose: gait.at(t) の結果 ＋ { breathe, look: THREE.Vector3|null }
  function apply(pose, extra = {}) {
    const { walk } = pose;
    const fL = pose.feet.left, fR = pose.feet.right;
    // 足が前に出ている量（腰から見て）→ 腰のひねり・腕振り
    const fwdOf = (f) => v().subVectors(f.pos, pose.pelvis).dot(pose.tan);
    const legDiff = fwdOf(fL) - fwdOf(fR); // + = 左足が前

    // 腰：進む向き＋足に合わせて少しひねる、前へ少し倒す
    const twist = 0.16 * legDiff;
    const Qh = yawQ(pose.yaw + twist).multiply(euler(0.035 * walk, 0, 0));
    const pelvis = pose.pelvis.clone();
    let y = rest.hips.y - 0.035 * legLen * walk + pose.bob + (extra.breathe ?? 0) * 0.004;
    // 脚が伸びきらない高さで頭打ち
    for (const [side, f] of [['left', fL], ['right', fR]]) {
      const lg = legs[side];
      const off = lg.offset.clone().applyQuaternion(Qh);
      const hx = pelvis.x + off.x - f.pos.x, hz = pelvis.z + off.z - f.pos.z;
      const reach = (lg.l1 + lg.l2) * 0.995;
      const yMax = f.pos.y + Math.sqrt(Math.max(reach * reach - hx * hx - hz * hz, 0)) - off.y;
      y = Math.min(y, yMax);
    }
    pelvis.y = y;
    hips.position.copy(pelvis).divideScalar(scale);
    hips.quaternion.copy(Qh);

    const fwd = pose.tan.clone();
    for (const [side, f] of [['left', fL], ['right', fR]]) {
      const lg = legs[side];
      const hipW = pelvis.clone().add(lg.offset.clone().applyQuaternion(Qh));
      const footFwd = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      const pole = footFwd.clone().add(fwd).normalize();
      const knee = solveKnee(hipW, f.pos, lg.l1, lg.l2, pole);
      const Qt = basisQ(v().subVectors(knee, hipW), pole).multiply(lg.a1);
      const Qs = basisQ(v().subVectors(f.pos, knee), pole).multiply(lg.a2);
      const Qf = yawQ(f.yaw).multiply(q().setFromAxisAngle(X, f.pitch));
      lg.upper.quaternion.copy(Qh.clone().invert().multiply(Qt));
      lg.lower.quaternion.copy(Qt.clone().invert().multiply(Qs));
      lg.foot.quaternion.copy(Qs.clone().invert().multiply(Qf));
      const toes = bone(`${side}Toes`);
      // 蹴り出しでつま先の関節を反らせる
      if (toes) toes.quaternion.copy(q().setFromAxisAngle(X, -Math.max(0, f.pitch) * 0.9));
    }

    // 背骨：腰と逆にひねって肩を正面に保つ
    const b = extra.breathe ?? 0;
    bone('spine')?.quaternion.copy(euler(0.02 * walk + b * 0.01, -twist * 0.55, 0));
    bone('chest')?.quaternion.copy(euler(0.01 * walk + b * 0.012, -twist * 0.45, 0));
    bone('upperChest')?.quaternion.copy(euler(0, 0, 0));

    // 腕：下ろして、反対の足と逆に振る
    const swingL = -0.95 * -fwdOf(fR) - 0.04; // 右足が前 → 左腕が前（- が前）
    const swingR = -0.95 * -fwdOf(fL) - 0.04;
    const down = 1.22;
    bone('leftShoulder')?.quaternion.copy(euler(0, 0, -0.06));
    bone('rightShoulder')?.quaternion.copy(euler(0, 0, 0.06));
    bone('leftUpperArm').quaternion.copy(euler(swingL * walk + 0.05, 0, -down, 'XYZ'));
    bone('rightUpperArm').quaternion.copy(euler(swingR * walk + 0.05, 0, down, 'XYZ'));
    bone('leftLowerArm').quaternion.copy(euler(0, -(0.22 + Math.max(0, -swingL) * 0.5 * walk), 0));
    bone('rightLowerArm').quaternion.copy(euler(0, 0.22 + Math.max(0, -swingR) * 0.5 * walk, 0));
    bone('leftHand')?.quaternion.copy(euler(0, 0, 0.12));
    bone('rightHand')?.quaternion.copy(euler(0, 0, -0.12));
    // 指：力を抜いて軽く曲げる（Tポーズの指は手のひらが下、指先が ±X）
    for (const [side, s] of [['left', 1], ['right', -1]]) {
      for (const [f, k] of [['Index', 0.9], ['Middle', 1], ['Ring', 1.1], ['Little', 1.2]]) {
        bone(`${side}${f}Proximal`)?.quaternion.copy(euler(0, 0, -s * 0.35 * k));
        bone(`${side}${f}Intermediate`)?.quaternion.copy(euler(0, 0, -s * 0.45 * k));
        bone(`${side}${f}Distal`)?.quaternion.copy(euler(0, 0, -s * 0.3 * k));
      }
      bone(`${side}ThumbMetacarpal`)?.quaternion.copy(euler(0, -s * 0.25, -s * 0.1));
      bone(`${side}ThumbProximal`)?.quaternion.copy(euler(0, -s * 0.2, 0));
    }

    // 首・頭：揺れを打ち消して前を見る。look があればそちらへ
    let headYaw = 0;
    let headPitch = -0.04 * walk;
    if (extra.look) {
      // 前のフレームの行列に頼らない（t の純関数のまま）：頭の位置は休みの姿勢から近似
      const headW = pelvis.clone().setY(pelvis.y + rest.head.y - rest.hips.y);
      const d = extra.look.clone().sub(headW);
      const local = d.applyQuaternion(yawQ(pose.yaw).invert());
      const w = extra.lookWeight ?? 1;
      headYaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.9, 0.9) * w;
      headPitch = THREE.MathUtils.lerp(headPitch, -Math.atan2(local.y, Math.hypot(local.x, local.z)), w);
    }
    bone('neck')?.quaternion.copy(euler(headPitch * 0.4, headYaw * 0.4, 0, 'YXZ'));
    bone('head')?.quaternion.copy(euler(headPitch * 0.6, headYaw * 0.6, extra.tilt ?? 0, 'YXZ'));
  }

  return { apply, footDims, legLen, rest };
}
