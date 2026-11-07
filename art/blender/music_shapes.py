"""Shared shapes for the Musical Planets art (music-*.py).

Small on purpose: rounded boxes, extruded side profiles, rods with ball caps
and grounding. Everything else comes from gamecakes.py.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402


def soften(obj, width, segments=3, angle=40):
    """Bevel every edge (baked at export) and smooth-shade by angle, so a box
    reads as poured candy instead of a primitive."""
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "NONE"
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    return obj


def rbox(name, mat, size, at, parent=None, bevel=0.05, segments=3, top_scale=None):
    """A rounded box: `size` full dimensions, `at` world centre. `top_scale`
    (sx, sy) narrows the top face, for tapered shapes like a black key."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = gc.finish(name, mat, parent)
    for v in obj.data.vertices:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        if top_scale and v.co.z > 0:
            v.co.x *= top_scale[0]
            v.co.y *= top_scale[1]
    return soften(obj, bevel, segments)


def prism(name, mat, profile, thickness, parent=None, bevel=0.012):
    """Extrude a 2D outline (list of (u, z) points, counterclockwise) by
    `thickness` along Y. Returned centred on Y = 0 in its own space."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    half = thickness / 2
    front = [bm.verts.new((u, -half, z)) for u, z in profile]
    back = [bm.verts.new((u, half, z)) for u, z in profile]
    bm.faces.new(list(reversed(front)))
    bm.faces.new(back)
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return soften(obj, bevel, 2)


def rod(name, mat, length, radius, at, axis="X", parent=None, verts=10, caps=True):
    """A candy rod with ball caps, `length` end to end including the caps."""
    body = length - (2 * radius if caps else 0)
    obj = gc.cyl(name, mat, radius, body, at, parent, verts=verts)
    if axis == "X":
        obj.rotation_euler[1] = math.pi / 2
    elif axis == "Y":
        obj.rotation_euler[0] = math.pi / 2
    parts = [obj]
    if caps:
        d = Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]) * (body / 2)
        for k, s in enumerate((1, -1)):
            parts.append(gc.ball(f"{name}Cap{k}", mat, radius, Vector(at) + d * s, parent, segs=verts, rings=5))
    return parts


def orient(obj, direction):
    """Point the object's local +Z along `direction` (world)."""
    d = Vector(direction).normalized()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)


def bake_modifiers():
    """Apply every modifier now. join_with_palette keeps the ACTIVE part's
    modifiers on the joined mesh, so an unapplied bevel would be re-run over
    the whole asset at export (the piano bed went from 2.4k to 14k tris)."""
    for o in list(bpy.data.objects):
        if o.type != "MESH" or not o.modifiers:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)


def ground(root=None):
    """Bake modifiers, then lift the whole asset so its lowest vertex sits on
    z = 0."""
    bake_modifiers()
    bpy.context.view_layer.update()
    low = min(
        (o.matrix_world @ v.co).z
        for o in bpy.data.objects
        if o.type == "MESH"
        for v in o.data.vertices
    )
    for o in bpy.data.objects:
        if o.parent is None and o.type in {"MESH", "EMPTY"}:
            o.location.z -= low
    return -low
