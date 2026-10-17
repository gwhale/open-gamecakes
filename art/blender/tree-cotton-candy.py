"""Gamecakes — cotton candy tree, a build piece kids buy and place.

    blender --background --factory-startup --python art/blender/tree-cotton-candy.py

A striped paper stick under a cloud of pink, blue and lilac puffs. Origin at
the foot; the build layer stands it in a one-unit grid square, so the cloud
may overhang the square a little but the stick sits dead centre.

No tint slot: every placed copy is the same, which keeps it one material and
one instanced draw however many a family places.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 2.1


def build():
    gc.clear_scene()
    root = gc.root_empty("TreeCottonCandy")

    m_paper = gc.material("Paper_Cream", gc.PALETTE["cream"], 0.7)
    m_stripe = gc.material("Paper_Stripe", gc.PALETTE["strawberry"], 0.6)
    puffs = [
        gc.material("Floss_Pink", 0xF9A8D4, 0.9),
        gc.material("Floss_Blue", 0x93C5FD, 0.9),
        gc.material("Floss_Lilac", 0xC4B5FD, 0.9),
    ]

    # Paper stick in six bands, sunk into the cloud.
    band = 0.19
    for i in range(6):
        gc.cyl(f"Stick{i}", m_stripe if i % 2 else m_paper, 0.075 - i * 0.004, band,
               (0, 0, band / 2 + i * band), root, verts=10)

    # The cloud: one big puff, a ring of six, and a cap.
    gc.ball("PuffCore", puffs[0], 0.48, (0, 0, 1.45), root, segs=14, rings=9)
    for i in range(6):
        a = i * math.tau / 6 + 0.3
        r = 0.4 + 0.05 * (i % 2)
        gc.ball(f"Puff{i}", puffs[(i + 1) % 3], 0.3 + 0.04 * (i % 3),
                (math.cos(a) * r, math.sin(a) * r, 1.3 + 0.12 * (i % 3)), root, segs=12, rings=8)
    gc.ball("PuffCap", puffs[2], 0.3, (0.04, -0.02, APEX_U - 0.3), root, segs=12, rings=8)

    return root


def main():
    build()
    gc.ship(__file__, "tree-cotton-candy", APEX_U, distance_mult=2.4)


main()
