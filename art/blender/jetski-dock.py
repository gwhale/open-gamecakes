"""Gamecakes — a jet ski rental dock for the shore.

    blender --background --factory-startup --python art/blender/jetski-dock.py

A short wafer-biscuit jetty on chocolate posts, running out from the beach,
with a candy-striped flag pole at the landward end so a kid walking the coast
spots it from a distance, two life rings and a bollard. The jet ski itself is
its own model (jetski.py): it bobs beside the deck and is the ride.

The posts start at z = 0 (check:models wants it grounded); the deck top is at
DECK_Z. The town sinks the posts into the sea so the deck sits just above the
water. The landward end is +Y, the sea end -Y (glTF: sea end +Z), so the town
yaws the dock to face out to sea the same way it yaws a ride.
"""

import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

DECK_L = 3.0     # along Y, beach to sea
DECK_W = 1.2
DECK_T = 0.12
DECK_Z = 0.7     # deck top above the posts' feet
POLE_H = 2.0
APEX_U = DECK_Z + POLE_H + 0.3


def build():
    gc.clear_scene()
    root = gc.root_empty("Dock")

    m_wafer = gc.material("Wafer", 0xE8B96A, 0.75)
    m_wafer_line = gc.material("WaferLine", 0xC98F45, 0.8)
    m_post = gc.material("Chocolate", 0x6B3F24, 0.7)
    m_white = gc.material("Cream", gc.PALETTE["cream"], 0.5)
    m_red = gc.material("Strawberry", gc.PALETTE["strawberry"], 0.4)
    m_mint = gc.material("Mint", gc.PALETTE["mint"], 0.45)
    m_flag = gc.material("Blueberry", gc.PALETTE["blueberry"], 0.5)

    # ---- Deck: wafer planks across the jetty with darker gaps between them,
    # so it reads as a biscuit even from the chase camera.
    deck_mid = DECK_Z - DECK_T / 2
    gc.box("DeckBed", m_wafer_line, (DECK_W - 0.04, DECK_L - 0.04, DECK_T * 0.6), (0, 0, deck_mid - 0.02), root)
    planks = 10
    pitch = DECK_L / planks
    for i in range(planks):
        y = -DECK_L / 2 + pitch * (i + 0.5)
        gc.box(f"Plank{i}", m_wafer, (DECK_W, pitch * 0.86, DECK_T * 0.5), (0, y, DECK_Z - DECK_T * 0.25), root)
    # Edge rails, low, so the deck has a rim.
    for sx in (-1, 1):
        gc.box(f"Edge{sx}", m_wafer_line, (0.06, DECK_L, 0.08), (sx * (DECK_W / 2 - 0.03), 0, DECK_Z + 0.04), root)

    # ---- Posts: four pairs of chocolate sticks, the sea-end pair a touch taller.
    for i in range(4):
        y = -DECK_L / 2 + 0.18 + i * (DECK_L - 0.36) / 3
        for sx in (-1, 1):
            top = DECK_Z + (0.18 if i == 0 else 0.0)
            gc.cyl(f"Post{i}{sx}", m_post, 0.07, top, (sx * (DECK_W / 2 - 0.02), y, top / 2), root, verts=10)

    # Bollard at the sea end, where the jet ski ties up.
    gc.cyl("Bollard", m_post, 0.07, 0.18, (DECK_W / 2 - 0.2, -DECK_L / 2 + 0.25, DECK_Z + 0.09), root, verts=10)
    gc.ball("BollardCap", m_post, 0.09, (DECK_W / 2 - 0.2, -DECK_L / 2 + 0.25, DECK_Z + 0.19), root, segs=10, rings=6)

    # ---- Life rings: strawberry-and-cream, hung on the sea-end posts.
    for k, sx in enumerate((-1, 1)):
        ring = gc.torus(f"Ring{k}", m_red, 0.16, 0.045,
                        (sx * (DECK_W / 2 + 0.05), -DECK_L / 2 + 0.18, DECK_Z + 0.02), root, major=16, minor=8)
        ring.rotation_euler[1] = math.pi / 2
        for q in range(4):
            a = q * math.pi / 2 + math.pi / 4
            band = gc.box(f"RingBand{k}{q}", m_white, (0.1, 0.08, 0.1),
                          (sx * (DECK_W / 2 + 0.05), -DECK_L / 2 + 0.18 + math.cos(a) * 0.16,
                           DECK_Z + 0.02 + math.sin(a) * 0.16), root)
            band.rotation_euler[0] = a

    # ---- Flag pole at the beach end: candy-striped, mint pennant, cherry top.
    px, py = -DECK_W / 2 + 0.12, DECK_L / 2 - 0.15
    seg = POLE_H / 8
    for i in range(8):
        gc.cyl(f"Pole{i}", m_red if i % 2 == 0 else m_white, 0.05, seg,
               (px, py, DECK_Z + seg * (i + 0.5)), root, verts=10)
    flag = gc.cone("Pennant", m_mint, 0.22, 0.0, 0.6, (px + 0.3, py, DECK_Z + POLE_H - 0.2), root, verts=3, smooth=False)
    flag.rotation_euler[1] = math.pi / 2
    flag.scale = (1, 0.25, 1)
    stripe = gc.cone("PennantStripe", m_flag, 0.12, 0.0, 0.32, (px + 0.17, py, DECK_Z + POLE_H - 0.2), root, verts=3, smooth=False)
    stripe.rotation_euler[1] = math.pi / 2
    stripe.scale = (1, 0.3, 1)
    gc.cherry("PoleCherry", (px, py, DECK_Z + POLE_H + 0.08), root, radius=0.09)

    return root


def main():
    root = build()
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices)
    root.location.z -= low
    gc.ship(__file__, "jetski-dock", APEX_U, distance_mult=2.0)


main()
