"""Gamecakes — a note head for Musical Planets.

    blender --background --factory-startup --python art/blender/music-note.py

A glossy jelly-bean oval, tilted like an engraved note head, sitting on the
staff. The body is the `tint` slot (the runtime colours scale notes and
lights the one that is sounding); a cream highlight dab on its upper-left
front (-Y here, toward the camera in three) makes it read as candy.

About 0.6 wide (X), 0.44 tall, 0.28 deep. Base on z = 0.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

# About Y. Negative lifts the right end as seen from -Y (the camera side).
TILT = math.radians(-20)


def build():
    gc.clear_scene()
    root = gc.root_empty("Note")
    head = gc.ball("Head", gc.tint("tint", 0.25), 1.0, (0, 0, 0), root, segs=24, rings=14)
    head.scale = (0.3, 0.14, 0.22)
    head.rotation_euler[1] = TILT
    dab = gc.ball("Shine", gc.material("Cream", gc.PALETTE["cream"], 0.2), 1.0, (0, 0, 0), root, segs=12, rings=8)
    dab.scale = (0.085, 0.02, 0.05)
    # Upper-left of the front face, turned with the head.
    x, z = -0.11, 0.09
    c, s = math.cos(TILT), math.sin(TILT)
    dab.location = (x * c + z * s, -0.108, -x * s + z * c)
    dab.rotation_euler[1] = TILT
    return root


build()
ms.ground()
gc.ship(__file__, "music-note", 0.5, distance_mult=3.0, subdir="music")
