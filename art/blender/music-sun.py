"""Gamecakes — the sun at the centre of the circle of fifths.

    blender --background --factory-startup --python art/blender/music-sun.py

A vanilla-frosted ball with twelve gumdrop petals round its middle, one for
each planet on the circle, and a soft-serve swirl of cream on top. The glow
around it is a sprite in code.

About 2 tall, rays reach about 1.3 from the centre. Base on z = 0.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

R = 0.9
C = (0, 0, R)


def build():
    gc.clear_scene()
    root = gc.root_empty("Sun")
    m_body = gc.material("Vanilla", gc.PALETTE["vanilla"], 0.45)
    m_ray = gc.material("Apricot", 0xFDBA74, 0.4)
    m_ray2 = gc.material("Peach", 0xFDA4AF, 0.4)
    m_cream = gc.material("Cream", gc.PALETTE["cream"], 0.4)

    gc.ball("Body", m_body, R, C, root, segs=22, rings=12)
    for i in range(12):
        a = i / 12 * math.tau
        d = (math.cos(a), math.sin(a), 0)
        # A fat gumdrop petal, not a spike: the sun should look like candy.
        ray = gc.ball(f"Ray{i}", m_ray if i % 2 == 0 else m_ray2, 0.19, (d[0] * (R + 0.06), d[1] * (R + 0.06), R), root, segs=10, rings=6)
        ray.scale = (1, 1, 1.75)
        ms.orient(ray, d)

    # Soft-serve swirl: shrinking cream rings and a curl on top.
    top = 2 * R - 0.04
    for k, (rr, tube) in enumerate(((0.3, 0.1), (0.21, 0.085), (0.12, 0.07))):
        gc.torus(f"Swirl{k}", m_cream, rr, tube, (0, 0, top + k * 0.11), root, major=20, minor=8)
    gc.cone("Curl", m_cream, 0.1, 0.0, 0.14, (0, 0, top + 0.36), root, verts=12)
    return root


build()
ms.ground()
gc.ship(__file__, "music-sun", 2.0, distance_mult=2.4, subdir="music")
