"""Gamecakes — the "go here next" arrow over the jet ski slalom.

    blender --background --factory-startup --python art/blender/slalom-arrow.py

A fat candy arrow pointing down: a vanilla shaft with a strawberry stripe and
a cherry-red head. It hovers and bobs over the middle of the next gate on the
slalom course, so a kid who can't read the HUD still knows where to drive.

The tip is z = 0 (check:models wants it grounded); the town floats it above
the gate.
"""

import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

HEAD_H = 0.45
SHAFT_H = 0.5
APEX_U = HEAD_H + SHAFT_H


def build():
    gc.clear_scene()
    root = gc.root_empty("Arrow")

    m_head = gc.material("Cherry", gc.PALETTE["cherry"], 0.3)
    m_shaft = gc.material("Vanilla", gc.PALETTE["vanilla"], 0.45)
    m_stripe = gc.material("Strawberry", gc.PALETTE["strawberry"], 0.4)

    # Head: a cone pointing down, tip at z = 0.
    head = gc.cone("Head", m_head, 0.34, 0.0, HEAD_H, (0, 0, HEAD_H / 2), root, verts=20)
    head.rotation_euler[0] = math.pi
    gc.cyl("Shaft", m_shaft, 0.13, SHAFT_H, (0, 0, HEAD_H + SHAFT_H / 2), root, verts=16)
    gc.cyl("Stripe", m_stripe, 0.135, 0.09, (0, 0, HEAD_H + SHAFT_H * 0.55), root, verts=16)
    gc.ball("ShaftCap", m_shaft, 0.13, (0, 0, HEAD_H + SHAFT_H), root, segs=16, rings=8)
    return root


def main():
    root = build()
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices)
    root.location.z -= low
    gc.ship(__file__, "slalom-arrow", APEX_U, distance_mult=2.4)


main()
