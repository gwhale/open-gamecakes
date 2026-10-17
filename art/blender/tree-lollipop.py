"""Gamecakes — lollipop tree, the town's scattered foliage.

    blender --background --factory-startup --python art/blender/tree-lollipop.py

Replaces the biscuit-stick + squashed-sphere tree in city3d.ts ("Lollipop
trees + candy props"). At scale 1 that tree is a 0.7-tall trunk under a
canopy 1.44 wide whose top sits at 1.77; the town scales each tree 0.7-1.4x
and sways it about its base, so the origin must stay at the foot.

The canopy is the TINT slot: the town cycles it through four candy colours.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 1.77
CANOPY_R = 0.72
CANOPY_Z = 1.12


def build():
    gc.clear_scene()
    root = gc.root_empty("TreeLollipop")

    m_candy = gc.tint("tint", 0.35)
    m_stick = gc.material("Biscuit", 0xE7B98A, 0.8)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_bow = gc.material("Bow_Strawberry", gc.PALETTE["strawberry"], 0.5)

    # Biscuit stick, slightly tapered, sunk a touch into the canopy.
    gc.cone("Stick", m_stick, 0.14, 0.1, 0.8, (0, 0, 0.4), root, verts=10)

    # Squashed candy canopy (same 0.9 squash the code tree had).
    canopy = gc.ball("Canopy", m_candy, CANOPY_R, (0, 0, CANOPY_Z), root, segs=16, rings=10)
    canopy.scale = (1, 1, 0.9)
    bottom = CANOPY_Z - CANOPY_R * 0.9

    # A cream swirl ring wrapped round the canopy's equator, so it reads as a
    # wrapped lollipop rather than a ball on a stick.
    ring = gc.torus("Swirl", m_cream, CANOPY_R * 0.97, 0.06, (0, 0, CANOPY_Z), root, major=24, minor=4)
    ring.rotation_euler[0] = math.radians(12)

    # Ribbon bow where the stick meets the candy.
    bow_z = bottom + 0.02
    gc.torus("BowKnot", m_bow, 0.13, 0.045, (0, 0, bow_z), root, major=10, minor=4)
    for sx in (-1, 1):
        loop = gc.ball(f"BowLoop{sx}", m_bow, 0.09, (sx * 0.17, -0.05, bow_z - 0.02), root, segs=8, rings=4)
        loop.scale = (1.3, 0.5, 0.8)

    return root


def main():
    build()
    gc.ship(__file__, "tree-lollipop", APEX_U, distance_mult=2.6)


main()
