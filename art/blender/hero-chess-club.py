"""Gamecakes — Chess Island hero landmark: a chocolate king.

    blender --background --factory-startup --python art/blender/hero-chess-club.py

Stands in for the procedural king in city3d.ts (a base cylinder, a body
cylinder, a sphere head and a box cross). Apex ~2.26u, which is what city3d
assumes when it places the plinth balloons, arch gate and marquee around it.

A king is exactly the kind of shape a lathe does better than stacked cylinders,
so this is real upside rather than a like-for-like swap.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 2.26


def build():
    gc.clear_scene()
    root = gc.root_empty("HeroChessKing")

    m_king = gc.material("Cake_ChocolateDeep", 0x6B4423, 0.55)
    m_trim = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.4)

    # Foot — a flared base, wider at the bottom so it reads as planted.
    gc.cone("Foot", m_king, 0.72, 0.56, 0.34, (0, 0, 0.17), root, verts=20)
    gc.cyl("FootBead", m_trim, 0.58, 0.09, (0, 0, 0.36), root, verts=20)

    # Waist — the pinched middle that makes a chess piece read as turned.
    gc.cone("WaistLower", m_king, 0.5, 0.3, 0.42, (0, 0, 0.62), root, verts=20)
    gc.cone("WaistUpper", m_king, 0.3, 0.44, 0.4, (0, 0, 1.03), root, verts=20)

    # Collar + crown band.
    gc.cyl("Collar", m_trim, 0.5, 0.1, (0, 0, 1.28), root, verts=20)
    gc.cone("Crown", m_king, 0.47, 0.4, 0.34, (0, 0, 1.5), root, verts=20)

    # Crown points — small merlons around the rim, the giveaway that it's a king.
    for i in range(8):
        a = (i / 8) * math.tau
        gc.box("CrownPoint%d" % i, m_trim, (0.11, 0.11, 0.18),
               (math.cos(a) * 0.38, math.sin(a) * 0.38, 1.76), root, rot_z=a)

    # Head + cross.
    #
    # First pass had a 0.27 head at z=1.9 (spanning 1.63..2.17) and a cross from
    # 1.84 — so the head swallowed both the crown points and almost all of the
    # cross, and the whole piece read as a pawn. The head is now smaller and the
    # cross clears it entirely, which is the single silhouette cue that says
    # "king".
    gc.ball("Head", m_king, 0.2, (0, 0, 1.8), root, segs=16, rings=10)
    gc.box("CrossV", m_trim, (0.1, 0.1, 0.3), (0, 0, APEX_U - 0.15), root)
    gc.box("CrossH", m_trim, (0.28, 0.1, 0.1), (0, 0, APEX_U - 0.22), root)

    return root


def main():
    repo, blend_out, png_out = gc.paths(__file__, "hero-chess-club")
    build()
    gc.export_glb(repo, "hero-chess-club.glb")
    gc.render_preview(png_out, APEX_U, distance_mult=2.8)
    gc.save_blend(blend_out)


main()
