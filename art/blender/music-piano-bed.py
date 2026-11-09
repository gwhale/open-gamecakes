"""Gamecakes — the keyboard case for Musical Planets.

    blender --background --factory-startup --python art/blender/music-piano-bed.py

A chocolate tray the keys sit in: a floor whose top is z = 0.25 (the keys
stand on it), a back rail at +Y with cream frosting poured over its top and
dripping down the front, short side cheeks and a strawberry trim stripe along
the front edge. +Y is the back (away from the player); in three that is -Z.

16.4 wide (X), 5.6 deep (Y), base on z = 0.
"""

import os
import random
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

W, D = 16.4, 5.6
FLOOR = 0.25
RAIL_D, RAIL_H = 0.7, 0.9
CHEEK_W, CHEEK_H = 0.3, 0.7


def build():
    gc.clear_scene()
    root = gc.root_empty("PianoBed")
    m_choc = gc.material("Chocolate", gc.PALETTE["chocolate"], 0.5)
    m_dark = gc.material("DarkChocolate", 0x7A4A2E, 0.5)
    m_cream = gc.material("Cream", gc.PALETTE["cream"], 0.45)
    m_red = gc.material("Strawberry", gc.PALETTE["strawberry"], 0.35)

    ms.rbox("Floor", m_dark, (W, D, FLOOR), (0, 0, FLOOR / 2), root, bevel=0.06, segments=2)
    rail_y = D / 2 - RAIL_D / 2
    ms.rbox("Rail", m_choc, (W, RAIL_D, RAIL_H), (0, rail_y, RAIL_H / 2), root, bevel=0.1, segments=3)
    for k, s in enumerate((-1, 1)):
        ms.rbox(f"Cheek{k}", m_choc, (CHEEK_W, D - RAIL_D, CHEEK_H),
                (s * (W / 2 - CHEEK_W / 2), -RAIL_D / 2, CHEEK_H / 2), root, bevel=0.1, segments=3)
    ms.rbox("Trim", m_red, (W + 0.04, 0.12, 0.12), (0, -D / 2 + 0.02, FLOOR * 0.55), root, bevel=0.04, segments=2)

    # Frosting poured over the rail, dripping down its front (-Y) face.
    top = RAIL_H + 0.02
    ms.rbox("Frosting", m_cream, (W + 0.06, RAIL_D + 0.08, 0.1), (0, rail_y, top), root, bevel=0.05, segments=2)
    rng = random.Random(3)
    front = rail_y - RAIL_D / 2 - 0.02
    n = 16
    for i in range(n):
        x = -W / 2 + 0.6 + i * (W - 1.2) / (n - 1) + rng.uniform(-0.15, 0.15)
        length = rng.uniform(0.12, 0.34)
        gc.cyl(f"Drip{i}", m_cream, 0.07, length, (x, front, top - length / 2), root, verts=8)
        gc.ball(f"DripEnd{i}", m_cream, 0.07, (x, front, top - length), root, segs=8, rings=5)
    return root


build()
ms.ground()
gc.ship(__file__, "music-piano-bed", 2.0, distance_mult=5.0, subdir="music")
