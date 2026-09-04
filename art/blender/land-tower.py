"""Gamecakes — Tower (land evolution level 2) reference asset.

    blender --background --factory-startup --python art/blender/land-tower.py

Spec it must hit (src/lib/town/three/land-structure.ts):
  "Tower — tall + slender: a single tapering cake spire with a candy-cane roof
   and a pennant (apex ~ 9.3u)."

The silhouette has to be unmistakable from across the map at a glance, and
clearly distinct from the Cottage below it (squat + wide) and the Castle above
it (broad + many-towered). So: narrow footprint, strong vertical taper.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 9.3


def build():
    gc.clear_scene()
    root = gc.root_empty("LandTower")

    m_base = gc.material("Cake_Chocolate", gc.PALETTE["chocolate"], 0.8)
    m_body = gc.material("Cake_Strawberry", gc.PALETTE["strawberry"], 0.7)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)
    m_mint = gc.material("Frosting_Mint", gc.PALETTE["mint"], 0.5)
    m_roof = gc.material("Roof_Pink", gc.PALETTE["roof"], 0.5)
    m_window = gc.material("Window_Vanilla", gc.PALETTE["vanilla"], 0.3)
    m_door = gc.material("Door_Chocolate", gc.PALETTE["door"], 0.75)

    # Plinth — a wider chocolate tier so the spire does not look stuck in the mud.
    gc.cyl("Plinth", m_base, 1.35, 0.45, (0, 0, 0.225), root, verts=16)

    # Shaft — one tapering cake spire. Two stacked cones read as a piped tier
    # without needing a lathe.
    gc.cone("ShaftLower", m_body, 1.12, 0.92, 3.0, (0, 0, 0.45 + 1.5), root)
    gc.cyl("DripBand", m_cream, 0.99, 0.26, (0, 0, 3.45), root)
    gc.cone("ShaftUpper", m_mint, 0.9, 0.72, 2.6, (0, 0, 3.58 + 1.3), root)

    # Balcony ring under the roof — the classic tower read.
    balcony_z = 6.18
    gc.cyl("Balcony", m_cream, 1.08, 0.2, (0, 0, balcony_z), root)
    gc.crenellate(root, m_cream, balcony_z + 0.1, 0.98, 10, block=0.17, height=0.26)

    # Candy-cane roof — a tall cone banded with cream rings.
    #
    # First attempt used small boxes placed at radius*0.5, i.e. INSIDE the cone,
    # so they rendered as a few stray specks. Rings sized to the cone's radius at
    # their own height are both simpler and actually read as candy stripes.
    roof_base = balcony_z + 0.1
    pole_h = 0.75
    cherry_r = 0.14
    roof_h = APEX_U - roof_base - pole_h - cherry_r
    ROOF_R = 0.92
    gc.cone("Roof", m_roof, ROOF_R, 0, roof_h, (0, 0, roof_base + roof_h / 2), root, verts=16)

    for i, t in enumerate((0.18, 0.42, 0.66)):
        z = roof_base + roof_h * t
        # Slightly proud of the cone surface at this height so the band shows.
        gc.cyl(f"RoofBand{i + 1}", m_cream, ROOF_R * (1 - t) + 0.045, 0.1, (0, 0, z), root, verts=16)

    # Pennant pole + flag + cherry, landing exactly on the apex.
    pole_z = roof_base + roof_h
    gc.cyl("Pole", m_cream, 0.045, pole_h, (0, 0, pole_z + pole_h / 2), root, verts=8)
    gc.box("Pennant", m_mint, (0.62, 0.03, 0.34), (0.32, 0, pole_z + pole_h * 0.72), root)
    gc.cherry("Finial", (0, 0, APEX_U - cherry_r), root, radius=cherry_r)

    # Door + a spiral of windows so the height reads as storeys, not a blank cone.
    #
    # Openings must sit ON the tapering surface. A hand-guessed linear radius put
    # some of them inside the shaft and left others hanging in mid-air, so the
    # taper is solved properly here from the two cone sections above.
    def radius_at(z: float) -> float:
        if z <= 3.45:  # ShaftLower: 1.12 -> 0.92 across z 0.45..3.45
            return 1.12 + (0.92 - 1.12) * max(0.0, (z - 0.45)) / 3.0
        return 0.9 + (0.72 - 0.9) * min(1.0, (z - 3.58) / 2.6)  # ShaftUpper

    door_z = 0.45 + 0.39
    gc.box("Door", m_door, (0.5, 0.12, 0.78), (0, -radius_at(door_z) * 0.99, door_z), root)

    for i, z in enumerate((1.55, 2.6, 4.2, 5.25)):
        a = i * 1.15 - math.pi / 2
        r = radius_at(z) * 0.98  # bedded slightly into the surface
        gc.box(
            f"Window{i + 1}",
            m_window,
            (0.32, 0.32, 0.32),
            (math.cos(a) * r, math.sin(a) * r, z),
            root,
            rot_z=a,
        )

    return root


def main():
    repo, blend_out, png_out = gc.paths(__file__, "land-tower")
    build()
    gc.export_glb(repo, "land-tower.glb")
    gc.render_preview(png_out, APEX_U)
    gc.save_blend(blend_out)


main()
