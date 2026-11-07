"""Gamecakes — a candy planet for Musical Planets (the circle of fifths).

    blender --background --factory-startup --python art/blender/music-planet.py

Twelve of these sit on the circle, one per major key. The body is the `tint`
slot (each key has its own colour) and the Saturn ring is `tint2`. A cream
drizzle with drips caps the top (small, so the key's colour still reads from the space camera above) and sprinkles dot the sides, so it reads as a
frosted cake-pop rather than a plain ball.

Loaded at scale 1: body radius 0.5, base on z = 0.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402
import music_shapes as ms  # noqa: E402

R = 0.5
C = (0, 0, R)
CAP_R = R * 1.04
DRIPS = (0.3, 1.5, 2.6, 3.7, 5.0)


def drip_end(d):
    """How far down (degrees from the pole) the drip at angle `d` runs."""
    return 62 - (d * 7) % 14


def edge_at(theta):
    """The drizzle's lower edge, degrees from the pole: a gentle wave plus a
    smooth bump down the side for each drip."""
    e = 30 + 4 * math.sin(theta * 3)
    for d in DRIPS:
        gap = abs((theta - d + math.pi) % math.tau - math.pi)
        e += (drip_end(d) - 30) * math.exp(-((gap / 0.12) ** 2))
    return e


def drizzle(mat, parent):
    """A frosting shell a hair proud of the body, from the pole down to a
    smooth wavy edge with drips. Built ring by ring rather than cut from a UV
    sphere, so the edge follows the curve instead of stair-stepping."""
    cols, rows = 80, 6
    mesh = bpy.data.meshes.new("Drizzle")
    bm = bmesh.new()
    pole = bm.verts.new(Vector(C) + Vector((0, 0, CAP_R)))
    grid = []
    for r in range(1, rows + 1):
        row = []
        for i in range(cols):
            theta = i / cols * math.tau
            polar = math.radians(edge_at(theta)) * (r / rows) ** 0.85
            n = Vector((math.sin(polar) * math.cos(theta), math.sin(polar) * math.sin(theta), math.cos(polar)))
            row.append(bm.verts.new(Vector(C) + n * CAP_R))
        grid.append(row)
    for i in range(cols):
        j = (i + 1) % cols
        bm.faces.new((pole, grid[0][i], grid[0][j]))
        for r in range(rows - 1):
            bm.faces.new((grid[r][i], grid[r + 1][i], grid[r + 1][j], grid[r][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    cap = bpy.data.objects.new("Drizzle", mesh)
    bpy.context.collection.objects.link(cap)
    cap.data.materials.append(mat)
    cap.parent = parent
    for p in cap.data.polygons:
        p.use_smooth = True
    # A bead at the end of each drip, so it ends round instead of square.
    for i, d in enumerate(DRIPS):
        polar = math.radians(drip_end(d))
        n = Vector((math.sin(polar) * math.cos(d), math.sin(polar) * math.sin(d), math.cos(polar)))
        gc.ball(f"DripBead{i}", mat, 0.05, Vector(C) + n * R * 1.0, parent, segs=8, rings=5)


def sprinkles(parent):
    rng = random.Random(7)
    cols = ["strawberry", "mint", "vanilla", "blueberry", "cherry", "cream"]
    for i in range(14):
        polar = math.radians(rng.uniform(40, 116))
        theta = i / 14 * math.tau + rng.uniform(-0.2, 0.2)
        n = Vector((math.sin(polar) * math.cos(theta), math.sin(polar) * math.sin(theta), math.cos(polar)))
        tangent = n.cross(Vector((0, 0, 1))).normalized()
        tangent = tangent.lerp(n.cross(tangent), rng.uniform(-0.7, 0.7)).normalized()
        name = cols[i % len(cols)]
        mat = gc.material(name.title(), gc.PALETTE[name], 0.35)
        s = gc.cyl(f"Sprinkle{i}", mat, 0.02, 0.085, Vector(C) + n * (R + 0.01), parent, verts=6)
        ms.orient(s, tangent)


def build():
    gc.clear_scene()
    root = gc.root_empty("Planet")
    gc.ball("Body", gc.tint("tint", 0.4), R, C, root, segs=28, rings=14)
    ring = gc.torus("Ring", gc.tint("tint2", 0.35), 0.8, 0.05, C, root, major=40, minor=6)
    ring.scale = (1, 1, 0.45)
    ring.rotation_euler[0] = math.radians(22)
    drizzle(gc.material("Cream", gc.PALETTE["cream"], 0.45), root)
    sprinkles(root)
    return root


build()
ms.ground()
gc.ship(__file__, "music-planet", 1.0, distance_mult=2.6, subdir="music")
