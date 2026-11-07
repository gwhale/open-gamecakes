"""Gamecakes — one black piano key for Musical Planets.

    blender --background --factory-startup --python art/blender/music-key-black.py

Ten of these ride on top of the white keys. Shiny licorice with a top face a
little narrower than the base, the way a real black key tapers. One mesh, one
colour: the runtime gives each key its own material copy to light it.

0.56 wide (X), 2.9 long (Y), 0.5 tall, base on z = 0.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

W, L, H = 0.56, 2.9, 0.5


def build():
    gc.clear_scene()
    root = gc.root_empty("KeyBlack")
    ms.rbox("Key", gc.material("Licorice", 0x2B2B33, 0.25), (W, L, H), (0, 0, H / 2), root,
            bevel=0.06, segments=4, top_scale=(0.78, 0.95))
    return root


build()
ms.ground()
gc.ship(__file__, "music-key-black", 1.0, distance_mult=3.2, subdir="music")
