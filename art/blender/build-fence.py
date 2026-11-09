"""Gamecakes — candy fence, a build piece kids buy and place.

    blender --background --factory-startup --python art/blender/build-fence.py

Three white frosting posts with strawberry gumdrop caps, joined by two
licorice rails. Origin at the foot, centred in a one-unit grid square, rails
along X (the piece turns in quarter steps at runtime).

No tint slot, so it stays one material and one instanced draw.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

POST_H = 0.52
CAP_R = 0.06
APEX_U = POST_H + CAP_R * 0.9


def build():
    gc.clear_scene()
    root = gc.root_empty("BuildFence")

    m_post = gc.material("Frosting_White", 0xFFFFFF, 0.4)
    m_cap = gc.material("Gumdrop_Strawberry", gc.PALETTE["strawberry"], 0.3)
    m_licorice = gc.material("Licorice", gc.PALETTE["cherry"], 0.35)
    m_band = gc.material("Licorice_Band", 0xFFE4EC, 0.4)

    for i, x in enumerate((-0.42, 0.0, 0.42)):
        gc.cyl(f"Post{i}", m_post, 0.05, POST_H, (x, 0, POST_H / 2), root, verts=8)
        # A thin collar where the post meets the ground hides the cut edge.
        gc.cyl(f"Foot{i}", m_post, 0.065, 0.04, (x, 0, 0.02), root, verts=8)
        cap = gc.ball(f"Cap{i}", m_cap, CAP_R, (x, 0, POST_H), root, segs=8, rings=5)
        cap.scale = (1, 1, 0.9)

    # Rails: licorice ropes between the posts, each banded where it meets one.
    for j, z in enumerate((0.2, 0.4)):
        rail = gc.cyl(f"Rail{j}", m_licorice, 0.03, 0.96, (0, 0, z), root, verts=8)
        rail.rotation_euler = (0, math.radians(90), 0)
        for k, x in enumerate((-0.21, 0.21)):
            band = gc.cyl(f"Band{j}_{k}", m_band, 0.034, 0.03, (x, 0, z), root, verts=8)
            band.rotation_euler = (0, math.radians(90), 0)

    return root


def main():
    build()
    gc.ship(__file__, "build-fence", APEX_U, distance_mult=2.6)


main()
