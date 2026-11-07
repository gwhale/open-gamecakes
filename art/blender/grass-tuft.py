"""Gamecakes — grass tuft, the blades that cover the open ground around the player.

    blender --background --factory-startup --python art/blender/grass-tuft.py

Replaces the pastel cones in engine.ts's prop scatter. grass-field.ts draws
thousands of these as one InstancedMesh in a patch that follows the player, and
bends them in the vertex shader: wind sway, a push away from the cupcake, and
flattening along the trail it leaves. So the blades here stand UPRIGHT and only
lean a little; every motion is the shader's.

Each blade is a flat tapered strip, three segments high, so the shader's bend
reads as a curve rather than a hinge. The strips are single faces seen from both
sides (the runtime draws them DoubleSide), which is what keeps a tuft at ~35
triangles when the town draws a few thousand of them.

Colour is one swatch, a little deeper than the terrain's grass (WORLD.
GROUND_GRASS) so the tufts read against the ground. The shader darkens the base,
lightens the tips, and tints each tuft by the same patches the ground uses.
"""

import math
import os
import random
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 0.5
BLADES = 7
SEGMENTS = 3
GRASS = 0x6CAA50


def blade(name, mat, parent, at_xy, height, width, lean_dir, lean):
    """A tapered strip from (at_xy, 0) up to a point at `height`, leaning
    `lean` units toward `lean_dir` at the tip (quadratic, so it curves)."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)

    bm = bmesh.new()
    # The strip faces across the lean so its broad side catches the light.
    side = (-math.sin(lean_dir), math.cos(lean_dir))
    fwd = (math.cos(lean_dir), math.sin(lean_dir))
    rows = []
    for i in range(SEGMENTS + 1):
        t = i / SEGMENTS
        z = height * t
        off = lean * t * t
        cx = at_xy[0] + fwd[0] * off
        cy = at_xy[1] + fwd[1] * off
        if i == SEGMENTS:
            rows.append([bm.verts.new((cx, cy, z))])
            continue
        half = width * 0.5 * (1 - t * 0.75)
        rows.append([
            bm.verts.new((cx - side[0] * half, cy - side[1] * half, z)),
            bm.verts.new((cx + side[0] * half, cy + side[1] * half, z)),
        ])
    for i in range(SEGMENTS):
        lo, hi = rows[i], rows[i + 1]
        bm.faces.new(lo + hi[::-1] if len(hi) == 2 else lo + hi)
    bm.to_mesh(mesh)
    bm.free()
    return obj


def build():
    gc.clear_scene()
    root = gc.root_empty("GrassTuft")
    m_grass = gc.material("Grass", GRASS, 0.85)

    # Seeded so a rebuild gives the same tuft. The tallest blade sets APEX_U.
    rng = random.Random(11)
    for i in range(BLADES):
        a = i / BLADES * math.tau + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.03, 0.14)
        h = APEX_U if i == 0 else rng.uniform(0.3, 0.46)
        blade(
            f"Blade{i}", m_grass, root,
            (math.cos(a) * r, math.sin(a) * r), h, rng.uniform(0.045, 0.06),
            a + rng.uniform(-0.4, 0.4), rng.uniform(0.06, 0.15),
        )
    return root


def main():
    build()
    # The atlas material culls back faces, so the preview shows only the blades
    # facing the camera. The runtime draws them DoubleSide.
    gc.ship(__file__, "grass-tuft", APEX_U, distance_mult=3.2)


main()
