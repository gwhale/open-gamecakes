"""Gamecakes — a ledger line for Musical Planets.

    blender --background --factory-startup --python art/blender/music-ledger.py

The short extra line through middle C below the staff. Same sugar rod as
music-staff. 0.95 long (X), underside on z = 0.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402


def build():
    gc.clear_scene()
    root = gc.root_empty("Ledger")
    ms.rod("Ledger", gc.material("Sugar", 0xFFFFFF, 0.3), 0.95, 0.045, (0, 0, 0), "X", root, verts=8)
    return root


build()
ms.ground()
gc.ship(__file__, "music-ledger", 0.3, distance_mult=4.0, subdir="music")
