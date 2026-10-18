"""Gamecakes — cookie bench, a build piece kids buy and place.

    blender --background --factory-startup --python art/blender/build-bench.py

A sandwich-cookie seat and a wafer backrest on chocolate-stick legs. Origin at
the foot, centred in a one-unit grid square; the seat faces -Y, which the
exporter turns into the town's +Z (south) front.

No tint slot, so it stays one material and one instanced draw.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

SEAT_Z = 0.32
BACK_Z = 0.5
BACK_TILT = math.radians(-8)  # top leans back (+Y)
APEX_U = 0.62


def build():
    gc.clear_scene()
    root = gc.root_empty("BuildBench")

    m_cookie = gc.material("Cookie", 0xCF9A52, 0.62)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_wafer = gc.material("Wafer", 0xE7C48A, 0.75)
    m_choc = gc.material("Chocolate", 0x78350F, 0.6)
    m_sprinkle = gc.material("Sprinkle_Pink", gc.PALETTE["roof"], 0.35)

    # Seat: two cookie slabs with a cream filling between, set a touch forward.
    gc.box("SeatBottom", m_cookie, (0.78, 0.3, 0.03), (0, -0.01, SEAT_Z - 0.025), root)
    gc.box("SeatCream", m_cream, (0.75, 0.28, 0.022), (0, -0.01, SEAT_Z), root)
    gc.box("SeatTop", m_cookie, (0.78, 0.3, 0.03), (0, -0.01, SEAT_Z + 0.025), root)

    # Backrest: a wafer panel with a cream band across it, leaning back.
    back = gc.box("Back", m_wafer, (0.78, 0.05, 0.2), (0, 0.13, BACK_Z), root)
    back.rotation_euler[0] = BACK_TILT
    band = gc.box("BackCream", m_cream, (0.76, 0.056, 0.03), (0, 0.13, BACK_Z), root)
    band.rotation_euler[0] = BACK_TILT

    # Legs: chocolate sticks, front pair and back pair. The back pair stands
    # just behind the backrest and holds it, so the panel never swallows them.
    for side, x in (("L", -0.33), ("R", 0.33)):
        gc.cyl(f"LegFront{side}", m_choc, 0.03, SEAT_Z - 0.04, (x, -0.11, (SEAT_Z - 0.04) / 2), root, verts=8)
        gc.cyl(f"LegBack{side}", m_choc, 0.03, BACK_Z + 0.08, (x, 0.18, (BACK_Z + 0.08) / 2), root, verts=8)
        gc.ball(f"Knob{side}", m_choc, 0.04, (x, 0.18, BACK_Z + 0.08), root, segs=8, rings=5)

    # A few sprinkles on the seat so it reads as a cookie from above.
    for i, (x, y) in enumerate(((-0.24, -0.07), (-0.05, 0.04), (0.14, -0.06), (0.27, 0.05))):
        s = gc.box(f"Sprinkle{i}", m_sprinkle, (0.05, 0.014, 0.012), (x, y, SEAT_Z + 0.045), root)
        s.rotation_euler[2] = 0.6 + i * 1.1

    return root


def main():
    build()
    gc.ship(__file__, "build-bench", APEX_U, distance_mult=2.8)


main()
