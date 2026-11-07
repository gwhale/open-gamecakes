"""Gamecakes — candy-cane street lamp, a build piece kids buy and place.

    blender --background --factory-startup --python art/blender/build-lamp.py

A chocolate foot, a red-and-white striped pole, a round bulb under a chocolate
cap with a cherry knob. Origin at the foot, centred in a one-unit grid square.

The bulb is the `tint` slot. builds3d.ts swaps it for the town's glowing bulb
material (the atlas cannot glow), so the lamp is two instanced draws.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

POLE_BOTTOM = 0.1
POLE_TOP = 1.17
BULB_Z = 1.27
KNOB_Z = 1.43
KNOB_R = 0.035
APEX_U = KNOB_Z + KNOB_R


def build():
    gc.clear_scene()
    root = gc.root_empty("BuildLamp")

    m_choc = gc.material("Chocolate", 0x78350F, 0.6)
    m_white = gc.material("Cane_White", 0xFFFFFF, 0.3)
    m_red = gc.material("Cane_Red", gc.PALETTE["strawberry"], 0.3)
    m_bulb = gc.tint("tint", 0.2)

    # Foot: a stepped chocolate base.
    gc.cone("Foot", m_choc, 0.17, 0.14, 0.07, (0, 0, 0.035), root, verts=12)
    gc.cone("FootTop", m_choc, 0.12, 0.07, 0.05, (0, 0, 0.095), root, verts=12)

    # Pole: candy-cane stripes, short alternating segments.
    n = 8
    seg = (POLE_TOP - POLE_BOTTOM) / n
    for i in range(n):
        gc.cyl(f"Pole{i}", m_red if i % 2 else m_white, 0.045, seg + 0.002,
               (0, 0, POLE_BOTTOM + seg * (i + 0.5)), root, verts=10)

    # Collar the bulb sits in, the bulb, then the cap over it.
    gc.cone("Collar", m_choc, 0.05, 0.1, 0.06, (0, 0, POLE_TOP + 0.02), root, verts=12)
    gc.ball("Bulb", m_bulb, 0.13, (0, 0, BULB_Z), root, segs=14, rings=9)
    gc.cone("Cap", m_choc, 0.17, 0.05, 0.08, (0, 0, 1.38), root, verts=12)
    gc.ball("Knob", gc.material("Cherry", gc.PALETTE["cherry"], 0.25), KNOB_R, (0, 0, KNOB_Z), root, segs=8, rings=5)

    return root


def main():
    build()
    gc.ship(__file__, "build-lamp", APEX_U, distance_mult=2.2)


main()
