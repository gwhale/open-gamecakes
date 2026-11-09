"""Gamecakes — Cakey's rocket for Musical Planets.

    blender --background --factory-startup --python art/blender/music-rocket.py

The kid flies it from planet to planet round the circle of fifths. A cream
egg of a body with a strawberry band, a strawberry nose cone with a cherry,
a blueberry porthole facing the camera (-Y here, +Z in three), three mint
fins and a chocolate nozzle. The flame is a glow sprite in code.

Nose points up (+Z, three +Y). One unit tall, nozzle bottom on z = 0.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

BODY_R = 0.2
BODY_Z = 0.4      # centre of the egg
BODY_HALF = 0.32  # half its height


def body_radius(z):
    t = (z - BODY_Z) / BODY_HALF
    return BODY_R * math.sqrt(max(0.0, 1 - t * t))


def build():
    gc.clear_scene()
    root = gc.root_empty("Rocket")

    m_cream = gc.material("Cream", gc.PALETTE["cream"], 0.4)
    m_red = gc.material("Strawberry", gc.PALETTE["strawberry"], 0.35)
    m_choc = gc.material("Chocolate", gc.PALETTE["chocolate"], 0.5)
    m_mint = gc.material("Mint", gc.PALETTE["mint"], 0.4)
    m_glass = gc.material("Blueberry", gc.PALETTE["blueberry"], 0.15)

    # ---- Body, band, nose.
    egg = gc.ball("Body", m_cream, BODY_R, (0, 0, BODY_Z), root, segs=24, rings=14)
    egg.scale = (1, 1, BODY_HALF / BODY_R)
    gc.torus("Band", m_red, body_radius(0.36) + 0.004, 0.026, (0, 0, 0.36), root, major=28, minor=8)
    nose_z0 = 0.62
    gc.cone("Nose", m_red, body_radius(nose_z0) + 0.012, 0.025, 0.3, (0, 0, nose_z0 + 0.15), root, verts=24)
    gc.cherry("NoseCherry", (0, 0, 0.94), root, radius=0.06)

    # ---- Porthole toward the camera.
    pz = 0.47
    py = -body_radius(pz) + 0.01
    rim = gc.torus("PortRim", m_cream, 0.068, 0.02, (0, py - 0.012, pz), root, major=20, minor=6)
    rim.rotation_euler[0] = math.pi / 2
    glass = gc.ball("Porthole", m_glass, 0.062, (0, py, pz), root, segs=16, rings=8)
    glass.scale = (1, 0.45, 1)

    # ---- Three fins, one straight back (+Y), two forward-left and -right, so
    # none of them hides the porthole.
    fin = [(0.1, 0.38), (0.1, 0.06), (0.3, -0.02), (0.31, 0.12), (0.22, 0.28)]
    for k in range(3):
        f = ms.prism(f"Fin{k}", m_mint, fin, 0.04, root, bevel=0.016)
        f.rotation_euler[2] = math.pi / 2 + k * math.tau / 3

    # ---- Nozzle.
    gc.cone("Nozzle", m_choc, 0.12, 0.09, 0.1, (0, 0, 0.05), root, verts=20)
    return root


build()
ms.ground()
gc.ship(__file__, "music-rocket", 1.0, distance_mult=2.2, subdir="music")
