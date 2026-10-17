"""Gamecakes — the generic two-tier hero cake at the centre of most lands.

    blender --background --factory-startup --python art/blender/hero-cake.py

Replaces the two cylinders + cherry in city3d.ts (the `else` branch of the
hero landmark). The code cake: a 0.7-tall base tier (radius 0.8 at the foot,
0.7 at the top), a 0.5-tall cream top tier (0.5 / 0.42), and a 0.13 cherry
whose top lands at 1.45. The land's emoji badge floats at 2.3, above it.

The base tier is the TINT slot: the town paints it the region's theme colour.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 1.45


def build():
    gc.clear_scene()
    root = gc.root_empty("HeroCake")

    m_tier = gc.tint("tint", 0.65)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_sprinkle = gc.material("Sprinkle_Strawberry", gc.PALETTE["strawberry"], 0.4)
    m_mint = gc.material("Sprinkle_Mint", gc.PALETTE["mint"], 0.4)

    # Base tier.
    gc.cone("BaseTier", m_tier, 0.8, 0.7, 0.7, (0, 0, 0.35), None, verts=24)
    # Cream drips over the base tier's top edge.
    for i in range(12):
        a = (i / 12) * math.tau
        length = (0.22, 0.32, 0.18)[i % 3]
        r = 0.72
        gc.cyl(f"Drip{i}", m_cream, 0.06, length, (math.cos(a) * r, math.sin(a) * r, 0.7 - length / 2), None, verts=6)
        gc.ball(f"DripTip{i}", m_cream, 0.065, (math.cos(a) * r, math.sin(a) * r, 0.7 - length), None, segs=6, rings=4)
    gc.cyl("BaseIcing", m_cream, 0.72, 0.06, (0, 0, 0.7), None, verts=24)

    # Top tier, cream, with a piped bead border at its foot.
    gc.cone("TopTier", m_cream, 0.5, 0.42, 0.5, (0, 0, 0.95), None, verts=24)
    for i in range(16):
        a = (i / 16) * math.tau
        gc.ball(f"Bead{i}", m_cream, 0.055, (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.74), None, segs=6, rings=4)

    # Sprinkles on the top tier's face.
    for i in range(10):
        a = (i / 10) * math.tau + 0.2
        z = 0.88 + (i % 3) * 0.1
        r = 0.5 - (z - 0.7) * 0.16 + 0.005
        s = gc.box(
            f"Sprinkle{i}", m_sprinkle if i % 2 else m_mint, (0.03, 0.03, 0.09),
            (math.cos(a) * r, math.sin(a) * r, z), None, rot_z=a,
        )
        s.rotation_euler[0] = math.radians(35 if i % 2 else -35)

    gc.cherry("Cherry", (0, 0, APEX_U - 0.13), None, radius=0.13)
    return root


def main():
    build()
    gc.ship(__file__, "hero-cake", APEX_U, distance_mult=2.6)


main()
