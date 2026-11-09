"""Gamecakes — one white piano key for Musical Planets.

    blender --background --factory-startup --python art/blender/music-key-white.py

The 3D keyboard is fifteen of these (C4 to C6) sitting in music-piano-bed.
Each key gets its own material copy at runtime so it can light up when it
sounds, so the GLB is one plain vanilla-white mesh, rounded all round like a
slab of fondant.

0.94 wide (X), 4.6 long (Y), 0.55 tall, base on z = 0.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

W, L, H = 0.94, 4.6, 0.55


def build():
    gc.clear_scene()
    root = gc.root_empty("KeyWhite")
    ms.rbox("Key", gc.material("Fondant", 0xFFF8EC, 0.35), (W, L, H), (0, 0, H / 2), root, bevel=0.09, segments=4)
    return root


build()
ms.ground()
gc.ship(__file__, "music-key-white", 1.2, distance_mult=3.2, subdir="music")
