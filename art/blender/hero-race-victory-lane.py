"""Gamecakes — Victory Lane hero landmark: a winner's trophy.

    blender --background --factory-startup --python art/blender/hero-race-victory-lane.py

Stands in for the procedural trophy in city3d.ts (a frosting plinth plus stacked
amber cylinders). Apex ~1.8u, which is what city3d assumes when placing the
plinth balloons, arch gate and marquee around it.

A cup with real handles and a flared bowl is well beyond what stacked cylinders
manage, so this is genuine upside.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 1.8


def build():
    gc.clear_scene()
    root = gc.root_empty("HeroTrophy")

    m_gold = gc.material("Candy_Amber", 0xF2A93B, 0.3)
    m_plinth = gc.material("Frosting_Vanilla", gc.PALETTE["cream"], 0.6)
    m_star = gc.material("Frosting_Strawberry", gc.PALETTE["strawberry"], 0.4)

    # Frosting plinth.
    gc.cone("Plinth", m_plinth, 0.75, 0.62, 0.5, (0, 0, 0.25), root, verts=20)
    gc.cyl("PlinthBead", m_star, 0.64, 0.08, (0, 0, 0.52), root, verts=20)

    # Foot + stem.
    gc.cone("Foot", m_gold, 0.42, 0.3, 0.16, (0, 0, 0.64), root, verts=18)
    gc.cyl("Stem", m_gold, 0.11, 0.34, (0, 0, 0.89), root, verts=14)
    gc.cyl("StemCollar", m_gold, 0.2, 0.07, (0, 0, 1.06), root, verts=14)

    # Bowl — flares outward and upward, the shape that says "cup".
    gc.cone("Bowl", m_gold, 0.26, 0.52, 0.62, (0, 0, 1.41), root, verts=20)
    gc.cyl("BowlRim", m_gold, 0.545, 0.08, (0, 0, 1.7), root, verts=20)

    # Handles — a torus each side, the detail stacked cylinders cannot do.
    for i, sx in enumerate((-1, 1)):
        bpy_obj = gc.torus(f"Handle{i + 1}", m_gold, 0.2, 0.05, (sx * 0.5, 0, 1.45), root)
        bpy_obj.rotation_euler = (math.radians(90), 0, 0)

    # A little star on the cup face so it reads as a prize, not a goblet.
    gc.box("Star", m_star, (0.2, 0.06, 0.2), (0, -0.42, 1.45), root, rot_z=math.radians(45))

    # Cherry on top.
    gc.cherry("Finial", (0, 0, APEX_U - 0.05), root, radius=0.05)

    return root


def main():
    repo, blend_out, png_out = gc.paths(__file__, "hero-race-victory-lane")
    build()
    gc.export_glb(repo, "hero-race-victory-lane.glb")
    gc.render_preview(png_out, APEX_U, distance_mult=3.0)
    gc.save_blend(blend_out)


main()
