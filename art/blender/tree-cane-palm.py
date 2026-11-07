"""Gamecakes — candy cane palm, a build piece kids buy and place.

    blender --background --factory-startup --python art/blender/tree-cane-palm.py

A red-and-white striped trunk that leans as it rises, mint fronds drooping
from the top and three chocolate-truffle coconuts. Origin at the foot,
centred in a one-unit grid square; the lean stays within the square.

No tint slot, so it stays one material and one instanced draw.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 2.2
TRUNK_H = 1.75
LEAN = 0.32  # how far the top sits off centre


def trunk_at(t):
    """Point on the trunk curve at t in 0..1 (x leans, z rises)."""
    # Lifted a hair: the first segment's overlap and tilt would dip below 0.
    return LEAN * t * t, 0.02 + TRUNK_H * t


def build():
    gc.clear_scene()
    root = gc.root_empty("TreeCanePalm")

    m_white = gc.material("Cane_White", 0xFFFFFF, 0.3)
    m_red = gc.material("Cane_Red", gc.PALETTE["cherry"], 0.3)
    m_fronds = [gc.material("Frond_Mint", gc.PALETTE["mint"], 0.5), gc.material("Frond_Green", 0x34D399, 0.5)]
    m_truffle = gc.material("Truffle", 0x7B4A2E, 0.6)

    # Trunk: short striped segments, each tilted along the curve.
    n = 10
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        (x0, z0), (x1, z1) = trunk_at(t0), trunk_at(t1)
        seg = gc.cyl(f"Trunk{i}", m_red if i % 2 else m_white, 0.1 - i * 0.003,
                     math.hypot(x1 - x0, z1 - z0) + 0.02, ((x0 + x1) / 2, 0, (z0 + z1) / 2), root, verts=10)
        seg.rotation_euler[1] = math.atan2(x1 - x0, z1 - z0)

    top_x, top_z = trunk_at(1)
    gc.ball("Crown", m_fronds[1], 0.13, (top_x, 0, top_z), root, segs=10, rings=6)

    # Fronds: flattened leaves, drooped then turned round the crown.
    for i in range(7):
        a = i * math.tau / 7
        leaf = gc.ball(f"Frond{i}", m_fronds[i % 2], 0.5,
                       (top_x + math.cos(a) * 0.38, math.sin(a) * 0.38, top_z + 0.05), root, segs=10, rings=6)
        leaf.scale = (1, 0.26, 0.07)
        leaf.rotation_euler = (0, math.radians(28), a)

    # Coconuts tucked under the crown.
    for i in range(3):
        a = i * math.tau / 3 + 0.5
        gc.ball(f"Coconut{i}", m_truffle, 0.085,
                (top_x + math.cos(a) * 0.11, math.sin(a) * 0.11, top_z - 0.12), root, segs=8, rings=6)

    return root


def main():
    build()
    gc.ship(__file__, "tree-cane-palm", APEX_U, distance_mult=2.4)


main()
