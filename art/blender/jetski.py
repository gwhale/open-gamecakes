"""Gamecakes — the rental jet ski.

    blender --background --factory-startup --python art/blender/jetski.py

A candy jet ski for the shore docks: a strawberry hull with a cream deck, a
mint racing stripe, a chocolate saddle the cupcake sits on, handlebars with
cherry grips, a little windscreen and a jet nozzle at the stern. One mesh, one
atlas: the town recolours nothing on it.

Sized against the cupcake (about 0.75 units tall): the saddle top sits at
SEAT_Z, which is `seatOffsetU` in src/lib/town/vehicles.ts. The hull bottom is
z = 0 so check:models sees it grounded; the town sinks it into the water by
its own draught, not here.

Blender Z-up: the bow is -Y (glTF +Z, the way every ride faces).
"""

import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

L = 1.7         # bow to stern, along Y
W = 0.72        # beam, along X
HULL_H = 0.3
SEAT_Z = 0.46
APEX_U = 0.8


def build():
    gc.clear_scene()
    root = gc.root_empty("JetSki")

    m_hull = gc.material("Strawberry", gc.PALETTE["strawberry"], 0.35)
    m_hull_dark = gc.material("StrawberryDeep", 0xE04D68, 0.4)
    m_deck = gc.material("Cream", gc.PALETTE["cream"], 0.5)
    m_stripe = gc.material("Mint", gc.PALETTE["mint"], 0.4)
    m_seat = gc.material("Chocolate", 0x6B3F24, 0.65)
    m_metal = gc.material("Licorice", 0x2B2B33, 0.45)
    m_grip = gc.material("Cherry", gc.PALETTE["cherry"], 0.3)
    m_glass = gc.material("Glass", 0xBFE8FF, 0.1)
    m_bumper = gc.material("Vanilla", gc.PALETTE["vanilla"], 0.5)

    # ---- Hull: a long flattened pebble with a pointed, lifted bow.
    hull = gc.ball("Hull", m_hull, 0.5, (0, 0.12, HULL_H / 2), root, segs=24, rings=12)
    hull.scale = (W / 2 / 0.5, L * 0.38 / 0.5, HULL_H / 2 / 0.5)
    bow = gc.cone("Bow", m_hull, 0.5, 0.06, 0.5, (0, -L * 0.3, HULL_H * 0.55), root, verts=20)
    bow.rotation_euler[0] = math.pi / 2 + 0.12   # apex forward (-Y), tipped up
    bow.scale = (W * 0.98, HULL_H * 1.0, L * 0.72)
    # A darker keel band below the waterline so the hull reads as a boat.
    keel = gc.ball("Keel", m_hull_dark, 0.5, (0, 0.12, HULL_H * 0.3), root, segs=24, rings=8)
    keel.scale = (W * 1.02 / 2 / 0.5, L * 0.385 / 0.5, 0.05 / 0.5)
    # Mint racing stripe: a thin slice of the hull's own shape, a hair proud of
    # it, so it wraps the sides instead of floating beside them.
    stripe = gc.ball("Stripe", m_stripe, 0.5, (0, 0.12, HULL_H * 0.66), root, segs=24, rings=8)
    stripe.scale = (W * 0.97 / 2 / 0.5, L * 0.375 / 0.5, 0.035 / 0.5)

    # ---- Deck: a cream top plate following the hull.
    deck = gc.ball("Deck", m_deck, 0.5, (0, 0.14, HULL_H * 0.93), root, segs=20, rings=8)
    deck.scale = (W * 0.4 / 0.5, L * 0.33 / 0.5, 0.05 / 0.5)
    # Soft vanilla bumper round the stern, like a gumdrop rim.
    gc.torus("Bumper", m_bumper, W * 0.34, 0.04, (0, L * 0.36, HULL_H * 0.5), root, major=18, minor=8)
    bpy.context.active_object.scale = (1, 0.5, 1)

    # ---- Saddle: a slim chocolate bolster the cupcake sits astride.
    seat = gc.ball("Saddle", m_seat, 0.5, (0, 0.24, SEAT_Z - 0.05), root, segs=16, rings=8)
    seat.scale = (0.2 / 0.5, 0.5 / 0.5, 0.1 / 0.5)
    gc.box("SeatBase", m_deck, (0.22, 0.46, 0.1), (0, 0.24, HULL_H * 0.93 + 0.04), root)

    # ---- Steering column, bars and cherry grips.
    col = gc.cyl("Column", m_metal, 0.045, 0.32, (0, -0.2, HULL_H + 0.14), root, verts=10)
    col.rotation_euler[0] = -0.45
    gc.box("Pod", m_hull, (0.3, 0.2, 0.12), (0, -0.27, HULL_H + 0.27), root)
    bar = gc.cyl("Bar", m_metal, 0.025, 0.62, (0, -0.25, HULL_H + 0.34), root, verts=8)
    bar.rotation_euler[1] = math.pi / 2
    for sx in (-1, 1):
        g = gc.cyl(f"Grip{sx}", m_grip, 0.04, 0.12, (sx * 0.31, -0.25, HULL_H + 0.34), root, verts=10)
        g.rotation_euler[1] = math.pi / 2
    # Windscreen: a tilted tinted plate ahead of the bars.
    ws = gc.box("Windscreen", m_glass, (0.34, 0.02, 0.16), (0, -0.4, HULL_H + 0.3), root)
    ws.rotation_euler[0] = 0.55
    # A cherry on the nose — every Gamecakes thing gets one.
    gc.cherry("NoseCherry", (0, -L * 0.48, HULL_H * 0.78), root, radius=0.07)

    # ---- Stern: the jet nozzle and a footwell lip each side.
    noz = gc.cyl("Nozzle", m_metal, 0.08, 0.14, (0, L * 0.47, HULL_H * 0.32), root, verts=12)
    noz.rotation_euler[0] = math.pi / 2

    return root


def main():
    root = build()
    # Sit the lowest vertex exactly on z = 0 (check:models wants it grounded).
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices)
    root.location.z -= low
    gc.ship(__file__, "jetski", APEX_U, distance_mult=2.4)


main()
