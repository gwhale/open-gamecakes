"""Gamecakes — gumdrop pine, a build piece kids buy and place.

    blender --background --factory-startup --python art/blender/tree-gumdrop-pine.py

Three stacked green gumdrop tiers on a pretzel trunk, hung with gumdrop
baubles and topped with a lemon gumdrop star. Origin at the foot, centred in
a one-unit grid square.

No tint slot, so it stays one material and one instanced draw.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 2.0


def build():
    gc.clear_scene()
    root = gc.root_empty("TreeGumdropPine")

    m_pretzel = gc.material("Pretzel", 0xA0623A, 0.75)
    m_greens = [gc.material("Gumdrop_Green", 0x34D399, 0.3), gc.material("Gumdrop_Mint", gc.PALETTE["mint"], 0.3)]
    m_sugar = gc.material("Sugar", 0xFFFFFF, 0.2)
    m_lemon = gc.material("Gumdrop_Lemon", 0xFDE047, 0.3)
    baubles = [
        gc.material("Bauble_Cherry", gc.PALETTE["cherry"], 0.3),
        gc.material("Bauble_Berry", gc.PALETTE["blueberry"], 0.3),
        gc.material("Bauble_Vanilla", gc.PALETTE["vanilla"], 0.3),
    ]

    gc.cone("Trunk", m_pretzel, 0.13, 0.09, 0.55, (0, 0, 0.275), root, verts=10)

    # Tiers: (bottom z, height, radius). Each overlaps the one below so no
    # trunk shows between them.
    tiers = [(0.45, 0.7, 0.64), (0.88, 0.6, 0.5), (1.26, 0.5, 0.36)]
    for i, (z0, h, r) in enumerate(tiers):
        gc.cone(f"Tier{i}", m_greens[i % 2], r, r * 0.12, h, (0, 0, z0 + h / 2), root, verts=14)
        # Sugared rim: a soft torus where the tier flares out.
        gc.torus(f"Rim{i}", m_sugar, r * 0.93, 0.035, (0, 0, z0 + 0.04), root, major=18, minor=4)
        # Baubles round the rim.
        n = 5 - i
        for j in range(n):
            a = j * math.tau / n + i * 0.6
            gc.ball(f"Bauble{i}_{j}", baubles[(i + j) % 3], 0.07,
                    (math.cos(a) * r * 0.86, math.sin(a) * r * 0.86, z0 + 0.06), root, segs=8, rings=5)

    # Lemon gumdrop star: a domed cone, like the town's gumdrops.
    gc.cone("StarFoot", m_lemon, 0.13, 0.11, 0.1, (0, 0, 1.79), root, verts=12)
    star = gc.ball("StarDome", m_lemon, 0.11, (0, 0, 1.84), root, segs=10, rings=6)
    star.scale = (1, 1, (APEX_U - 1.84) / 0.11)

    return root


def main():
    build()
    gc.ship(__file__, "tree-gumdrop-pine", APEX_U, distance_mult=2.4)


main()
