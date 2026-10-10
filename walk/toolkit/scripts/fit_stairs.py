#!/usr/bin/env python3
"""Fit a straight-on staircase to step edges traced on the picture.

A frontal staircase has no useful vanishing line, so (as in the video) trace the edge of every
step and search for the staircase whose edges line up best. The video traced 13 edges and the best
fit was off by ~5.5 px; it reported riser 0.136 m, tread 0.197 m, camera height 1.02 m, camera
pitch 1.13 deg DOWN.

Model (camera at (0, H, 0), looking along +z, pitch tilted down by `pitch`):
    edge i (i = 0..n-1) is the line at height i*riser, depth z0 + i*tread
Unknowns: riser, tread, z0 (distance to the first edge), pitch, camera height.  A frontal staircase
is only weakly constrained: fixing ONE value leaves the fit degenerate (condition number ~1e9, the
answer just follows the noise - verified in the self-test).  Fix TWO from real-world assumptions,
e.g. riser (measure / assume a typical stair) + camera height (your choice), then tread, z0 and
pitch are well determined (condition ~10).  The video does not say which two it fixed.

usage
  python fit_stairs.py --rows 960 905 ... (one image row per edge, bottom of picture first)
        --size 1920 1080 --focal-mm 35 --fix camera-height=1.02 --fix riser=0.136
  python fit_stairs.py --selftest
"""
from __future__ import annotations

import argparse
import math
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, __file__.rsplit("/", 1)[0] if "/" in __file__ else ".")
from camera import focal_px_from_hfov, hfov_from_focal_mm  # noqa: E402


def edge_rows(params, n, F, cy, H):
    """image rows of the n edges for the given staircase."""
    riser, tread, z0, pitch_down = params
    i = np.arange(n)
    y = i * riser - H          # height relative to camera
    z = z0 + i * tread         # depth along the ground
    th = math.radians(pitch_down)
    # camera looks down by th: forward = (0,-sin th, cos th), up = (0, cos th, sin th)
    zc = z * math.cos(th) - y * math.sin(th)
    yc = z * math.sin(th) + y * math.cos(th)
    return cy - F * yc / zc


def fit(rows, F, cy, fixed: dict, x0=None):
    rows = np.asarray(rows, float)
    n = len(rows)
    names = ["riser", "tread", "z0", "pitch_down", "camera_height"]
    free = [k for k in names if k not in fixed]
    if len(fixed) < 2:
        raise ValueError("fix at least TWO of riser / tread / camera_height / pitch_down (one is degenerate)")
    if len(rows) < len(free) + 3:
        raise ValueError("trace more edges")
    start = {"riser": 0.15, "tread": 0.25, "z0": 3.0, "pitch_down": 0.0, "camera_height": 1.2}
    if x0:
        start.update(x0)
    start.update(fixed)

    def unpack(x):
        d = dict(fixed)
        d.update(dict(zip(free, x)))
        return d

    def resid(x):
        d = unpack(x)
        return edge_rows((d["riser"], d["tread"], d["z0"], d["pitch_down"]), n, F, cy, d["camera_height"]) - rows

    best = None
    for z0 in (1.5, 3.0, 6.0, 10.0):                       # a few starts: depth is the weak direction
        s = dict(start); s["z0"] = z0
        sol = least_squares(resid, [s[k] for k in free],
                            bounds=([0.01 if k in ("riser", "tread") else -45 if k == "pitch_down" else 0.2 if k == "camera_height" else 0.3 for k in free],
                                    [0.6 if k in ("riser", "tread") else 45 if k == "pitch_down" else 20 if k == "camera_height" else 80 for k in free]))
        if best is None or sol.cost < best.cost:
            best = sol
    d = unpack(best.x)
    d["rms_px"] = float(math.sqrt(2 * best.cost / n))
    sv = np.linalg.svd(best.jac, compute_uv=False)
    d["condition"] = float(sv[0] / max(sv[-1], 1e-12))
    if d["condition"] > 1e4:
        print("WARNING: poorly determined (condition %.1e) - fix another value" % d["condition"], file=sys.stderr)
    return d


def _selftest():
    W, H_ = 1920, 1080
    F = focal_px_from_hfov(hfov_from_focal_mm(35), W)
    true = dict(riser=0.136, tread=0.197, z0=2.6, pitch_down=1.13, camera_height=1.02)
    rows = edge_rows((true["riser"], true["tread"], true["z0"], true["pitch_down"]), 13, F, H_ / 2, true["camera_height"])
    rng = np.random.default_rng(0)
    noisy = rows + rng.normal(0, 2.0, rows.shape)
    out = fit(noisy, F, H_ / 2, {"camera_height": 1.02, "riser": 0.136})
    print({k: round(float(v), 3) for k, v in out.items()})
    ok = abs(out["tread"] - 0.197) < 0.01 and abs(out["pitch_down"] - 1.13) < 0.3 and abs(out["z0"] - 2.6) < 0.1
    # one fixed value only -> must be flagged as degenerate (guard against silently trusting it)
    try:
        fit(noisy, F, H_ / 2, {"camera_height": 1.02})
        ok = False
    except ValueError:
        pass
    print("selftest", "OK" if ok else "FAIL")
    return 0 if ok else 1


def _main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rows", type=float, nargs="+")
    ap.add_argument("--size", type=float, nargs=2, metavar=("W", "H"))
    ap.add_argument("--focal-mm", type=float, default=35.0)
    ap.add_argument("--fix", action="append", default=[], help="riser=0.136 | tread=0.197 | camera-height=1.02 | pitch-down=1.13 (give two)")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        sys.exit(_selftest())
    if not (a.rows and a.size and a.fix):
        ap.error("--rows, --size and --fix are required")
    fixed = {k.replace("-", "_"): float(v) for k, v in (s.split("=") for s in a.fix)}
    F = focal_px_from_hfov(hfov_from_focal_mm(a.focal_mm), a.size[0])
    out = fit(a.rows, F, a.size[1] / 2, fixed)
    for k, v in out.items():
        print(f"{k:14s} {v:.3f}" if k != "condition" else f"{k:14s} {v:.1f}")


if __name__ == "__main__":
    _main()
