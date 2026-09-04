"""Gamecakes — Cottage (land evolution level 1) reference asset.

    blender --background --factory-startup --python art/blender/land-cottage.py

Spec it must hit (src/lib/town/three/land-structure.ts):
  "Cottage — wide, low, cozy: a squat cake body under a broad pitched roof
   (apex ~ 2.9u)."

Squat and WIDE is the whole read — it is the first upgrade a kid earns, and it
has to be unmistakable next to the Tower (tall + slender) that follows it.

Shared palette, primitives, export and preview helpers live in gamecakes.py.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 2.9

BODY_W, BODY_D, BODY_H = 2.2, 1.8, 1.15


def build():
    gc.clear_scene()
    root = gc.root_empty("LandCottage")

    m_body = gc.material("Cake_Strawberry", gc.PALETTE["strawberry"], 0.7)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_roof = gc.material("Roof_Pink", gc.PALETTE["roof"], 0.5)
    m_door = gc.material("Door_Chocolate", gc.PALETTE["door"], 0.75)
    m_window = gc.material("Window_Vanilla", gc.PALETTE["vanilla"], 0.3)

    half_w, half_d = BODY_W / 2, BODY_D / 2

    # Body — squat, wide cake block, sitting ON z=0.
    gc.box("Body", m_body, (BODY_W, BODY_D, BODY_H), (0, 0, BODY_H / 2), root)

    # Frosting band straddling the top edge. A BOX, not a cylinder — a round
    # band inside a square body only pokes out at the middle of each face and
    # reads as four stray white flaps at the corners.
    gc.box("FrostingBand", m_cream, (BODY_W + 0.18, BODY_D + 0.18, 0.2), (0, 0, BODY_H), root)

    # Broad, shallow pitched roof. A tall spike would read as the Tower
    # silhouette, which is the next stage and must stay distinct.
    roof_base = BODY_H + 0.05
    cherry_r = 0.15
    roof_h = (APEX_U - cherry_r * 2) - roof_base
    gc.cone(
        "Roof", m_roof, half_w * 1.52, 0, roof_h,
        (0, 0, roof_base + roof_h / 2), root, verts=4, smooth=False,
        rot_z=math.radians(45),
    )

    # Cherry finial, its top landing exactly on the target apex.
    gc.cherry("CherryFinial", (0, 0, APEX_U - cherry_r), root, radius=cherry_r)

    # Door and windows flush against the front face.
    gc.box("Door", m_door, (0.46, 0.08, 0.68), (0, -half_d, 0.34), root)
    for i, x in enumerate((-0.66, 0.66)):
        gc.box(f"Window{i + 1}", m_window, (0.36, 0.06, 0.36), (x, -half_d, 0.78), root)

    return root


def main():
    repo, blend_out, png_out = gc.paths(__file__, "land-cottage")
    build()
    gc.export_glb(repo, "land-cottage.glb")
    gc.render_preview(png_out, APEX_U, distance_mult=2.6)
    gc.save_blend(blend_out)


main()
