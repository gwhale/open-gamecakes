"""Gamecakes — Castle (land evolution level 3) reference asset.

    blender --background --factory-startup --python art/blender/land-castle.py

Spec it must hit (src/lib/town/three/land-structure.ts):
  "Castle — a magnificent multi-tower cake keep: a tiered motte, four corner
   spires, a curtain wall, and a central keep whose apex reaches ~ 18u — over 3x
   the arch gate it replaces as the land's hero."

This is the top of the ladder, so it has to feel like a reward: broad footprint,
many towers, and tall enough to dominate from anywhere on the map.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 18.0

MOTTE_TOP = 1.6
WALL_HALF = 3.0        # curtain wall is a square of this half-extent
WALL_TOP = 3.6
TOWER_TOP = 7.4
KEEP_R = 1.75
KEEP_TOP = 11.6


def build():
    gc.clear_scene()
    root = gc.root_empty("LandCastle")

    m_motte = gc.material("Cake_Chocolate", gc.PALETTE["chocolate"], 0.85)
    m_wall = gc.material("Cake_Vanilla", gc.PALETTE["vanilla"], 0.7)
    m_keep = gc.material("Cake_Strawberry", gc.PALETTE["strawberry"], 0.7)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_roof = gc.material("Roof_Pink", gc.PALETTE["roof"], 0.5)
    m_spire = gc.material("Frosting_Blueberry", gc.PALETTE["blueberry"], 0.5)
    m_door = gc.material("Door_Chocolate", gc.PALETTE["door"], 0.75)
    m_window = gc.material("Window_Mint", gc.PALETTE["mint"], 0.35)

    # --- Tiered motte ------------------------------------------------------
    gc.cyl("MotteLower", m_motte, 4.5, 0.9, (0, 0, 0.45), root, verts=20)
    gc.cyl("MotteUpper", m_motte, 3.95, 0.7, (0, 0, 1.25), root, verts=20)
    gc.cyl("MotteIcing", m_cream, 4.0, 0.16, (0, 0, 0.9), root, verts=20)

    # --- Curtain wall (square) --------------------------------------------
    wall_h = WALL_TOP - MOTTE_TOP
    wall_z = MOTTE_TOP + wall_h / 2
    span = WALL_HALF * 2
    for name, size, at in (
        ("WallN", (span, 0.4, wall_h), (0, WALL_HALF, wall_z)),
        ("WallS", (span, 0.4, wall_h), (0, -WALL_HALF, wall_z)),
        ("WallE", (0.4, span, wall_h), (WALL_HALF, 0, wall_z)),
        ("WallW", (0.4, span, wall_h), (-WALL_HALF, 0, wall_z)),
    ):
        gc.box(name, m_wall, size, at, root)

    # Merlons along each wall top. Ring-shaped crenellate() is for the round
    # keep; a square wall needs them laid out linearly.
    per_side = 6
    for s in range(per_side):
        t = (s + 0.5) / per_side
        u = -WALL_HALF + span * t
        for name, at in (
            (f"MerlonN{s}", (u, WALL_HALF, WALL_TOP + 0.17)),
            (f"MerlonS{s}", (u, -WALL_HALF, WALL_TOP + 0.17)),
            (f"MerlonE{s}", (WALL_HALF, u, WALL_TOP + 0.17)),
            (f"MerlonW{s}", (-WALL_HALF, u, WALL_TOP + 0.17)),
        ):
            gc.box(name, m_cream, (0.34, 0.34, 0.34), at, root)

    # Gatehouse door, set into the south wall facing the camera/approach.
    gc.box("Gate", m_door, (1.05, 0.2, 1.5), (0, -WALL_HALF - 0.06, MOTTE_TOP + 0.75), root)
    gc.box("GateArch", m_cream, (1.35, 0.14, 0.24), (0, -WALL_HALF - 0.1, MOTTE_TOP + 1.6), root)

    # --- Four corner spires ------------------------------------------------
    tower_h = TOWER_TOP - MOTTE_TOP
    for i, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        cx, cy = sx * WALL_HALF, sy * WALL_HALF
        gc.cyl(f"Tower{i}", m_wall, 0.82, tower_h, (cx, cy, MOTTE_TOP + tower_h / 2), root, verts=14)
        gc.cyl(f"TowerBand{i}", m_cream, 0.9, 0.16, (cx, cy, TOWER_TOP - 0.5), root, verts=14)
        roof_h = 1.7
        gc.cone(f"TowerRoof{i}", m_spire, 1.0, 0, roof_h, (cx, cy, TOWER_TOP + roof_h / 2), root, verts=14)
        gc.cherry(f"TowerCherry{i}", (cx, cy, TOWER_TOP + roof_h + 0.12), root, radius=0.13)
        # One window each, facing outward along the diagonal.
        a = math.atan2(sy, sx)
        gc.box(
            f"TowerWindow{i}",
            m_window,
            (0.26, 0.26, 0.34),
            (cx + math.cos(a) * 0.8, cy + math.sin(a) * 0.8, MOTTE_TOP + tower_h * 0.62),
            root,
            rot_z=a,
        )

    # --- Central keep ------------------------------------------------------
    keep_h = KEEP_TOP - MOTTE_TOP
    gc.cyl("Keep", m_keep, KEEP_R, keep_h, (0, 0, MOTTE_TOP + keep_h / 2), root, verts=18)
    # Two frosting bands so the keep reads as stacked cake tiers, not a pipe.
    for i, z in enumerate((MOTTE_TOP + keep_h * 0.34, MOTTE_TOP + keep_h * 0.67)):
        gc.cyl(f"KeepBand{i + 1}", m_cream, KEEP_R + 0.13, 0.22, (0, 0, z), root, verts=18)
    gc.crenellate(root, m_cream, KEEP_TOP, KEEP_R + 0.05, 12, block=0.3, height=0.42)

    # Keep windows, spiralling so the height reads as storeys.
    for i, t in enumerate((0.22, 0.42, 0.62, 0.82)):
        z = MOTTE_TOP + keep_h * t
        a = i * 1.3 - math.pi / 2
        gc.box(
            f"KeepWindow{i + 1}",
            m_window,
            (0.36, 0.36, 0.44),
            (math.cos(a) * KEEP_R * 0.98, math.sin(a) * KEEP_R * 0.98, z),
            root,
            rot_z=a,
        )

    # --- Keep roof + finial, landing exactly on the apex -------------------
    roof_base = KEEP_TOP + 0.42
    pole_h = 1.25
    cherry_r = 0.26
    roof_h = APEX_U - roof_base - pole_h - cherry_r * 2
    gc.cone("KeepRoof", m_roof, KEEP_R + 0.45, 0, roof_h, (0, 0, roof_base + roof_h / 2), root, verts=18)
    for i, t in enumerate((0.28, 0.58)):
        gc.cyl(
            f"KeepRoofBand{i + 1}", m_cream,
            (KEEP_R + 0.45) * (1 - t) + 0.05, 0.12,
            (0, 0, roof_base + roof_h * t), root, verts=18,
        )

    pole_z = roof_base + roof_h
    gc.cyl("Pole", m_cream, 0.06, pole_h, (0, 0, pole_z + pole_h / 2), root, verts=8)
    gc.box("Pennant", m_spire, (0.9, 0.04, 0.5), (0.46, 0, pole_z + pole_h * 0.74), root)
    gc.cherry("Finial", (0, 0, APEX_U - cherry_r), root, radius=cherry_r)

    return root


def main():
    repo, blend_out, png_out = gc.paths(__file__, "land-castle")
    build()
    gc.export_glb(repo, "land-castle.glb")
    gc.render_preview(png_out, APEX_U, distance_mult=1.5)
    gc.save_blend(blend_out)


main()
