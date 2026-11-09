"""Gamecakes — the treasure chest, for the deep and for the land.

    blender --background --factory-startup --python art/blender/chest.py

A chocolate chest with a domed lid, brass straps and a lock plate, full of
gold coins and three sweets-gems. One model serves both places: the deep scales
it to 3.2 m wide, the town to under a grid square.

TWO NODES, NOT ONE. The lid swings on a hinge at runtime, so it cannot be
joined into the body like every other asset. The GLB carries `ChestBody` and
`ChestLid`, sharing one atlas, with ChestLid's origin ON the hinge (the back
top edge) — rotate it about X and it opens. Two draw calls, which is the
override in scripts/assets/check-models.mjs.

THE BODY IS HOLLOW AND FULL. A shut chest hides the coins inside the lid; an
open one shows a heap that rises above the rim, so an opened chest reads as
open from further away than a raised lid alone does (measured 2.5% of the
frame at 16 m with the old code-built box, which had no contents at all).

Blender Z-up: front is -Y, back (hinge) is +Y.
"""

import math
import os
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

W = 1.6        # along X
D = 1.1        # along Y
BODY_H = 0.62
LID_H = 0.38   # dome rise above the rim
WALL = 0.08
APEX_U = BODY_H + LID_H

HINGE = (0.0, D / 2, BODY_H)


def half_cyl(name, mat, radius, length, at, parent, z_scale=1.0, verts=18):
    """A cylinder along X cut to its upper half and capped flat: the lid's dome."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=length, vertices=verts, location=at, rotation=(0, math.pi / 2, 0)
    )
    obj = gc.finish(name, mat, parent)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
    open_edges = [e for e in bm.edges if e.is_boundary]
    bmesh.ops.holes_fill(bm, edges=open_edges, sides=0)
    for f in bm.faces:
        # Curved faces smooth; the flat underside and end caps stay crisp.
        f.smooth = abs(f.normal.x) < 0.5 and f.normal.z > -0.5
    bm.to_mesh(obj.data)
    bm.free()
    obj.scale = (1, 1, z_scale)
    return obj


def build():
    gc.clear_scene()
    body = gc.root_empty("Body")
    lid = gc.root_empty("Lid")

    m_wood = gc.material("Chocolate", 0x7C4B2A, 0.7)
    m_wood_dark = gc.material("ChocolateDark", 0x5A3520, 0.75)
    m_brass = gc.material("Brass", 0xD9A441, 0.3)
    m_gold = gc.material("Gold", 0xFACC15, 0.25)
    m_keyhole = gc.material("Keyhole", 0x2A1A10, 0.8)
    gems = [
        gc.material("Gem_Cherry", gc.PALETTE["cherry"], 0.2),
        gc.material("Gem_Mint", gc.PALETTE["mint"], 0.2),
        gc.material("Gem_Berry", gc.PALETTE["blueberry"], 0.2),
    ]

    # ---- Body: floor + four walls, hollow so the coins sit INSIDE it.
    gc.box("Floor", m_wood_dark, (W, D, WALL), (0, 0, WALL / 2), body)
    gc.box("WallFront", m_wood, (W, WALL, BODY_H), (0, -D / 2 + WALL / 2, BODY_H / 2), body)
    gc.box("WallBack", m_wood, (W, WALL, BODY_H), (0, D / 2 - WALL / 2, BODY_H / 2), body)
    gc.box("WallLeft", m_wood, (WALL, D - 2 * WALL, BODY_H), (-W / 2 + WALL / 2, 0, BODY_H / 2), body)
    gc.box("WallRight", m_wood, (WALL, D - 2 * WALL, BODY_H), (W / 2 - WALL / 2, 0, BODY_H / 2), body)

    # Brass: a band round the base, two vertical straps, corner caps, lock.
    gc.box("BaseBand", m_brass, (W + 0.04, D + 0.04, 0.07), (0, 0, 0.06), body)
    for sx in (-1, 1):
        x = sx * W * 0.3
        gc.box(f"StrapFront{sx}", m_brass, (0.1, 0.03, BODY_H), (x, -D / 2 - 0.01, BODY_H / 2), body)
        gc.box(f"StrapBack{sx}", m_brass, (0.1, 0.03, BODY_H), (x, D / 2 + 0.01, BODY_H / 2), body)
        for sy in (-1, 1):
            gc.box(f"Corner{sx}{sy}", m_brass, (0.1, 0.1, BODY_H + 0.02),
                   (sx * (W / 2 - 0.02), sy * (D / 2 - 0.02), BODY_H / 2), body)
    gc.box("LockPlate", m_brass, (0.24, 0.04, 0.26), (0, -D / 2 - 0.02, BODY_H - 0.13), body)
    gc.cyl("Keyhole", m_keyhole, 0.035, 0.02, (0, -D / 2 - 0.045, BODY_H - 0.11), body, verts=8, smooth=False)
    bpy.context.active_object.rotation_euler[0] = math.pi / 2

    # ---- Treasure: a flattened gold heap peaking above the rim, coins
    # scattered on it, three gems. Hidden inside the dome when shut.
    heap = gc.ball("Heap", m_gold, 0.5, (0, 0, BODY_H - 0.16), body, segs=14, rings=7)
    heap.scale = (1.35, 0.85, 0.55)
    for i in range(7):
        a = i * math.tau / 7 + 0.3
        r = 0.18 + 0.2 * ((i * 37) % 5) / 5
        coin = gc.cyl(f"Coin{i}", m_gold, 0.075, 0.025,
                      (math.cos(a) * r * 1.3, math.sin(a) * r * 0.75, BODY_H + 0.08 - r * 0.18),
                      body, verts=10)
        coin.rotation_euler = (0.5 * math.sin(i), 0.4 * math.cos(i * 1.7), 0)
    for i, m in enumerate(gems):
        a = i * math.tau / 3 + 1.0
        gc.ball(f"Gem{i}", m, 0.07, (math.cos(a) * 0.3, math.sin(a) * 0.18, BODY_H + 0.1), body, segs=6, rings=4)

    # ---- Lid: a dome across the full width, straps over it, a brass hasp.
    half_cyl("Dome", m_wood, D / 2, W, (0, 0, BODY_H), lid, z_scale=LID_H / (D / 2))
    # Straps and rim must not share the dome's flat underside plane: they did,
    # and an open lid showed brass z-fighting across its inside. The straps sit
    # a hair above it (their own underside hidden inside the dome) and the rim
    # is a frame round the edge, not a slab across it.
    for sx in (-1, 1):
        half_cyl(f"LidStrap{sx}", m_brass, D / 2 + 0.02, 0.1, (sx * W * 0.3, 0, BODY_H + 0.004), lid,
                 z_scale=(LID_H + 0.02) / (D / 2 + 0.02))
    rim_h, rim_t = 0.05, 0.05
    gc.box("RimFront", m_brass, (W + 0.04, rim_t, rim_h), (0, -D / 2 - 0.02 + rim_t / 2, BODY_H + rim_h / 2), lid)
    gc.box("RimBack", m_brass, (W + 0.04, rim_t, rim_h), (0, D / 2 + 0.02 - rim_t / 2, BODY_H + rim_h / 2), lid)
    gc.box("RimLeft", m_brass, (rim_t, D - 0.06, rim_h), (-W / 2 - 0.02 + rim_t / 2, 0, BODY_H + rim_h / 2), lid)
    gc.box("RimRight", m_brass, (rim_t, D - 0.06, rim_h), (W / 2 + 0.02 - rim_t / 2, 0, BODY_H + rim_h / 2), lid)
    gc.box("Hasp", m_brass, (0.14, 0.04, 0.16), (0, -D / 2 - 0.03, BODY_H + 0.02), lid)

    return body, lid


def main():
    body, lid = build()
    gc.ship(
        __file__, "chest", APEX_U, distance_mult=2.6,
        groups=[("ChestBody", body, (0, 0, 0)), ("ChestLid", lid, HINGE)],
    )


main()
