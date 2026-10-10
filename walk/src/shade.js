import * as THREE from 'three';

// 絵の明るさで「日向か日陰か」を決める（toolkit/SKILL.md 1-E）。
// 体の各点から太陽の反対方向へたどって床に当たった所の、絵の明るさを読む。
// 1フラグメントずつやるので、頭だけ日向・足は日陰、のように木漏れ日の形がキャラに乗る。

export function createPictureShade(pic, texture, camera, sunDir) {
  const F = pic.width / 2 / Math.tan(THREE.MathUtils.degToRad(pic.cam.hfov) / 2);
  const uniforms = {
    picTex: { value: texture },
    picView: { value: camera.matrixWorldInverse },
    picK: { value: new THREE.Vector4(F, pic.cam.cx ?? pic.width / 2, pic.cam.cy ?? pic.height / 2, 0) },
    picSize: { value: new THREE.Vector2(pic.width, pic.height) },
    picSun: { value: sunDir.clone() },
    picThr: { value: new THREE.Vector2(pic.shade.shadeMax, pic.shade.sunMin) },
    // 日陰の色 ÷ 日向の色（sRGB で測った比 → 線形へ）
    picTint: { value: new THREE.Vector3(...pic.shade.tint.map((c) => Math.pow(c, 2.2))) },
    picShadeAmt: { value: 1 },
    // w=1 のとき、フラグメントの位置でなくこの1点（頭の中心）で日向/日陰を決める
    picPoint: { value: new THREE.Vector4(0, 0, 0, 0) },
  };

  const pars = /* glsl */ `
    uniform sampler2D picTex;
    uniform mat4 picView;
    uniform vec4 picK;
    uniform vec2 picSize;
    uniform vec3 picSun;
    uniform vec2 picThr;
    uniform vec3 picTint;
    uniform float picShadeAmt;
    uniform vec4 picPoint;
    varying vec3 vPicWorld;
    float picLuma(vec2 uv) {
      vec3 c = texture2D(picTex, uv).rgb;
      c = pow(max(c, 0.0), vec3(1.0 / 2.2)); // しきい値は sRGB の値で測っている
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }
    // 0 = 日向, 1 = 日陰
    float picShade(vec3 p) {
      vec3 q = p - picSun * (p.y / max(picSun.y, 1e-3)); // 太陽の反対方向へ床まで
      vec4 c = picView * vec4(q, 1.0);
      if (c.z > -0.05) return 0.0;
      vec2 px = vec2(picK.y + picK.x * c.x / -c.z, picK.z - picK.x * c.y / -c.z);
      vec2 uv = vec2(px.x / picSize.x, 1.0 - px.y / picSize.y);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
      // 細かい木漏れ日がキャラの顔で斑点にならないよう、広めにぼかして読む（9点）
      vec2 o = 5.0 / picSize;
      float l = picLuma(uv) * 0.2;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        l += picLuma(uv + o * vec2(cos(a), sin(a))) * 0.1;
      }
      return 1.0 - smoothstep(picThr.x, picThr.y, l);
    }
  `;

  function patch(material, fragInject, extraUniforms = {}) {
    if (material.userData.picPatched) return; // 同じ材質を複数のメッシュが使い回していることがある
    material.userData.picPatched = true;
    const prev = material.onBeforeCompile; // MToon は自前の onBeforeCompile で define を入れる
    material.onBeforeCompile = (shader, r) => {
      prev?.call(material, shader, r);
      Object.assign(shader.uniforms, uniforms, extraUniforms);
      shader.vertexShader = 'varying vec3 vPicWorld;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n vPicWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
      // 先頭に足す（MToon は main より前の関数でトーンマップする）
      shader.fragmentShader = pars + shader.fragmentShader.replace('#include <tonemapping_fragment>', fragInject + '\n#include <tonemapping_fragment>');
    };
    const prevKey = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => (prevKey?.() ?? '') + '|pic-shade-' + fragInject.length;
    material.needsUpdate = true;
  }

  // キャラ：日陰の所だけ、絵の影の色へ寄せる。
  // 顔は木漏れ日の斑点がマスクに見えるので、頭の中心1点で一様に明暗させる（アニメの作法）
  const headPoint = { value: new THREE.Vector4(0, 0, 0, 1) };
  const patchChara = (m, { face = false } = {}) =>
    patch(
      m,
      `gl_FragColor.rgb *= mix(vec3(1.0), picTint, picShade(mix(vPicWorld, picPoint.xyz, picPoint.w)) * picShadeAmt);`,
      face ? { picPoint: headPoint, picShadeAmt: { value: 0.8 } } : {},
    );
  const setHead = (p) => headPoint.value.set(p.x, p.y, p.z, 1);

  // 見えない床：キャラの影を、絵の日向の所にだけ落とす（日陰はもう暗いので二重にしない）。
  // 乗算で「絵が影の形に暗くなる」
  function createShadowFloor(size = 60) {
    const tint = pic.shade.tint;
    const mat = new THREE.ShadowMaterial({ color: new THREE.Color().setRGB(...tint, THREE.SRGBColorSpace), opacity: 1 });
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.DstColorFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.premultipliedAlpha = true;
    mat.depthWrite = false;
    patch(mat, `gl_FragColor.a *= 1.0 - picShade(vPicWorld);`);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  return { uniforms, patchChara, setHead, createShadowFloor };
}
