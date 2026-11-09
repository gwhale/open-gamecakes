"""Gamecakes — game booth (one per game, plus the Cakey Store kiosk).

    blender --background --factory-startup --python art/blender/booth.py

Replaces the body + roof + drip + door that `makeShopBooth` (city3d.ts) builds
in code. The glowing glyph beacon, the hanging name sign and the tap proxy stay
in code: they are sprites and text, which change per game.

Spec it must hit, from makeShopBooth at the default width w = 1.8:
  body 1.8 x 1.55 x 1.8, roof base at 1.55, apex at 2.55, door on the front.
  The hanging sign mounts at y 1.05 in front of the door, so nothing on the
  front face may stand proud of it between y 0.9 and 1.3.

The body is the TINT slot: the town paints it the land's ribbon colour and
pulses its emissive as the cupcake walks up.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 2.55
W = 1.8
BODY_H = 1.55
ROOF_H = 1.0


def build():
    gc.clear_scene()
    root = gc.root_empty("Booth")

    m_body = gc.tint("tint", 0.55)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_door = gc.material("Door_Chocolate", gc.PALETTE["door"], 0.75)
    m_window = gc.material("Window_Vanilla", gc.PALETTE["vanilla"], 0.3)
    m_trim = gc.material("Trim_Strawberry", gc.PALETTE["strawberry"], 0.5)

    half = W / 2

    # Body: a cake block with a slightly wider foot, so it sits on the pad
    # instead of looking pasted onto it.
    gc.box("Body", m_body, (W, W, BODY_H), (0, 0, BODY_H / 2), root)
    gc.box("Foot", m_cream, (W + 0.12, W + 0.12, 0.12), (0, 0, 0.06), root)

    # Frosting roof: a 4-sided pyramid in cream, a fat piped band at the eaves,
    # and drips hanging over the body on all four sides.
    gc.cone(
        "Roof", m_cream, W * 0.92, 0, ROOF_H,
        (0, 0, BODY_H + ROOF_H / 2), root, verts=4, smooth=False,
        rot_z=math.radians(45),
    )
    gc.box("Eave", m_cream, (W + 0.16, W + 0.16, 0.16), (0, 0, BODY_H + 0.02), root)
    drip_x = (-0.66, -0.22, 0.22, 0.66)
    for side, (nx, ny) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
        for i, t in enumerate(drip_x):
            # Front drips stay short: the name sign hangs just below them.
            length = 0.16 if side == 0 else (0.22, 0.34, 0.18, 0.28)[i]
            x = t if nx == 0 else nx * (half + 0.05)
            y = t if ny == 0 else ny * (half + 0.05)
            z = BODY_H - length / 2
            gc.cyl(f"Drip{side}_{i}", m_cream, 0.07, length, (x, y, z), root, verts=8)
            gc.ball(f"DripTip{side}_{i}", m_cream, 0.075, (x, y, z - length / 2), root, segs=6, rings=4)

    # Cherry on the apex.
    gc.cherry("Cherry", (0, 0, APEX_U - 0.13), root, radius=0.13)

    # Door with a strawberry frame, flush on the front (-Y is the town's +z).
    # It stands on the foot plate (top at 0.12) and stops at 0.9, under the
    # hanging name sign.
    gc.box("DoorFrame", m_trim, (0.7, 0.06, 0.84), (0, -half - 0.01, 0.12 + 0.42), root)
    gc.box("Door", m_door, (0.56, 0.08, 0.76), (0, -half - 0.02, 0.12 + 0.38), root)
    gc.ball("DoorKnob", m_window, 0.04, (0.18, -half - 0.07, 0.5), root, segs=8, rings=6)

    # Round windows on the two side walls (the front belongs to the sign).
    for sx in (-1, 1):
        gc.cyl(
            f"Window{sx}", m_window, 0.24, 0.06, (sx * (half + 0.01), 0, 0.92), root, verts=16,
        ).rotation_euler[1] = math.radians(90)
        gc.torus(f"WindowRim{sx}", m_cream, 0.25, 0.04, (sx * (half + 0.02), 0, 0.92), root, major=16, minor=6
                 ).rotation_euler[1] = math.radians(90)

    return root


def main():
    build()
    gc.ship(__file__, "booth", APEX_U, distance_mult=2.4)


main()
