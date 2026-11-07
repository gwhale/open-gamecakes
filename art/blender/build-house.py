"""Gamecakes — little cake house, the "House" build piece kids buy and place.

    blender --background --factory-startup --python art/blender/build-house.py

A vanilla sponge cottage with a cream band, a strawberry pyramid roof topped
with a cherry, a wafer chimney, a chocolate door and blueberry-glass windows.
Origin at the foot, centred in a one-unit grid square; the door faces -Y,
which the exporter turns into the town's +Z (south) front.

No tint slot, so it stays one material and one instanced draw.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

W, D, WALL_H = 0.82, 0.76, 0.6
ROOF_H = 0.46
CHERRY_R = 0.07
APEX_U = WALL_H + ROOF_H - 0.02 + CHERRY_R * 1.7


def build():
    gc.clear_scene()
    root = gc.root_empty("BuildHouse")

    m_sponge = gc.material("Sponge_Vanilla", 0xFEF3C7, 0.7)
    m_cream = gc.material("Frosting_White", 0xFFFFFF, 0.4)
    m_roof = gc.material("Roof_Strawberry", gc.PALETTE["strawberry"], 0.45)
    m_choc = gc.material("Chocolate", 0x78350F, 0.6)
    m_glass = gc.material("Glass_Sky", 0x93C5FD, 0.2)
    m_wafer = gc.material("Wafer", 0xE7C48A, 0.75)
    m_gold = gc.material("Lemon", 0xFDE047, 0.3)

    gc.box("Walls", m_sponge, (W, D, WALL_H), (0, 0, WALL_H / 2), root)
    gc.box("Band", m_cream, (W + 0.04, D + 0.04, 0.06), (0, 0, WALL_H), root)
    # Pyramid roof: a 4-sided cone turned 45 degrees so its edges meet the corners.
    gc.cone("Roof", m_roof, 0.64, 0.0, ROOF_H, (0, 0, WALL_H + ROOF_H / 2 - 0.02), root,
            verts=4, smooth=False, rot_z=math.radians(45))
    gc.cherry("Cherry", (0, 0, WALL_H + ROOF_H - 0.02 + CHERRY_R * 0.7), root, radius=CHERRY_R)

    # Wafer chimney with a cream puff of smoke-frosting on top.
    gc.box("Chimney", m_wafer, (0.12, 0.12, 0.3), (0.2, 0.12, 0.88), root)
    gc.ball("ChimneyPuff", m_cream, 0.07, (0.2, 0.12, 1.05), root, segs=8, rings=5)

    front = -D / 2
    gc.box("Door", m_choc, (0.2, 0.03, 0.32), (0, front - 0.012, 0.16), root)
    gc.ball("DoorKnob", m_gold, 0.022, (0.06, front - 0.03, 0.16), root, segs=6, rings=4)
    gc.box("Step", m_cream, (0.28, 0.08, 0.03), (0, front - 0.04, 0.015), root)
    for side, x in (("L", -0.24), ("R", 0.24)):
        gc.box(f"Window{side}", m_glass, (0.17, 0.03, 0.15), (x, front - 0.01, 0.38), root)
        gc.box(f"Sill{side}", m_cream, (0.21, 0.05, 0.025), (x, front - 0.02, 0.295), root)
    # A window on each side wall, so the house reads from every angle.
    for side, x in (("E", W / 2), ("W", -W / 2)):
        gc.box(f"SideWindow{side}", m_glass, (0.03, 0.17, 0.15), (x + (0.01 if x > 0 else -0.01), 0, 0.38), root)

    return root


def main():
    build()
    gc.ship(__file__, "build-house", APEX_U, distance_mult=2.6)


main()
