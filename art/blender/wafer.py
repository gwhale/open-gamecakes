"""Gamecakes — wafer biscuit, the flat "pebble" prop on open ground.

    blender --background --factory-startup --python art/blender/wafer.py

Replaces the plain 0.5 x 0.14 x 0.36 box in city3d.ts. Two scored biscuit
layers with a cream filling, so it reads as a wafer from the town camera.
No tint: every wafer is biscuit-coloured (WORLD.WAFER).
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 0.14
L, D = 0.5, 0.36
LAYER = 0.05


def build():
    gc.clear_scene()
    root = gc.root_empty("Wafer")

    m_wafer = gc.material("Wafer", 0xE7C48A, 0.8)
    m_score = gc.material("WaferScore", 0xC99A5B, 0.85)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)

    gc.box("Bottom", m_wafer, (L, D, LAYER), (0, 0, LAYER / 2), root)
    gc.box("Filling", m_cream, (L - 0.03, D - 0.03, APEX_U - 2 * LAYER), (0, 0, APEX_U / 2), root)
    gc.box("Top", m_wafer, (L, D, LAYER), (0, 0, APEX_U - LAYER / 2), root)

    # Scored grid on the top face: thin darker ridges, the wafer's tell.
    for i, x in enumerate((-0.15, -0.05, 0.05, 0.15)):
        gc.box(f"ScoreX{i}", m_score, (0.012, D - 0.04, 0.008), (x, 0, APEX_U + 0.002), root)
    for i, y in enumerate((-0.09, 0.0, 0.09)):
        gc.box(f"ScoreY{i}", m_score, (L - 0.04, 0.012, 0.008), (0, y, APEX_U + 0.002), root)

    return root


def main():
    build()
    gc.ship(__file__, "wafer", APEX_U + 0.006, distance_mult=5)


main()
