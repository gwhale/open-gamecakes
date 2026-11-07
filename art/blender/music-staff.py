"""Gamecakes — the five-line music staff for Musical Planets.

    blender --background --factory-startup --python art/blender/music-staff.py

Five sugar rods 0.5 apart (so a line-to-space step is 0.25) with ball ends,
and a thicker bar line closing the left end. The clef, the sharps and flats
and the note names are sprites in code; the note heads are music-note.

Lines along X, 14 long, stacked in Z (three Y). The asset is grounded, so the
bottom line's centre sits at z = 0.045 (its radius), not at 0.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

LEN = 14.0
R = 0.045
GAP = 0.5
BAR_R = 0.07


def build():
    gc.clear_scene()
    root = gc.root_empty("Staff")
    m = gc.material("Sugar", 0xFFFFFF, 0.3)
    for i in range(5):
        ms.rod(f"Line{i}", m, LEN, R, (0, 0, i * GAP), "X", root, verts=8)
    # Bar line: caps flush with the outer lines' undersides and tops.
    ms.rod("BarLine", m, 4 * GAP + 2 * R, BAR_R, (-LEN / 2 + BAR_R, 0, 2 * GAP), "Z", root, verts=10, caps=False)
    return root


build()
ms.ground()
gc.ship(__file__, "music-staff", 2.2, distance_mult=4.5, subdir="music")
