"""Gamecakes — flower bed, a build piece kids buy and place.

    blender --background --factory-startup --python art/blender/build-flowers.py

A brownie planter with a cream rim, filled with cocoa crumbs and five candy
flowers (petals round a lemon centre, a mint stem and leaf). Origin at the
foot, centred in a one-unit grid square.

No tint slot, so it stays one material and one instanced draw.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

BED = 0.74
BED_H = 0.15
HEAD_Z = 0.4
PETAL_R = 0.05
APEX_U = HEAD_Z + PETAL_R + 0.02

# Flower spots inside the bed (Blender X/Y), and the petal colour each gets.
SPOTS = [(-0.2, 0.2), (0.2, -0.18), (0.02, -0.02), (-0.18, -0.2), (0.21, 0.19)]


def build():
    gc.clear_scene()
    root = gc.root_empty("BuildFlowers")

    m_brownie = gc.material("Brownie", 0x78350F, 0.7)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_soil = gc.material("CocoaCrumb", 0x451A03, 0.9)
    m_stem = gc.material("Stem", 0x4ADE80, 0.5)
    m_centre = gc.material("Lemon", 0xFDE047, 0.35)
    petals = [
        gc.material("Petal_Pink", 0xF472B6, 0.4),
        gc.material("Petal_Amber", 0xFBBF24, 0.4),
        gc.material("Petal_Grape", 0xC084FC, 0.4),
    ]

    gc.box("Bed", m_brownie, (BED, BED, BED_H), (0, 0, BED_H / 2), root)
    gc.box("Soil", m_soil, (BED - 0.08, BED - 0.08, 0.02), (0, 0, BED_H + 0.002), root)
    # Cream rim: four strips round the top edge.
    for i, (size, at) in enumerate((
        ((BED + 0.02, 0.06, 0.04), (0, -BED / 2 + 0.02, BED_H)),
        ((BED + 0.02, 0.06, 0.04), (0, BED / 2 - 0.02, BED_H)),
        ((0.06, BED - 0.08, 0.04), (-BED / 2 + 0.02, 0, BED_H)),
        ((0.06, BED - 0.08, 0.04), (BED / 2 - 0.02, 0, BED_H)),
    )):
        gc.box(f"Rim{i}", m_cream, size, at, root)

    for i, (x, y) in enumerate(SPOTS):
        stem_h = HEAD_Z - BED_H
        gc.cyl(f"Stem{i}", m_stem, 0.016, stem_h, (x, y, BED_H + stem_h / 2), root, verts=6)
        leaf = gc.ball(f"Leaf{i}", m_stem, 0.06, (x + 0.04, y, BED_H + 0.08), root, segs=6, rings=4)
        leaf.scale = (1, 0.4, 0.25)
        leaf.rotation_euler = (0, math.radians(-30), i * 1.3)
        m_petal = petals[i % 3]
        for k in range(5):
            a = k * math.tau / 5 + i
            gc.ball(f"Petal{i}_{k}", m_petal, PETAL_R,
                    (x + math.cos(a) * 0.055, y + math.sin(a) * 0.055, HEAD_Z), root, segs=6, rings=4)
        gc.ball(f"Centre{i}", m_centre, 0.04, (x, y, HEAD_Z + 0.02), root, segs=6, rings=4)

    return root


def main():
    build()
    gc.ship(__file__, "build-flowers", APEX_U, distance_mult=3.4)


main()
