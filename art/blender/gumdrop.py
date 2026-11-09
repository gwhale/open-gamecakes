"""Gamecakes — gumdrop, the small candy prop scattered across open ground.

    blender --background --factory-startup --python art/blender/gumdrop.py

Replaces the plain sphere in city3d.ts. At scale 1 the code gumdrop is 0.56
wide and 0.48 tall, base on the ground; the town scales it 0.6-1.3x. A real
gumdrop is a domed cone with a flat foot, frosted with sugar, so that is the
shape here: a short tapered body under a dome, with sugar crystals on top.

The body is the TINT slot: the town cycles it through the gumdrop colours.
"""

import os
import random
import math
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 0.48
R = 0.28


def build():
    gc.clear_scene()
    root = gc.root_empty("Gumdrop")

    m_candy = gc.tint("tint", 0.3)
    m_sugar = gc.material("Sugar", 0xFFFFFF, 0.2)

    # The dome's lower half sits inside the foot, so the foot must be at least
    # as tall as the dome's radius or the dome pokes out under the ground.
    foot_h = 0.24
    gc.cone("Foot", m_candy, R, R * 0.86, foot_h, (0, 0, foot_h / 2), root, verts=18)
    dome = gc.ball("Dome", m_candy, R * 0.86, (0, 0, foot_h), root, segs=16, rings=8)
    dome.scale = (1, 1, (APEX_U - foot_h) / (R * 0.86))

    # Sugar crystals: tiny cubes scattered over the upper dome. Seeded so a
    # rebuild produces the same gumdrop.
    rng = random.Random(7)
    for i in range(14):
        a = rng.uniform(0, math.tau)
        el = rng.uniform(0.35, 1.25)  # radians above the dome's equator
        rx = R * 0.86 * math.cos(el)
        z = foot_h + (APEX_U - foot_h) * math.sin(el)
        gc.box(
            f"Sugar{i}", m_sugar, (0.035, 0.035, 0.035),
            (math.cos(a) * rx, math.sin(a) * rx, min(z, APEX_U - 0.02)), root, rot_z=a,
        )

    return root


def main():
    build()
    gc.ship(__file__, "gumdrop", APEX_U, distance_mult=3.2)


main()
