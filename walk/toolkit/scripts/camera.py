#!/usr/bin/env python3
"""Camera estimation from a single picture (vanishing points) + ground-plane helpers.

World frame : x = right, y = up, z = forward (the direction the walkway / road runs).
Camera      : sits at (0, H, 0); yaw = rotation to the RIGHT, pitch = tilt UP (negative = down).
Image       : pixel (u, v), v grows downward; (cx, cy) is the principal point (image centre of the
              ORIGINAL picture - not of a cropped preview).

Everything is plain numpy so it runs anywhere.

CLI examples
  python camera.py hfov --focal-mm 35
  python camera.py vp1  --vp 562.7 648 --size 1920 1080 --focal-mm 35
  python camera.py vp2  --vp1 28 183 --vp2 572 183 --size 202 113
  python camera.py height --horizon-v 700 --ref-bottom-v 900 --ref-top-v 820 --ref-height 0.35
"""
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass

import numpy as np

SENSOR_W_MM = 36.0  # full-frame width: 35 mm lens -> 54.4 deg horizontal FOV (matches the video)


# --------------------------------------------------------------------------- lens helpers
def hfov_from_focal_mm(focal_mm: float, sensor_w_mm: float = SENSOR_W_MM) -> float:
    return math.degrees(2 * math.atan(sensor_w_mm / (2 * focal_mm)))


def focal_px_from_hfov(hfov_deg: float, width_px: float) -> float:
    return (width_px / 2) / math.tan(math.radians(hfov_deg) / 2)


def hfov_from_focal_px(focal_px: float, width_px: float) -> float:
    return math.degrees(2 * math.atan((width_px / 2) / focal_px))


# --------------------------------------------------------------------------- camera model
@dataclass
class Camera:
    focal_px: float
    cx: float
    cy: float
    yaw_deg: float = 0.0       # + = looking to the right of the world +z axis
    pitch_deg: float = 0.0     # + = looking up
    height_m: float = 1.0      # camera height above the ground plane (y = 0)

    # basis vectors in world coordinates
    def basis(self):
        ps, th = math.radians(self.yaw_deg), math.radians(self.pitch_deg)
        f = np.array([math.sin(ps) * math.cos(th), math.sin(th), math.cos(ps) * math.cos(th)])
        r = np.array([math.cos(ps), 0.0, -math.sin(ps)])
        u = np.cross(f, r)
        return f, r, u

    def project(self, pts_world, clip_depth: float = 1e-3):
        """world points (N,3) -> pixels (N,2). Points behind the camera give NaN."""
        pts = np.atleast_2d(np.asarray(pts_world, float)).copy()
        pts[:, 1] -= self.height_m
        f, r, u = self.basis()
        zc, xc, yc = pts @ f, pts @ r, pts @ u
        with np.errstate(divide="ignore", invalid="ignore"):
            px = self.cx + self.focal_px * xc / zc
            py = self.cy - self.focal_px * yc / zc
        bad = zc < clip_depth
        px[bad] = np.nan
        py[bad] = np.nan
        return np.stack([px, py], axis=1)

    def depth(self, pts_world):
        pts = np.atleast_2d(np.asarray(pts_world, float)).copy()
        pts[:, 1] -= self.height_m
        return pts @ self.basis()[0]

    def ray(self, u, v):
        """unit world-space direction of the ray through pixel (u, v)."""
        f, r, up = self.basis()
        d = f + (u - self.cx) / self.focal_px * r - (v - self.cy) / self.focal_px * up
        return d / np.linalg.norm(d)

    def ground_from_pixel(self, u, v, ground_y: float = 0.0):
        """Intersect pixel ray with the horizontal plane y = ground_y -> world (x, y, z) or None."""
        d = self.ray(u, v)
        if d[1] >= -1e-9:
            return None  # at / above the horizon
        t = (ground_y - self.height_m) / d[1]
        return np.array([0.0, self.height_m, 0.0]) + t * d

    def horizon_v(self):
        """image row of the horizon line (= 'eye height' line)."""
        return self.cy + self.focal_px * math.tan(math.radians(self.pitch_deg))

    def vp_of_direction(self, d_world):
        f, r, u = self.basis()
        d = np.asarray(d_world, float)
        z = d @ f
        return (self.cx + self.focal_px * (d @ r) / z, self.cy - self.focal_px * (d @ u) / z)

    def person_px_height(self, ground_xz, height_m=1.28):
        """expected pixel height of an upright person standing at ground (x, z)."""
        foot = np.array([[ground_xz[0], 0.0, ground_xz[1]]])
        head = np.array([[ground_xz[0], height_m, ground_xz[1]]])
        return float(abs(self.project(head)[0, 1] - self.project(foot)[0, 1]))


# --------------------------------------------------------------------------- solving from vanishing points
def pitch_yaw_from_vp(vp, focal_px, cx, cy):
    """VP of the world +z direction -> (pitch_up_deg, yaw_right_deg), zero roll.

    tan(pitch) = (v - cy) / F            (VP below the centre => camera looks UP)
    tan(yaw)   = -(u - cx) * cos(pitch) / F   (VP left of the centre => camera turned RIGHT)
    """
    u, v = vp
    pitch = math.atan((v - cy) / focal_px)
    yaw = math.atan(-(u - cx) * math.cos(pitch) / focal_px)
    return math.degrees(pitch), math.degrees(yaw)


def solve_one_vp(vp, size_wh, focal_mm=35.0, hfov_deg=None):
    """One vanishing point + an ASSUMED lens (the lens cannot be read from one VP)."""
    w, h = size_wh
    hf = hfov_deg if hfov_deg is not None else hfov_from_focal_mm(focal_mm)
    F = focal_px_from_hfov(hf, w)
    pitch, yaw = pitch_yaw_from_vp(vp, F, w / 2, h / 2)
    return Camera(F, w / 2, h / 2, yaw, pitch)


def solve_two_vp(vp1, vp2, size_wh, principal=None):
    """Two VPs of orthogonal horizontal directions -> focal length AND orientation.

    F^2 = -((u1-cx)(u2-cx) + (v1-cy)(v2-cy)).  vp1 is treated as the world +z axis.
    Roll is estimated from the slope of the horizon through both VPs and removed first.
    """
    w, h = size_wh
    cx, cy = principal if principal else (w / 2, h / 2)
    p1, p2 = np.array(vp1, float), np.array(vp2, float)
    roll = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    c, s = math.cos(-roll), math.sin(-roll)

    def derot(p):
        x, y = p[0] - cx, p[1] - cy
        return np.array([cx + c * x - s * y, cy + s * x + c * y])

    q1, q2 = derot(p1), derot(p2)
    f2 = -((q1[0] - cx) * (q2[0] - cx) + (q1[1] - cy) * (q2[1] - cy))
    if f2 <= 0:
        raise ValueError("VPs are not compatible with orthogonal directions (F^2 <= 0): re-trace the lines")
    F = math.sqrt(f2)
    pitch, yaw = pitch_yaw_from_vp(q1, F, cx, cy)
    cam = Camera(F, cx, cy, yaw, pitch)
    cam.roll_deg = math.degrees(roll)  # informational
    return cam


def camera_height_from_reference(cam: Camera, v_bottom, v_top, ref_height_m, u=None):
    """Camera height H from one upright object of known height standing on the ground.

    Exact for any pitch: bisect on H until the projected top of the object lands on v_top.
    (u defaults to the image centre column; only matters when yaw/pitch are large.)
    """
    u = cam.cx if u is None else u

    def top_row(H):
        c = Camera(cam.focal_px, cam.cx, cam.cy, cam.yaw_deg, cam.pitch_deg, H)
        g = c.ground_from_pixel(u, v_bottom)
        if g is None:
            return None
        p = np.array([[g[0], ref_height_m, g[2]]])
        return c.project(p)[0, 1]

    lo, hi = max(ref_height_m * 0.05, 0.05), 50.0
    f_lo, f_hi = top_row(lo), top_row(hi)
    if f_lo is None or f_hi is None:
        raise ValueError("bottom pixel is above the horizon")
    # top_row decreases (moves up) relative to v_top as H grows? just bisect on sign change
    s_lo = f_lo - v_top
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        fm = top_row(mid)
        if fm is None:
            hi = mid
            continue
        if (fm - v_top) * s_lo > 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# --------------------------------------------------------------------------- light / shade
def shade_class(brightness: float, shade_max: float = 0.10, sun_min: float = 0.22) -> str:
    """Classify the brightness (0..1) of the picture at the floor spot.

    Thresholds are READ OFF THE VIDEO'S METER GRAPHIC (bar spans ~0..0.6; dark ~0-0.10,
    olive ~0.10-0.22, yellow >0.22). Observed: 0.02 / 0.03 -> shade, 0.29 -> sun. Tune per picture.
    """
    if brightness <= shade_max:
        return "shade"
    if brightness >= sun_min:
        return "sun"
    return "penumbra"


def shade_factor(brightness: float, shade_max: float = 0.10, sun_min: float = 0.22) -> float:
    """0 = fully lit by the sun (no darkening), 1 = fully in shade (darken to the picture's shadow)."""
    t = (brightness - shade_max) / (sun_min - shade_max)
    t = min(max(t, 0.0), 1.0)
    return 1.0 - t * t * (3 - 2 * t)


# --------------------------------------------------------------------------- CLI
def _main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("hfov"); a.add_argument("--focal-mm", type=float, default=35.0)

    a = sub.add_parser("vp1")
    a.add_argument("--vp", type=float, nargs=2, required=True, metavar=("U", "V"))
    a.add_argument("--size", type=float, nargs=2, required=True, metavar=("W", "H"))
    a.add_argument("--focal-mm", type=float, default=35.0)
    a.add_argument("--camera-height", type=float, default=None)

    a = sub.add_parser("vp2")
    a.add_argument("--vp1", type=float, nargs=2, required=True)
    a.add_argument("--vp2", type=float, nargs=2, required=True)
    a.add_argument("--size", type=float, nargs=2, required=True)

    a = sub.add_parser("height")
    a.add_argument("--vp", type=float, nargs=2, required=True, help="VP of the ground direction")
    a.add_argument("--size", type=float, nargs=2, required=True)
    a.add_argument("--focal-mm", type=float, default=35.0)
    a.add_argument("--ref-bottom-v", type=float, required=True)
    a.add_argument("--ref-top-v", type=float, required=True)
    a.add_argument("--ref-height", type=float, required=True)

    args = ap.parse_args()
    if args.cmd == "hfov":
        print(f"{args.focal_mm:g} mm on a 36 mm-wide sensor -> horizontal FOV {hfov_from_focal_mm(args.focal_mm):.2f} deg")
    elif args.cmd == "vp1":
        cam = solve_one_vp(args.vp, args.size, args.focal_mm)
        print(f"hfov {hfov_from_focal_px(cam.focal_px, args.size[0]):.2f} deg  focal {cam.focal_px:.1f} px\n"
              f"pitch {cam.pitch_deg:+.2f} deg (+up)  yaw {cam.yaw_deg:+.2f} deg (+right)")
    elif args.cmd == "vp2":
        cam = solve_two_vp(args.vp1, args.vp2, args.size)
        print(f"hfov {hfov_from_focal_px(cam.focal_px, args.size[0]):.2f} deg  focal {cam.focal_px:.1f} px\n"
              f"pitch {cam.pitch_deg:+.2f} deg (+up; negative = looking down)  yaw {cam.yaw_deg:+.2f} deg  "
              f"roll {cam.roll_deg:+.2f} deg")
    elif args.cmd == "height":
        cam = solve_one_vp(args.vp, args.size, args.focal_mm)
        H = camera_height_from_reference(cam, args.ref_bottom_v, args.ref_top_v, args.ref_height)
        print(f"camera height {H:.3f} m  (pitch {cam.pitch_deg:+.2f}, yaw {cam.yaw_deg:+.2f})")


if __name__ == "__main__":
    _main()
