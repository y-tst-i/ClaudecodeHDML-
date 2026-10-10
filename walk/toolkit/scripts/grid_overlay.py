#!/usr/bin/env python3
"""Draw a 1 m floor grid (and optional 1.28 m person markers) on the picture to CHECK a camera.

If the camera is right: grid lines recede to the vanishing point, and a person marker stood further
away gets smaller by exactly 1/distance. This is the video's "draw a 1 m grid on the picture" step.

  python grid_overlay.py picture.png out.png --focal-mm 35 --pitch 3.32 --yaw 7.20 --height 0.70 \
        --person 0 4.1 --person 0 7.4
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from camera import Camera, focal_px_from_hfov, hfov_from_focal_mm  # noqa: E402


def draw(img, cam: Camera, extent=(-12, 12, 0.5, 30), persons=(), person_h=1.28):
    d = ImageDraw.Draw(img, "RGBA")
    x0, x1, z0, z1 = extent

    def seg(a, b, col, w=2):
        n = 60
        pts = np.linspace(a, b, n)
        px = cam.project(pts)
        for i in range(n - 1):
            p, q = px[i], px[i + 1]
            if np.isnan(p).any() or np.isnan(q).any():
                continue
            d.line([tuple(p), tuple(q)], fill=col, width=w)

    for x in range(int(x0), int(x1) + 1):
        seg(np.array([x, 0, z0]), np.array([x, 0, z1]), (255, 255, 255, 110), 1)
    for z in range(max(1, int(z0)), int(z1) + 1):
        seg(np.array([x0, 0, z]), np.array([x1, 0, z]), (255, 255, 255, 110), 1)
    for x, z in persons:
        foot, head = cam.project([[x, 0, z], [x, person_h, z]])
        if np.isnan(foot).any() or np.isnan(head).any():
            continue
        d.line([tuple(foot), tuple(head)], fill=(255, 200, 0, 255), width=4)
        d.text((foot[0] + 8, (foot[1] + head[1]) / 2), f"{abs(foot[1]-head[1]):.0f}px  z={z:g}m", fill=(255, 200, 0, 255))
    hv = cam.horizon_v()
    d.line([(0, hv), (img.width, hv)], fill=(255, 60, 30, 200), width=2)
    return img


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--focal-mm", type=float, default=35.0)
    ap.add_argument("--hfov", type=float, default=None, help="overrides --focal-mm")
    ap.add_argument("--pitch", type=float, default=0.0, help="deg, + = looking up")
    ap.add_argument("--yaw", type=float, default=0.0, help="deg, + = looking right")
    ap.add_argument("--height", type=float, default=1.5, help="camera height (m)")
    ap.add_argument("--person", type=float, nargs=2, action="append", default=[], metavar=("X", "Z"))
    a = ap.parse_args()
    im = Image.open(a.src).convert("RGB")
    hf = a.hfov if a.hfov else hfov_from_focal_mm(a.focal_mm)
    cam = Camera(focal_px_from_hfov(hf, im.width), im.width / 2, im.height / 2, a.yaw, a.pitch, a.height)
    draw(im, cam, persons=a.person).save(a.dst)
    print("saved", a.dst)
