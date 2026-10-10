#!/usr/bin/env python3
"""Foot corrections for a generated walk: toe-walk fix and snapping footfalls onto picture stairs.

Both corrections use the SAME machinery (this is exactly how the video describes them):
    1. decide where each planted foot should be  -> per-frame ankle (and toe) delta for each leg
    2. move the pelvis by the AVERAGE of the two legs' deltas   ("腰は、両足が動いたぶんの平均")
    3. re-solve each knee with two-bone IK so the thigh / shin lengths stay constant ("ひざは曲げ直す")

Works on world-space joint POSITIONS, shape [T, J, 3], y up - e.g. ARDY's `posed_joints` in its .npz.
It does not touch joint rotations: apply the resulting ankle/toe/knee targets in your retargeting
step (or IK the VRM legs to them) if you need rotations.

Joint indices are supplied by you in a JSON map (ARDY's skeleton layout differs per model):
    {"left":  {"hip": 2, "knee": 3, "ankle": 4, "toe": 5},
     "right": {"hip": 6, "knee": 7, "ankle": 8, "toe": 9}}

Commands
  foot_correct.py inspect in.npz
  foot_correct.py flatten in.npz out.npz --joints map.json [--ref-frame 0] [--fade-from 11 --fade-dur 1]
  foot_correct.py stairs  in.npz out.npz --joints map.json --axis 0 0 1 --riser 0.136 --tread 0.197 \
                          --start-index 10 --direction -1 [--ardy-riser 0.095 --ardy-tread 0.1216]
  foot_correct.py selftest
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass

import numpy as np


# =========================================================================== data model
@dataclass
class Leg:
    hip: int
    knee: int
    ankle: int
    toe: int
    extra: tuple = ()      # other foot joints that should follow the ankle rigidly (heel, toe-end ...)


def legs_from_json(path):
    d = json.load(open(path))
    mk = lambda x: Leg(x["hip"], x["knee"], x["ankle"], x["toe"], tuple(x.get("extra", ())))
    return [mk(d["left"]), mk(d["right"])]


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


# =========================================================================== contacts
def _runs(mask):
    """list of (start, end_exclusive) for True runs."""
    m = np.asarray(mask, bool)
    d = np.diff(np.concatenate([[0], m.view(np.int8), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def detect_contacts(J, leg: Leg, fps, toe_floor=None, height_tol=0.03, speed_tol=0.6, min_len=3):
    """bool mask (T,): the toe (ball of the foot) is at floor height and nearly still."""
    toe = J[:, leg.toe]
    floor = np.percentile(toe[:, 1], 5) if toe_floor is None else toe_floor
    v = np.zeros(len(toe))
    v[1:-1] = np.linalg.norm(toe[2:, [0, 2]] - toe[:-2, [0, 2]], axis=1) * fps / 2
    v[0], v[-1] = v[1], v[-2]
    low = toe[:, 1] < (floor + height_tol)
    m = low & (v < speed_tol)
    for a, b in _runs(m):
        if b - a < min_len:
            m[a:b] = False
    return m


def contact_weight(mask, ramp=3):
    """0..1 weight: 1 in the middle of a contact, easing to 0 over `ramp` frames at both ends."""
    w = np.zeros(len(mask))
    for a, b in _runs(mask):
        n = b - a
        r = min(ramp, n // 2)
        seg = np.ones(n)
        if r > 0:
            e = smoothstep((np.arange(r) + 1) / (r + 1))
            seg[:r] = e
            seg[-r:] = e[::-1]
        w[a:b] = seg
    return w


def fade_out(w, fps, start_s, dur_s):
    """switch the correction off for the rest of the clip (the video: stop the fix 1 s before sitting)."""
    t = np.arange(len(w)) / fps
    return w * (1.0 - smoothstep((t - start_s) / max(dur_s, 1e-6)))


# =========================================================================== two-bone IK
def two_bone_knee(hip, ankle, l1, l2, pole):
    """knee position for given hip / ankle, thigh l1, shin l2, bending toward `pole`.
    returns (knee, stretch) where stretch>0 means the ankle is out of reach by that many metres."""
    d = ankle - hip
    D = np.linalg.norm(d)
    dn = d / max(D, 1e-9)
    Dc = min(max(D, abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6)
    stretch = max(D - (l1 + l2 - 1e-6), 0.0)
    a = (l1 * l1 - l2 * l2 + Dc * Dc) / (2 * Dc)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    p = pole - (pole @ dn) * dn
    n = np.linalg.norm(p)
    p = p / n if n > 1e-9 else np.array([0.0, 0.0, 1.0]) - dn * dn[2]
    return hip + a * dn + h * p, stretch


def apply_leg_edits(J, legs, new_ankle, new_toe):
    """Move both ankles/toes to the given targets, pelvis by the mean ankle delta, re-bend knees.

    new_ankle / new_toe: lists (one per leg) of arrays (T,3).  Returns (J_out, info).
    """
    J = np.asarray(J, float)
    T = len(J)
    d_leg = [new_ankle[i] - J[:, L.ankle] for i, L in enumerate(legs)]
    pel = np.mean(d_leg, axis=0)                                       # (T,3) mean of both feet
    chain = {j for L in legs for j in (L.knee, L.ankle, L.toe, *L.extra)}
    out = J.copy()
    for j in range(J.shape[1]):
        if j not in chain:
            out[:, j] += pel                                           # hips, spine, head ... follow pelvis
    max_stretch = 0.0
    for i, L in enumerate(legs):
        l1 = float(np.median(np.linalg.norm(J[:, L.hip] - J[:, L.knee], axis=1)))
        l2 = float(np.median(np.linalg.norm(J[:, L.knee] - J[:, L.ankle], axis=1)))
        out[:, L.ankle] = new_ankle[i]
        out[:, L.toe] = new_toe[i]
        for j in L.extra:
            out[:, j] = J[:, j] + d_leg[i]
        for t in range(T):
            if np.abs(pel[t]).max() < 1e-9 and np.abs(d_leg[i][t]).max() < 1e-9:
                continue                                               # untouched frame: keep original knee
            hip0, ank0, kn0 = J[t, L.hip], J[t, L.ankle], J[t, L.knee]
            dn0 = (ank0 - hip0) / max(np.linalg.norm(ank0 - hip0), 1e-9)
            pole = (kn0 - hip0) - ((kn0 - hip0) @ dn0) * dn0
            if np.linalg.norm(pole) < 1e-4:                            # straight leg: bend toward the foot's forward
                f = J[t, L.toe] - J[t, L.ankle]
                pole = np.array([f[0], 0.0, f[2]])
            pole = pole / max(np.linalg.norm(pole), 1e-9)
            knee, s = two_bone_knee(out[t, L.hip], out[t, L.ankle], l1, l2, pole)
            out[t, L.knee] = knee
            max_stretch = max(max_stretch, s)
    return out, {"pelvis_delta": pel, "leg_delta": d_leg, "max_leg_stretch_m": max_stretch}


# =========================================================================== 1) toe-walk fix
def foot_pitch_deg(J, leg: Leg):
    """toe-down angle of the ankle->toe vector (deg). Flat sole on the floor == the skeleton's rest pitch."""
    v = J[:, leg.toe] - J[:, leg.ankle]
    return np.degrees(np.arctan2(-v[:, 1], np.linalg.norm(v[:, [0, 2]], axis=1)))


def rest_from_reference(J, legs, ref_frame=0):
    """rest pitch (deg) and toe floor height measured on a frame where the character stands flat."""
    p = np.mean([foot_pitch_deg(J, L)[ref_frame] for L in legs])
    h = np.mean([J[ref_frame, L.toe, 1] for L in legs])
    return float(p), float(h)


def flatten_edits(J, legs, weights, rest_pitch_deg, toe_floor, keep_toe_planted=True):
    """Per leg: rotate the foot back to rest pitch, put the planted toe on the floor, lower the ankle.

    toe_floor may be a float or a per-frame array (use the tread height when on stairs)."""
    new_a, new_t = [], []
    toe_floor = np.broadcast_to(np.asarray(toe_floor, float), (len(J),))
    for L, w in zip(legs, weights):
        ank, toe = J[:, L.ankle], J[:, L.toe]
        v = toe - ank
        hn = np.linalg.norm(v[:, [0, 2]], axis=1)
        ln = np.linalg.norm(v, axis=1)
        pitch = np.arctan2(-v[:, 1], hn)
        p_new = pitch + w * (math.radians(rest_pitch_deg) - pitch)
        hdir = v[:, [0, 2]] / np.maximum(hn, 1e-9)[:, None]
        v_new = np.stack([hdir[:, 0] * ln * np.cos(p_new), -ln * np.sin(p_new), hdir[:, 1] * ln * np.cos(p_new)], 1)
        toe_new = toe.copy()
        toe_new[:, 1] = toe[:, 1] + w * (toe_floor - toe[:, 1])
        if not keep_toe_planted:                          # rotate about the ankle instead (xz of toe moves)
            toe_new[:, [0, 2]] = ank[:, [0, 2]] + v_new[:, [0, 2]]
        new_t.append(toe_new)
        new_a.append(toe_new - v_new)
    return new_a, new_t


def flatten_feet(J, legs, fps, rest_pitch_deg=None, toe_floor=None, ref_frame=0, fade_from_s=None, fade_dur_s=1.0,
                 ramp=3, contacts=None):
    """full toe-walk correction. Returns (J_out, info)."""
    J = np.asarray(J, float)
    rp, tf = rest_from_reference(J, legs, ref_frame)
    rest_pitch_deg = rp if rest_pitch_deg is None else rest_pitch_deg
    toe_floor = tf if toe_floor is None else toe_floor
    masks = contacts if contacts is not None else [detect_contacts(J, L, fps, toe_floor) for L in legs]
    ws = [contact_weight(m, ramp) for m in masks]
    if fade_from_s is not None:
        ws = [fade_out(w, fps, fade_from_s, fade_dur_s) for w in ws]
    new_a, new_t = flatten_edits(J, legs, ws, rest_pitch_deg, toe_floor)
    out, info = apply_leg_edits(J, legs, new_a, new_t)
    info.update(rest_pitch_deg=rest_pitch_deg, toe_floor=float(np.mean(toe_floor)), masks=masks, weights=ws)
    info["report"] = pitch_report(J, out, legs, masks, rest_pitch_deg, ws)
    return out, info


def pitch_report(J0, J1, legs, masks, rest, weights=None):
    """toe-down error before/after on the 'core' of each contact (weight ~1; the first/last frames are
    deliberately only partly corrected so the fix fades in and out without a pop)."""
    rep = {}
    for k, (name, L, m) in enumerate(zip(("left", "right"), legs, masks)):
        if weights is not None:
            m = weights[k] > 0.999
        if not m.any():
            continue
        b = foot_pitch_deg(J0, L)[m] - rest
        a = foot_pitch_deg(J1, L)[m] - rest
        rep[name] = dict(contact_frames=int(m.sum()), toe_down_before_deg=(float(b.min()), float(b.max())),
                         toe_down_after_deg=(float(a.min()), float(a.max())),
                         ankle_lowered_max_cm=float(100 * (J0[m, L.ankle, 1] - J1[m, L.ankle, 1]).max()))
    return rep


# =========================================================================== 2) stairs
def scale_root_trajectory(J, root, axis_xz, k_forward, k_up, anchor_frame=0):
    """Stretch the root's travel along `axis_xz` by k_forward and its height change by k_up (the video's
    '高さを1.43倍 / 奥行きを1.62倍'), moving the whole body rigidly with the root (limb lengths unchanged)."""
    J = np.asarray(J, float).copy()
    a = np.array([axis_xz[0], 0.0, axis_xz[1]]); a /= np.linalg.norm(a)
    r0 = J[anchor_frame, root].copy()
    rel = J[:, root] - r0
    along = rel @ a
    new = r0 + np.outer(along * k_forward, a) + (rel - np.outer(along, a))
    new[:, 1] = r0[1] + rel[:, 1] * k_up
    return J + (new - J[:, root])[:, None, :]


def stair_deltas(J, legs, masks, axis_xz, riser, tread, start_index, direction=-1, anchor="first",
                 s_ref=None, y_ref=None):
    """Snap every footfall (in time order, both feet) onto successive steps of the picture's stairs.

    direction -1: descending, the step index drops by 1 per footfall (10 -> 9 -> 8 ... -> 0 in the video).
    Step i has its tread top at height y_ref + (i - start_index) * riser and its centre at distance
    s_ref + (i - start_index) * tread * direction along the travel axis (s increases in the walking direction).
    anchor='first': the first footfall keeps where ARDY put it (s_ref, y_ref default to that). Pass s_ref/y_ref
    to pin the staircase to the picture instead.   Lateral (sideways) position is never changed.
    Returns per-leg ankle/toe targets (T,3) and the list of snapped contacts.
    """
    a = np.array([axis_xz[0], 0.0, axis_xz[1]]); a /= np.linalg.norm(a)
    segs = []
    for li, (L, m) in enumerate(zip(legs, masks)):
        for s, e in _runs(m):
            mid = (s + e - 1) // 2
            segs.append(dict(leg=li, start=s, end=e, mid=mid, toe=J[mid, L.toe].copy()))
    segs.sort(key=lambda d: d["mid"])
    if not segs:
        raise ValueError("no footfalls detected")
    if anchor == "first":
        s_ref = segs[0]["toe"] @ a if s_ref is None else s_ref
        y_ref = segs[0]["toe"][1] if y_ref is None else y_ref
    elif s_ref is None or y_ref is None:
        raise ValueError("anchor='picture' needs s_ref and y_ref")
    for k, sg in enumerate(segs):
        idx = start_index + direction * k
        sg["index"] = idx
        s_t = s_ref + (idx - start_index) * tread * direction
        y_t = y_ref + (idx - start_index) * riser
        toe = sg["toe"]
        tgt = toe + a * (s_t - toe @ a)          # move only along the travel axis ...
        tgt[1] = y_t                             # ... and set the height
        sg["target"] = tgt
        sg["delta"] = tgt - toe
    T = len(J)
    per_leg = []
    for li, L in enumerate(legs):
        mine = [sg for sg in segs if sg["leg"] == li]
        d = np.zeros((T, 3))
        if mine:
            t = np.arange(T)
            d[:] = mine[0]["delta"]
            for p, q in zip(mine[:-1], mine[1:]):
                hold_end, hold_start = p["end"] - 1, q["start"]
                gap = (t > hold_end) & (t < hold_start)
                if gap.any():
                    u = smoothstep((t[gap] - hold_end) / (hold_start - hold_end))[:, None]
                    d[gap] = (1 - u) * p["delta"] + u * q["delta"]
                d[t >= hold_start] = q["delta"]
        per_leg.append(d)
    return per_leg, segs


def snap_to_stairs(J, legs, fps, axis_xz, riser, tread, start_index, direction=-1, flat=True, rest_pitch_deg=None,
                   ref_frame=0, ramp=3, **kw):
    """stairs pipeline: snap footfalls onto steps, then (optionally) flatten the feet on the treads."""
    J = np.asarray(J, float)
    rp, tf = rest_from_reference(J, legs, ref_frame)
    masks = [detect_contacts(J, L, fps, tf) for L in legs]
    d_leg, segs = stair_deltas(J, legs, masks, axis_xz, riser, tread, start_index, direction, **kw)
    new_a = [J[:, L.ankle] + d for L, d in zip(legs, d_leg)]
    new_t = [J[:, L.toe] + d for L, d in zip(legs, d_leg)]
    J1, info = apply_leg_edits(J, legs, new_a, new_t)
    info["footfalls"] = [dict(leg=s["leg"], frame=int(s["mid"]), step_index=int(s["index"]),
                              target=s["target"].tolist(), moved_cm=float(100 * np.linalg.norm(s["delta"]))) for s in segs]
    if flat:
        # floor height per frame = height of the step the foot is standing on (hold the neighbouring contact)
        floors = []
        for li in range(len(legs)):
            mine = [s for s in segs if s["leg"] == li]
            fl = np.full(len(J), mine[0]["target"][1])
            for s in mine:
                fl[s["start"]:] = s["target"][1]
            floors.append(fl)
        ws = [contact_weight(m, ramp) for m in masks]
        new_a, new_t = [], []
        for L, w, fl in zip(legs, ws, floors):
            a, t = flatten_edits(J1, [L], [w], rp if rest_pitch_deg is None else rest_pitch_deg, fl)
            new_a.append(a[0]); new_t.append(t[0])
        J2, info2 = apply_leg_edits(J1, legs, new_a, new_t)
        info["flatten"] = pitch_report(J1, J2, legs, masks, rp if rest_pitch_deg is None else rest_pitch_deg, ws)
        info["max_leg_stretch_m"] = max(info["max_leg_stretch_m"], info2["max_leg_stretch_m"])
        return J2, info
    return J1, info


# =========================================================================== CLI plumbing
def _load(path):
    z = np.load(path, allow_pickle=True)
    return {k: z[k] for k in z.files}


def _inspect(path):
    d = _load(path)
    for k, v in d.items():
        sh = getattr(v, "shape", ())
        print(f"{k:28s} {str(sh):18s} {getattr(v, 'dtype', '')}")
    if "fps" in d:
        print("fps =", d["fps"])
    if "text" in d:
        print("text =", d["text"])
    for k in d:
        if "contact" in k.lower():
            print(f"[{k}] looks like foot contacts - pass them to flatten_feet(contacts=...) if you prefer them to the heuristic")


def _fps(d, default=20.0):
    return float(np.asarray(d["fps"]).reshape(-1)[0]) if "fps" in d else default


def _save(path, d, J_new):
    out = dict(d)
    out["posed_joints_original"] = d["posed_joints"]
    out["posed_joints"] = J_new
    np.savez(path, **out)
    print("saved", path, "(posed_joints replaced; rotations NOT updated, original kept as posed_joints_original)")


# =========================================================================== self test
def _synthetic(n_foot=14, dz=0.35, dy=0.0, Tf=0.5, fps=20, p_stance=40.0, rest=22.6, foot_len=0.13, hip_h=0.74):
    """a rigid 10-joint skeleton walking +z. footfalls alternate L,R; foot k lands at (z0+k*dz, y0-k*dy)."""
    l1 = l2 = 0.46
    rest_r = math.radians(rest)
    toe0 = 0.02
    T = int((n_foot) * Tf * fps)
    t = np.arange(T) / fps

    def foot(parity):
        toe = np.zeros((T, 3)); pitch = np.zeros(T)
        lands = [k for k in range(-4, n_foot + 4) if k % 2 == parity]
        for i, tt in enumerate(t):
            j = max(k for k in lands if k * Tf <= tt)
            nxt = j + 2
            sw0 = nxt * Tf - 0.5 * Tf
            P = lambda k: np.array([0.0, toe0 - k * dy, k * dz])
            if tt < sw0:
                toe[i] = P(j); pitch[i] = p_stance
            else:
                s = (tt - sw0) / (0.5 * Tf); u = smoothstep(s)
                toe[i] = (1 - u) * P(j) + u * P(nxt) + np.array([0, 0.07 * math.sin(math.pi * s), 0])
                pitch[i] = p_stance + (rest - p_stance) * math.sin(math.pi * s)
        return toe, pitch

    (tl, pl), (tr, pr) = foot(0), foot(1)
    tl[:, 0] += -0.09; tr[:, 0] += 0.09
    def ankle_of(toe, p):
        v = np.stack([np.zeros(T), -foot_len * np.sin(np.radians(p)), foot_len * np.cos(np.radians(p))], 1)
        return toe - v
    al, ar = ankle_of(tl, pl), ankle_of(tr, pr)
    mean_toe = (tl + tr) / 2
    k = int(Tf * fps)                                  # smooth the pelvis with a moving average
    ker = np.ones(k) / k
    pel = np.stack([np.convolve(np.pad(mean_toe[:, c], (k, k), mode="edge"), ker, "same")[k:-k] for c in range(3)], 1)
    pel[:, 1] += hip_h
    J = np.zeros((T, 10, 3))
    J[:, 0] = pel
    J[:, 1] = pel + [0, 0.6, 0]
    for base, (toe, a, x) in ((2, (tl, al, -0.09)), (6, (tr, ar, 0.09))):
        hip = pel + [x, 0, 0]
        J[:, base] = hip
        for i in range(T):
            kn, _ = two_bone_knee(hip[i], a[i], l1, l2, np.array([0, 0, 1.0]))
            J[i, base + 1] = kn
        J[:, base + 2] = a
        J[:, base + 3] = toe
    legs = [Leg(2, 3, 4, 5), Leg(6, 7, 8, 9)]
    return J, legs, fps


def _selftest():
    ok = True

    def check(name, cond, extra=""):
        nonlocal ok
        ok &= bool(cond)
        print(("PASS " if cond else "FAIL ") + name, extra)

    # ---- A) toe-walk on flat ground -------------------------------------------------------------
    J, legs, fps = _synthetic(n_foot=14, dz=0.35, dy=0.0, p_stance=40.0, rest=22.6)
    # frame 0 is mid-stance toe-walk, so give the correction the true rest pose explicitly
    out, info = flatten_feet(J, legs, fps, rest_pitch_deg=22.6, toe_floor=0.02)
    rep = info["report"]
    for side, r in rep.items():
        check(f"A {side}: toe-down {r['toe_down_before_deg'][1]:.1f} -> {r['toe_down_after_deg'][1]:.1f} deg (flat after)",
              r["toe_down_before_deg"][1] > 10 and abs(r["toe_down_after_deg"][1]) < 2.5 and abs(r["toe_down_after_deg"][0]) < 2.5)
    L0 = [np.median(np.linalg.norm(J[:, L.hip] - J[:, L.knee], axis=1)) for L in legs]
    L1 = [np.linalg.norm(out[:, L.hip] - out[:, L.knee], axis=1) for L in legs]
    check("A thigh length preserved", all(np.abs(x - l).max() < 1e-6 for x, l in zip(L1, L0)))
    S1 = [np.linalg.norm(out[:, L.knee] - out[:, L.ankle], axis=1) for L in legs]
    check("A shin length preserved", all(np.abs(x - S1[0].mean()).max() < 1e-6 for x in S1))
    pel = info["pelvis_delta"]
    mean = np.mean(info["leg_delta"], axis=0)
    check("A pelvis moves by the mean of both ankle deltas", np.abs(pel - mean).max() < 1e-12)
    check("A planted toes do not slide", max(np.abs(out[m, L.toe][:, [0, 2]] - J[m, L.toe][:, [0, 2]]).max()
                                              for L, m in zip(legs, info["masks"])) < 1e-9)
    check("A swing frames far from contacts untouched (hip only follows pelvis)",
          np.abs(out[:, legs[0].ankle] - J[:, legs[0].ankle])[info["weights"][0] == 0].max() < 1e-9)
    check("A no leg overstretch", info["max_leg_stretch_m"] < 1e-6)
    out2, info2 = flatten_feet(J, legs, fps, rest_pitch_deg=22.6, toe_floor=0.02, fade_from_s=3.0, fade_dur_s=1.0)
    t = np.arange(len(J)) / fps
    check("A fade-out: frames after 4 s are identical to the input", np.abs(out2[t > 4.0] - J[t > 4.0]).max() < 1e-9)

    # ---- B) stairs --------------------------------------------------------------------------------
    ardy_riser, ardy_tread = 0.095, 0.1216            # character-scale stair ARDY 'believes' (video)
    pic_riser, pic_tread = 0.136, 0.197               # picture's stair (video)
    kf, ku = pic_tread / ardy_tread, pic_riser / ardy_riser
    check("B video scale factors 1.62 / 1.43", abs(kf - 1.62) < 0.01 and abs(ku - 1.43) < 0.01, f"({kf:.3f}, {ku:.3f})")
    J, legs, fps = _synthetic(n_foot=14, dz=ardy_tread, dy=ardy_riser, p_stance=22.6, rest=22.6, hip_h=0.72)
    Jf = scale_root_trajectory(J, 0, (0, 1), kf, ku)
    out, info = snap_to_stairs(Jf, legs, fps, (0, 1), pic_riser, pic_tread, start_index=10, direction=-1,
                               rest_pitch_deg=22.6)
    ff = info["footfalls"]
    check("B footfall count and index sequence 10,9,8...", [f["step_index"] for f in ff] == list(range(10, 10 - len(ff), -1)),
          f"({len(ff)} footfalls)")
    ys = np.array([f["target"][1] for f in ff]); zs = np.array([f["target"][2] for f in ff])
    check("B step heights differ by exactly the picture riser", np.allclose(-np.diff(ys), pic_riser, atol=1e-9))
    check("B step depths differ by exactly the picture tread", np.allclose(np.diff(zs), pic_tread, atol=1e-9))
    # every detected contact now sits on its step top
    legs_m = [detect_contacts(out, L, fps, ys.min() - 0.0) for L in legs]
    check("B lateral position untouched", np.abs(out[:, legs[0].toe, 0] - Jf[:, legs[0].toe, 0]).max() < 1e-9)
    check("B bone lengths preserved", all(np.abs(np.linalg.norm(out[:, L.hip] - out[:, L.knee], axis=1) - 0.46).max() < 1e-5 for L in legs))
    check("B legs reach (no overstretch)", info["max_leg_stretch_m"] < 1e-6, f"({info['max_leg_stretch_m']:.2e} m)")
    check("B snapped toes land exactly on targets",
          all(np.abs(out[f["frame"], legs[f["leg"]].toe] - np.array(f["target"])).max() < 1e-6 for f in ff))
    print("\nALL PASS" if ok else "\nSOME FAILED")
    return 0 if ok else 1


# =========================================================================== main
def _main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("selftest")
    a = sub.add_parser("inspect"); a.add_argument("src")
    for name in ("flatten", "stairs"):
        a = sub.add_parser(name)
        a.add_argument("src"); a.add_argument("dst"); a.add_argument("--joints", required=True)
        a.add_argument("--ref-frame", type=int, default=0)
        a.add_argument("--rest-pitch", type=float, default=None)
        if name == "flatten":
            a.add_argument("--fade-from", type=float, default=None, help="seconds: stop correcting from here (e.g. 11 = sitting starts)")
            a.add_argument("--fade-dur", type=float, default=1.0)
        else:
            a.add_argument("--axis", type=float, nargs=2, required=True, metavar=("X", "Z"))
            a.add_argument("--riser", type=float, required=True); a.add_argument("--tread", type=float, required=True)
            a.add_argument("--start-index", type=int, required=True); a.add_argument("--direction", type=int, default=-1)
            a.add_argument("--ardy-riser", type=float); a.add_argument("--ardy-tread", type=float)
            a.add_argument("--root", type=int, default=0)
    args = ap.parse_args()
    if args.cmd == "selftest":
        sys.exit(_selftest())
    if args.cmd == "inspect":
        return _inspect(args.src)
    d = _load(args.src)
    J = np.asarray(d["posed_joints"], float)
    legs = legs_from_json(args.joints)
    fps = _fps(d)
    if args.cmd == "flatten":
        out, info = flatten_feet(J, legs, fps, args.rest_pitch, None, args.ref_frame, args.fade_from, args.fade_dur)
        print(json.dumps(info["report"], indent=1))
    else:
        if args.ardy_riser and args.ardy_tread:
            J = scale_root_trajectory(J, args.root, args.axis, args.tread / args.ardy_tread, args.riser / args.ardy_riser)
        out, info = snap_to_stairs(J, legs, fps, args.axis, args.riser, args.tread, args.start_index, args.direction,
                                   rest_pitch_deg=args.rest_pitch, ref_frame=args.ref_frame)
        print(json.dumps({"footfalls": info["footfalls"], "max_leg_stretch_m": info["max_leg_stretch_m"]}, indent=1))
    _save(args.dst, d, out)


if __name__ == "__main__":
    _main()
