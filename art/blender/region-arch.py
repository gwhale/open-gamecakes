"""Gamecakes — the candy-cane arch gate at the front of each land.

    blender --background --factory-startup --python art/blender/region-arch.py

Replaces the posts, beam and cherry in `makeRegionArch` (city3d.ts). The land
name marquee stays in code: it is text.

Spec, from makeRegionArch: two 3.0-tall posts (radius 0.18 at the foot) at
x = +-2.6, joined by a half-round beam of radius 2.6 and tube 0.22 on top of
the posts, with a 0.26 cherry keystone whose centre is at 3 + 2.6 + 0.1.
archW is min(0.62 x land width, 5.2) and every land is at least 4 tiles
(8.8u) wide, so in practice it is always 5.2; the town still scales x by
archW / 5.2 in case a narrow land ever appears.

Two TINT slots: `tint` is the land's ribbon colour (the beam), `tint2` its
deep ribbon colour (the cane stripes).
"""

import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

HALF = 2.6
POST_H = 3.0
CHERRY_R = 0.26
APEX_U = POST_H + HALF + 0.1 + CHERRY_R


def helix(name, mat, radius, tube, z0, z1, turns, phase, parent=None):
    """A tube wound round a post: the candy-cane stripe as real geometry."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = tube
    curve.bevel_resolution = 0
    spline = curve.splines.new("POLY")
    steps = int(turns * 14)
    spline.points.add(steps)
    for i in range(steps + 1):
        t = i / steps
        a = phase + t * turns * math.tau
        spline.points[i].co = (math.cos(a) * radius, math.sin(a) * radius, z0 + t * (z1 - z0), 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    # convert() acts on the whole selection, so select only this curve.
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def build():
    gc.clear_scene()
    root = gc.root_empty("RegionArch")

    m_beam = gc.tint("tint", 0.45)
    m_stripe = gc.tint("tint2", 0.45)
    m_cane = gc.material("Cane_White", 0xFFFFFF, 0.4)
    m_cream = gc.material("Frosting_Cream", gc.PALETTE["cream"], 0.45)

    for sx in (-1, 1):
        x = sx * HALF
        post = gc.cone(f"Post{sx}", m_cane, 0.18, 0.16, POST_H, (x, 0, POST_H / 2), root, verts=14)
        for phase in (0.0, math.pi):
            h = helix(f"Stripe{sx}_{phase:.0f}", m_stripe, 0.17, 0.05, 0.25, POST_H - 0.05, 2.5, phase)
            h.location.x = x
            h.parent = root
        # A cream collar at the foot so the post is planted, not stuck in, and
        # a cream knob on top that also caps the open end of the beam.
        gc.cyl(f"Collar{sx}", m_cream, 0.27, 0.16, (x, 0, 0.08), root, verts=14)
        gc.ball(f"Knob{sx}", m_cream, 0.25, (x, 0, POST_H), root, segs=12, rings=8)
        del post

    # Half-round beam bridging the post tops.
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD", location=(0, 0, POST_H),
        major_radius=HALF, minor_radius=0.22, major_segments=36, minor_segments=8,
    )
    beam = gc.finish("Beam", m_beam, root, smooth=True)
    beam.rotation_euler[0] = math.radians(90)
    # Keep only the upper half of the ring.
    bpy.ops.object.select_all(action="DESELECT")
    beam.select_set(True)
    bpy.context.view_layer.objects.active = beam
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in beam.data.vertices:
        v.select = v.co.z < -0.05
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Frosting beads along the beam's crown.
    for i in range(11):
        a = math.pi * (i + 0.5) / 11
        gc.ball(
            f"Bead{i}", m_cream, 0.09,
            (math.cos(a) * HALF, 0, POST_H + math.sin(a) * (HALF + 0.2)), root, segs=6, rings=4,
        )

    gc.cherry("Keystone", (0, 0, POST_H + HALF + 0.1), root, radius=CHERRY_R)
    return root


def main():
    build()
    gc.ship(__file__, "region-arch", APEX_U, distance_mult=1.8)


main()
