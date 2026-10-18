"""Gamecakes — tiling normal maps for the town's land: grass, sand, paths,
and the sponge crumb on cake buildings.

    blender --background --factory-startup --python art/blender/land-normals.py

Writes public/textures/town/{grass,sand,path,sponge}-normal.png (the runtime textures)
and art/blender/land-normals-preview.png (each one lit and tiled 2x2, so a seam
or an obvious repeat shows before it ships).

SEAMLESS BY CONSTRUCTION. Blender's Noise and Voronoi textures do not repeat,
so each node tree samples them in 4D on a flat torus:

    (cos 2πu, sin 2πu, cos 2πv) with W = sin 2πv

u = 0 and u = 1 land on the same 4D point (same for v), so the noise is equal
across opposite edges and the tile repeats with no seam. The torus is flat, so
features are not stretched either.

Cycles bakes those fields (EMIT pass, float) into the R, G and B channels of one
image per texture. The numpy step after it shapes them into a height field and
turns height into OpenGL-convention normals, the same way water-normals.py does.

Each surface is a cake surface, not a real one:
  grass  buttercream tufts, the points a grass piping tip leaves, over a soft roll
  sand   wind ripples in brown sugar, with fine crystal grain
  path   frosting combed along the path, with soft wobble and the odd dollop
  sponge open crumb on cake walls: pores of mixed size in a soft, springy body
"""

import math
import os

import bpy
import numpy as np

BAKE_PX = 256  # ~50 px per scene unit at the engine tile sizes; 512 tripled the download


# --- 4D torus noise node trees ---------------------------------------------

def _torus_coords(nodes, links):
    """UV -> (vector socket, w socket) on the flat torus described above."""
    uv = nodes.new("ShaderNodeTexCoord").outputs["UV"]
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv, sep.inputs[0])

    def trig(axis, fn):
        ang = nodes.new("ShaderNodeMath")
        ang.operation = "MULTIPLY"
        links.new(sep.outputs[axis], ang.inputs[0])
        ang.inputs[1].default_value = 2 * math.pi
        out = nodes.new("ShaderNodeMath")
        out.operation = fn
        links.new(ang.outputs[0], out.inputs[0])
        return out.outputs[0]

    comb = nodes.new("ShaderNodeCombineXYZ")
    links.new(trig("X", "COSINE"), comb.inputs[0])
    links.new(trig("X", "SINE"), comb.inputs[1])
    links.new(trig("Y", "COSINE"), comb.inputs[2])
    return comb.outputs[0], trig("Y", "SINE")


def _noise(nodes, links, vec, w, scale, detail=2.0, roughness=0.5):
    n = nodes.new("ShaderNodeTexNoise")
    n.noise_dimensions = "4D"
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = roughness
    links.new(vec, n.inputs["Vector"])
    links.new(w, n.inputs["W"])
    return n.outputs["Fac"]


def _voronoi(nodes, links, vec, w, scale, feature="F1"):
    v = nodes.new("ShaderNodeTexVoronoi")
    v.voronoi_dimensions = "4D"
    v.feature = feature
    v.inputs["Scale"].default_value = scale
    links.new(vec, v.inputs["Vector"])
    links.new(w, v.inputs["W"])
    return v.outputs["Distance"]


def bake_fields(name, fields):
    """Bake three 4D-torus fields into one float image's R, G, B.

    fields: three callables (nodes, links, vec, w) -> float socket."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False

    bpy.ops.mesh.primitive_plane_add(size=2)
    obj = bpy.context.active_object
    mat = bpy.data.materials.new(name)
    obj.data.materials.append(mat)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()

    vec, w = _torus_coords(nodes, links)
    comb = nodes.new("ShaderNodeCombineColor")
    for i, field in enumerate(fields):
        links.new(field(nodes, links, vec, w), comb.inputs[i])
    emit = nodes.new("ShaderNodeEmission")
    links.new(comb.outputs[0], emit.inputs["Color"])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emit.outputs[0], out.inputs["Surface"])

    img = bpy.data.images.new(name, BAKE_PX, BAKE_PX, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    nodes.active = tex  # the bake target is the active image node
    bpy.ops.object.bake(type="EMIT")

    px = np.empty(BAKE_PX * BAKE_PX * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(BAKE_PX, BAKE_PX, 4)  # rows bottom-up = +V
    return px[..., 0].astype(np.float64), px[..., 1].astype(np.float64), px[..., 2].astype(np.float64)


# --- height -> normals -> png ------------------------------------------------

def norm01(a):
    a = a - a.min()
    return a / (a.max() or 1.0)


def normals(h, strength):
    """OpenGL-convention tangent normals (green = +V). np.roll wraps, so edge
    slopes are taken across the seam and stay continuous."""
    s = strength * h.shape[0] / 256.0
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * s
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * s
    n = np.dstack((-dx, -dy, np.ones_like(h)))
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def save_png(rgb, path):
    hgt, wid = rgb.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), wid, hgt, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.dstack((rgb, np.ones((hgt, wid)))).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print(f"[land] wrote {path}")


def lit(nrm, base_hex):
    """2x2 tiling under a low sun, tinted with the surface's town colour."""
    t = np.tile(nrm, (2, 2, 1))
    sun = np.array([-0.5, 0.45, 0.74])
    sun /= np.linalg.norm(sun)
    base = np.array([(base_hex >> 16) & 255, (base_hex >> 8) & 255, base_hex & 255]) / 255.0
    return np.clip(base * (0.35 + 0.8 * np.clip(t @ sun, 0, 1)[..., None]), 0, 1)


# --- the three surfaces ------------------------------------------------------

def grass():
    tufts, blades, roll = bake_fields("grass", [
        lambda n, l, v, w: _voronoi(n, l, v, w, 2.6),
        lambda n, l, v, w: _noise(n, l, v, w, 9.0, detail=2.0, roughness=0.5),
        lambda n, l, v, w: _noise(n, l, v, w, 2.0, detail=1.0),
    ])
    # Voronoi distance is 0 at each cell centre: invert it into a peak, and the
    # power gives a piped tuft (pointed tip, flared base) rather than a cone.
    tuft = (1.0 - norm01(tufts)) ** 2.2
    h = 0.75 * tuft + 0.18 * norm01(blades) + 0.25 * norm01(roll)
    return normals(norm01(h), 2.4)


def sand():
    warp, grain, crystals = bake_fields("sand", [
        lambda n, l, v, w: _noise(n, l, v, w, 2.5, detail=2.0),
        lambda n, l, v, w: _noise(n, l, v, w, 70.0, detail=0.0),
        lambda n, l, v, w: _voronoi(n, l, v, w, 20.0),
    ])
    yy, xx = np.mgrid[0:BAKE_PX, 0:BAKE_PX] / BAKE_PX
    # Integer wave counts keep the ripples periodic; the warp bends them.
    phase = 2 * math.pi * (6 * yy + 1 * xx + 0.6 * (norm01(warp) - 0.5))
    # Wind ripples are asymmetric: a gentle windward slope and a steeper lee.
    ripple = np.sin(phase) + 0.12 * np.sin(2 * phase)
    crystal = (1.0 - norm01(crystals)) ** 4  # small faceted sugar grains
    h = 0.8 * norm01(ripple) + 0.08 * norm01(grain) + 0.12 * crystal
    return normals(norm01(h), 2.0)


def path():
    wobble, fine, dollops = bake_fields("path", [
        lambda n, l, v, w: _noise(n, l, v, w, 2.0, detail=1.0),
        lambda n, l, v, w: _noise(n, l, v, w, 18.0, detail=2.0),
        lambda n, l, v, w: _voronoi(n, l, v, w, 4.0, "SMOOTH_F1"),
    ])
    yy, _ = np.mgrid[0:BAKE_PX, 0:BAKE_PX] / BAKE_PX
    # U runs along the path, V across it (see city3d.ts). Ridges are lines of
    # constant V, so this is frosting combed lengthwise; 5 fit across a ribbon.
    comb = 0.5 + 0.5 * np.cos(2 * math.pi * (5 * yy + 0.35 * (norm01(wobble) - 0.5)))
    dollop = (1.0 - norm01(dollops)) ** 4
    h = 0.6 * comb + 0.12 * norm01(fine) + 0.35 * dollop
    return normals(norm01(h), 1.8)


def sponge():
    pores, small, body = bake_fields("sponge", [
        lambda n, l, v, w: _voronoi(n, l, v, w, 6.0),
        lambda n, l, v, w: _voronoi(n, l, v, w, 15.0),
        lambda n, l, v, w: _noise(n, l, v, w, 5.0, detail=2.0),
    ])
    # Voronoi distance is 0 at each cell centre, so the raw value is already a
    # pit there; the root keeps the rims between pores broad and rounded.
    h = 0.5 * np.sqrt(norm01(pores)) + 0.3 * np.sqrt(norm01(small)) + 0.2 * norm01(body)
    return normals(norm01(h), 2.2)


def main():
    here = os.path.dirname(os.path.realpath(__file__))
    repo = os.path.dirname(os.path.dirname(here))
    out_dir = os.path.join(repo, "public", "textures", "town")
    os.makedirs(out_dir, exist_ok=True)

    # Town colours for the preview only: WORLD.TERRAIN_GRASS / TERRAIN_SAND /
    # FROSTING_PATH in src/lib/games/theme/palette.ts, and a cake wall.
    rows = []
    for stem, build, colour in (
        ("grass", grass, 0x9ADC9F),
        ("sand", sand, 0xF1E2B3),
        ("path", path, 0xFFF4E2),
        ("sponge", sponge, 0xFB7185),  # gamecakes.py PALETTE["strawberry"], a cake wall
    ):
        nrm = build()
        save_png(nrm * 0.5 + 0.5, os.path.join(out_dir, f"{stem}-normal.png"))
        rows.append(lit(nrm, colour))
    save_png(np.hstack(rows), os.path.join(here, "land-normals-preview.png"))


main()
