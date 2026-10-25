# 電気のけもの v2 を Blender で組み立てて、骨入りの glb に書き出す。
#   blender -b -P yohi/chara/blender/build_creature.py -- <out.glb> [preview_dir]
# ・体はひとつながりのソフビ：頭・首・胴・足・耳・しっぽを重ねて、ボクセルで1つの形に溶かし、角をならす
# ・光る所（胸のしま・耳の先・しっぽの先）は three.js 側で、骨を動かす前の形（bind pose）の座標から塗る
# ・目・ほっぺ・鼻は別の部品で、頭の骨にくっつける
# 座標：Blender は Z が上、正面は -Y。glb では Y が上、正面は +Z になる（three.js の今のけものと同じ向き）
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/creature.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def obj_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob

# ---------- 形の部品 ----------
def superellipsoid(name, center, radii, p=2.0, rot=None, seg=64):
    """丸みのある箱（p=2 で楕円体、大きいほど角ばる）"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0)
    for v in bm.verts:
        n = v.co.normalized()
        r = (abs(n.x) ** p + abs(n.y) ** p + abs(n.z) ** p) ** (-1.0 / p)
        v.co = Vector((n.x * r * radii[0], n.y * r * radii[1], n.z * r * radii[2]))
    if rot is not None:
        bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return obj_from_bm(name, bm)

def cylinder(name, a, b, r1, r2, seg=32):
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=(b - a).length)
    q = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    bmesh.ops.transform(bm, matrix=q.to_matrix().to_4x4(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    return obj_from_bm(name, bm)

def lathe(name, profile, base, axis_rot, flat=1.0, seg=40):
    """(半径, 高さ) の輪郭を回して作る（耳）"""
    bm = bmesh.new()
    rings = []
    for (r, h) in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg) * flat, h)) for k in range(seg)]
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    top = bm.verts.new((0, 0, profile[-1][1] + 0.004))
    for k in range(seg):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], top))
    bmesh.ops.transform(bm, matrix=axis_rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(base), verts=bm.verts)
    return obj_from_bm(name, bm)

def catmull(pts, n):
    """点の列を滑らかにつないだ n 点"""
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(n):
        u = i / (n - 1) * (len(pts) - 1)
        k = min(int(u), len(pts) - 2); t = u - k
        p0, p1, p2, p3 = P[k], P[k + 1], P[k + 2], P[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    return out

def tube(name, pts, radius_fn, seg=28):
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        tdir = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = tdir.cross(Vector((1, 0, 0))).normalized()
        up = side.cross(tdir).normalized()
        r = radius_fn(i / (n - 1))
        rings.append([bm.verts.new(p + (side * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for i in range(n - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.006)
    for k in range(seg):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], tip))
    return obj_from_bm(name, bm)

# ---------- 寸法（設定画に合わせる：頭が大きく、胴は短め、足は太く短い） ----------
HEAD_C, HEAD_R, HEAD_P = Vector((0, -0.07, 0.64)), (0.335, 0.275, 0.3), 2.3
BODY_C, BODY_R = Vector((0, 0.1, 0.27)), (0.2, 0.3, 0.165)
LEGS = [(-0.105, -0.1, 0.066), (0.105, -0.1, 0.066), (-0.115, 0.28, 0.07), (0.115, 0.28, 0.07)]
TAIL = [Vector(p) for p in [(0, 0.36, 0.33), (0.02, 0.46, 0.4), (0.06, 0.52, 0.53), (0.12, 0.51, 0.67), (0.19, 0.44, 0.78)]]
TAIL_PTS = catmull(TAIL, 48)
def tail_r(u):
    r = 0.052 + 0.034 * u
    return r * (max(0.0, 1 - (u - 0.8) / 0.2) ** 0.7 if u > 0.8 else 1)

parts = []
parts.append(superellipsoid('head', HEAD_C, HEAD_R, HEAD_P))
parts.append(superellipsoid('neck', (0, -0.02, 0.43), (0.14, 0.13, 0.12), 2.0))
parts.append(superellipsoid('body', BODY_C, BODY_R, 2.2, rot=Matrix.Rotation(-0.18, 4, 'X')))
for (x, y, r) in LEGS:
    parts.append(cylinder('leg', (x, y, 0.035), (x, y, 0.22), r * 1.06, r * 1.1))
    parts.append(superellipsoid('hip', (x * 0.92, y, 0.22), (r * 1.45, r * 1.7, 0.085), 2.0))   # 付け根のふくらみ（胴になめらかにつなぐ）
    parts.append(superellipsoid('paw', (x, y - 0.012, 0.045), (r * 1.32, r * 1.5, 0.05), 2.0))
EAR_PROFILE = [(0.125, 0.0), (0.118, 0.045), (0.096, 0.095), (0.066, 0.135), (0.036, 0.165), (0.014, 0.182), (0.0, 0.188)]
def head_top(x):
    rx, ry, rz = HEAD_R
    return HEAD_C.z + rz * max(0.0, 1 - abs(x / rx) ** HEAD_P) ** (1 / HEAD_P)
EARS = []
for side in (-1, 1):
    x = side * 0.19
    base = Vector((x, -0.03, head_top(x) - 0.045))
    rot = Matrix.Rotation(side * 0.3, 4, 'Y') @ Matrix.Rotation(-0.1, 4, 'X')
    parts.append(lathe('ear', EAR_PROFILE, base, rot, flat=0.6))
    EARS.append((side, base, rot))
parts.append(tube('tail', TAIL_PTS, tail_r))

# ---------- 溶かして1つの形に → ならす → 面の数を減らす ----------
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.active_object
body.name = 'creature_body'
m = body.modifiers.new('remesh', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = 0.0055; m.adaptivity = 0.0
bpy.ops.object.modifier_apply(modifier='remesh')
m = body.modifiers.new('smooth', 'CORRECTIVE_SMOOTH'); m.factor = 0.5; m.iterations = 24; m.smooth_type = 'SIMPLE'; m.use_only_smooth = True
bpy.ops.object.modifier_apply(modifier='smooth')
m = body.modifiers.new('dec', 'DECIMATE'); m.ratio = min(1.0, 18000 / max(1, len(body.data.polygons)))
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.shade_smooth()

def mat(name, color, emit=None, strength=0.0, rough=0.4):
    mt = bpy.data.materials.new(name)
    mt.use_nodes = True
    b = mt.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return mt
M_VINYL = mat('vinyl', (0.024, 0.012, 0.010), rough=0.35)
M_GLOW = mat('glow_eye', (0, 0, 0), (0.6, 1.0, 0.75), 3.0)
M_CHEEK = mat('glow_cheek', (0, 0, 0), (0.6, 1.0, 0.75), 2.5)
M_IRIS = mat('iris', (0.004, 0.003, 0.003), rough=0.15)
M_SHINE = mat('shine', (1, 1, 1), (1, 1, 1), 2.0)
body.data.materials.append(M_VINYL)

# ---------- 顔の部品：頭の表面に貼る ----------
def head_front(x, z):
    """頭の正面（-Y 側）の表面の点と法線"""
    rx, ry, rz = HEAD_R
    p = HEAD_P
    lx, lz = x / rx, (z - HEAD_C.z) / rz
    s = max(1e-4, 1 - abs(lx) ** p - abs(lz) ** p)
    ly = s ** (1 / p)
    pos = Vector((x, HEAD_C.y - ly * ry, z))
    # 法線：陰関数 |x/rx|^p + |y/ry|^p + |z/rz|^p の勾配
    g = Vector((p * abs(lx) ** (p - 1) * math.copysign(1, lx) / rx, -p * ly ** (p - 1) / ry, p * abs(lz) ** (p - 1) * math.copysign(1, lz) / rz))
    return pos, g.normalized()

def part(name, mesh_fn, pos, normal, scale, material, roll=0.0, sink=0.0):
    bm = bmesh.new()
    mesh_fn(bm)
    ob = obj_from_bm(name, bm)
    ob.data.materials.append(material)
    # 部品の +Z を表面の外向き（法線）に合わせる
    q = Vector((0, 0, 1)).rotation_difference(normal)
    ob.matrix_world = Matrix.Translation(pos + normal * sink) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Z') @ Matrix.Diagonal((*scale, 1))
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth()
    return ob

sphere = lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
face_parts = []
for side, tag in ((-1, 'L'), (1, 'R')):
    pos, n = head_front(side * 0.145, HEAD_C.z - 0.07)
    face_parts.append(part(f'eye_{tag}', sphere, pos, n, (0.095, 0.115, 0.026), M_GLOW, roll=-side * 0.12, sink=-0.018))
    ip, _ = head_front(side * 0.145 - side * 0.016, HEAD_C.z - 0.084)
    face_parts.append(part(f'iris_{tag}', sphere, ip, n, (0.062, 0.08, 0.02), M_IRIS, roll=-side * 0.12, sink=-0.002))
    sp, _ = head_front(side * 0.145 + side * 0.004, HEAD_C.z - 0.05)
    face_parts.append(part(f'shine_{tag}', sphere, sp, n, (0.017, 0.017, 0.008), M_SHINE, sink=0.016))
    cp, cn = head_front(side * 0.225, HEAD_C.z - 0.165)
    face_parts.append(part(f'cheek_{tag}', sphere, cp, cn, (0.038, 0.025, 0.008), M_CHEEK, sink=-0.002))
# 強気な目つき：白目・黒目・光の粒の上を、目頭が低い斜めの線で切り落とす
def cut_top(ob, co, normal):
    ob.data.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=normal, clear_outer=True)
    cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if cut: bmesh.ops.holes_fill(bm, edges=cut, sides=0)
    bm.to_mesh(ob.data); bm.free()
for side, tag in ((-1, 'L'), (1, 'R')):
    pos, _ = head_front(side * 0.145, HEAD_C.z - 0.07)
    co = pos + Vector((0, 0, 0.07))
    nrm = Vector((-side * 0.27, 0, 1)).normalized()
    for nm in (f'eye_{tag}', f'iris_{tag}', f'shine_{tag}'):
        cut_top(bpy.data.objects[nm], co, nrm)
# 顔の部品を頭の丸みに沿わせる（平らな円盤のふちが浮かないように、表面に貼りつける）
for ob in face_parts:
    off = {'eye': 0.0025, 'cheek': 0.003, 'iris': 0.0045, 'shine': 0.0065}[ob.name.split('_')[0]]
    w = ob.modifiers.new('wrap', 'SHRINKWRAP'); w.target = body; w.wrap_method = 'NEAREST_SURFACEPOINT'; w.wrap_mode = 'ON_SURFACE'; w.offset = off
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='wrap')
np_, nn = head_front(0.0, HEAD_C.z - 0.15)
face_parts.append(part('nose', sphere, np_, nn, (0.021, 0.015, 0.014), M_IRIS, sink=0.0))

# ---------- 骨 ----------
bpy.ops.object.select_all(action='DESELECT')
arm_data = bpy.data.armatures.new('rig')
arm = bpy.data.objects.new('creature_rig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, a, b, parent=None, connect=False):
    x = eb.new(name); x.head = Vector(a); x.tail = Vector(b)
    if parent: x.parent = eb[parent]; x.use_connect = connect
    return x
bone('root', (0, 0, 0), (0, 0, 0.1))
bone('body', (0, 0.3, 0.27), (0, -0.06, 0.33), 'root')
bone('head', (0, -0.04, 0.44), (0, -0.04, 0.9), 'body')
for side, base, rot in EARS:
    tag = 'L' if side < 0 else 'R'
    tip = base + (rot @ Vector((0, 0, 0.19, 1))).to_3d()
    bone(f'ear_{tag}', base, tip, 'head')
tp = TAIL_PTS
bone('tail_1', tp[0], tp[16], 'body')
bone('tail_2', tp[16], tp[32], 'tail_1', True)
bone('tail_3', tp[32], tp[47], 'tail_2', True)
for i, (x, y, r) in enumerate(LEGS):
    bone(f'leg_{i}', (x, y, 0.25), (x, y, 0.03), 'body')
bpy.ops.object.mode_set(mode='OBJECT')

# 体：自動の重み（熱の拡散）で骨に乗せる
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# 自動の重みは耳やしっぽの影響が顔まで広がる（耳を倒すと目のまわりの皮がずれる）。部位ごとに届く範囲を切る
ear_z = min(b.z for _, b, _ in EARS) - 0.025
limits = {
    'ear_L': lambda v: v.co.z > ear_z and v.co.x < -0.06, 'ear_R': lambda v: v.co.z > ear_z and v.co.x > 0.06,
    'tail_1': lambda v: v.co.y > 0.3, 'tail_2': lambda v: v.co.y > 0.36 and v.co.z > 0.42, 'tail_3': lambda v: v.co.y > 0.36 and v.co.z > 0.55,
}
for i in range(4): limits[f'leg_{i}'] = lambda v: v.co.z < 0.2
gid = {g.name: g.index for g in body.vertex_groups}
for name, ok in limits.items():
    g = body.vertex_groups[name]
    g.remove([v.index for v in body.data.vertices if not ok(v)])
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
# 顔の部品：頭の骨に直接くっつける（変形しない）
for ob in face_parts:
    mw = ob.matrix_world.copy()
    ob.parent = arm; ob.parent_type = 'BONE'; ob.parent_bone = 'head'
    ob.matrix_world = mw

print('POLYS', len(body.data.polygons), 'VERTS', len(body.data.vertices))
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_skins=True, export_animations=False, export_yup=True, export_apply=False, export_materials='EXPORT')
print('WROTE', OUT, os.path.getsize(OUT))

# ---------- 確認用：正面・横・後ろを撮る（Cycles CPU） ----------
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x = 640; scene.render.resolution_y = 640
    world = bpy.data.worlds.new('w'); world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.35, 0.36, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world
    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'AREA')); key.data.energy = 120; key.data.size = 2
    key.location = (1.5, -2.0, 2.5); key.rotation_euler = (math.radians(45), 0, math.radians(35))
    scene.collection.objects.link(key)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 60
    scene.collection.objects.link(cam); scene.camera = cam
    for nm, ang in (('front', 0), ('side', 90), ('back', 180)):
        a = math.radians(ang)
        cam.location = (2.6 * math.sin(a), -2.6 * math.cos(a), 0.62)
        cam.rotation_euler = (math.radians(90), 0, a)
        scene.render.filepath = os.path.join(PREVIEW, f'{nm}.png')
        bpy.ops.render.render(write_still=True)
    print('PREVIEW', PREVIEW)
