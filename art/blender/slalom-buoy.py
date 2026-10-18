"""Gamecakes — a slalom buoy for the jet ski course.

    blender --background --factory-startup --python art/blender/slalom-buoy.py

A round strawberry float with cream candy bands, a short licorice mast and a
mint pennant, a cherry on top. Two of them make a gate on the jet ski slalom;
the kid drives between them.

The float's bottom is z = 0 (check:models wants it grounded); the town sinks it
to its waterline. About 1.2 units tall, so a gate reads from a few gates back
at the jet ski camera's height.
"""

import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

R = 0.32          # float radius
FLOAT_H = 0.5
MAST_H = 0.55
APEX_U = FLOAT_H + MAST_H + 0.2


def build():
    gc.clear_scene()
    root = gc.root_empty("Buoy")

    m_red = gc.material("Strawberry", gc.PALETTE["strawberry"], 0.35)
    m_cream = gc.material("Cream", gc.PALETTE["cream"], 0.5)
    m_mast = gc.material("Licorice", 0x2B2B33, 0.45)
    m_mint = gc.material("Mint", gc.PALETTE["mint"], 0.45)

    # ---- Float: a squat ball with two cream bands round its middle.
    body = gc.ball("Float", m_red, R, (0, 0, FLOAT_H / 2), root, segs=20, rings=12)
    body.scale = (1, 1, FLOAT_H / 2 / R)
    for k, z in enumerate((FLOAT_H * 0.38, FLOAT_H * 0.62)):
        # Radius of the squashed ball at this height, a hair proud of it.
        dz = (z - FLOAT_H / 2) / (FLOAT_H / 2)
        rr = R * math.sqrt(max(0.0, 1 - dz * dz)) + 0.012
        band = gc.cyl(f"Band{k}", m_cream, rr, 0.06, (0, 0, z), root, verts=20)
        band.scale = (1, 1, 1)
    # A darker cap on top, where the mast stands.
    gc.cyl("Cap", m_cream, 0.11, 0.05, (0, 0, FLOAT_H - 0.01), root, verts=14)

    # ---- Mast, pennant and cherry.
    gc.cyl("Mast", m_mast, 0.025, MAST_H, (0, 0, FLOAT_H + MAST_H / 2), root, verts=8)
    flag = gc.cone("Pennant", m_mint, 0.13, 0.0, 0.34, (0.17, 0, FLOAT_H + MAST_H - 0.12), root, verts=3, smooth=False)
    flag.rotation_euler[1] = math.pi / 2
    flag.scale = (1, 0.25, 1)
    gc.cherry("TopCherry", (0, 0, FLOAT_H + MAST_H + 0.05), root, radius=0.08)
    return root


def main():
    root = build()
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices)
    root.location.z -= low
    gc.ship(__file__, "slalom-buoy", APEX_U, distance_mult=2.4)


main()
