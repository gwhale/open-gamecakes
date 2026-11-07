"""Gamecakes — a floating jump ramp for the jet skis.

    blender --background --factory-startup --python art/blender/ski-ramp.py

A wafer-biscuit kicker on two marshmallow floats: a sloped deck rising from
the water to a lip, candy-striped side rails so the kid sees which way it
faces, and a cherry at each top corner. Riding up it at speed throws the jet
ski into the air.

The low end is +Y and the lip is -Y (glTF: lip toward +Z, the way rides
face), so the town yaws it like a ride. The deck rises from z = 0 at the low
end to LIP_Z at the lip; the town keeps the same numbers (SKI_RAMP_* in
engine.ts) to lift the ski as it climbs.
"""

import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

L = 2.4          # along Y, water to lip
W = 1.6
LIP_Z = 0.55
DECK_T = 0.08
APEX_U = LIP_Z + 0.25


def build():
    gc.clear_scene()
    root = gc.root_empty("Ramp")

    m_wafer = gc.material("Wafer", 0xE8B96A, 0.75)
    m_wafer_line = gc.material("WaferLine", 0xC98F45, 0.8)
    m_red = gc.material("Strawberry", gc.PALETTE["strawberry"], 0.4)
    m_cream = gc.material("Cream", gc.PALETTE["cream"], 0.5)
    m_float = gc.material("Marshmallow", 0xFFF7FB, 0.7)

    slope = math.atan2(LIP_Z, L)
    run = math.hypot(L, LIP_Z)

    # ---- Deck: wafer slats across the slope, darker gaps between.
    slats = 8
    for i in range(slats):
        t = (i + 0.5) / slats
        y = L / 2 - t * L
        z = t * LIP_Z
        s = gc.box(f"Slat{i}", m_wafer, (W, run / slats * 0.86, DECK_T), (0, y, z), root)
        s.rotation_euler[0] = -slope
    bed = gc.box("Bed", m_wafer_line, (W - 0.06, run, DECK_T * 0.6), (0, 0, LIP_Z / 2 - 0.03), root)
    bed.rotation_euler[0] = -slope

    # ---- Side rails: candy stripes up each edge.
    segs = 6
    for sx in (-1, 1):
        for i in range(segs):
            t = (i + 0.5) / segs
            rail = gc.box(f"Rail{sx}{i}", m_red if i % 2 == 0 else m_cream, (0.1, run / segs, 0.12),
                          (sx * (W / 2 + 0.03), L / 2 - t * L, t * LIP_Z + 0.06), root)
            rail.rotation_euler[0] = -slope
        gc.cherry(f"Cherry{sx}", (sx * (W / 2 + 0.03), -L / 2, LIP_Z + 0.2), root, radius=0.09)

    # ---- Floats under the lip, so the ramp reads as afloat, not sunk.
    for sx in (-1, 1):
        f = gc.ball(f"Float{sx}", m_float, 0.28, (sx * W * 0.3, -L * 0.3, 0.2), root, segs=14, rings=8)
        f.scale = (1, 1.6, 0.9)
    # Lip post: the drop face under the lip.
    gc.box("LipFace", m_wafer_line, (W, 0.08, LIP_Z), (0, -L / 2 + 0.04, LIP_Z / 2), root)
    return root


def main():
    root = build()
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices)
    root.location.z -= low
    gc.ship(__file__, "ski-ramp", APEX_U, distance_mult=5.0)


main()
