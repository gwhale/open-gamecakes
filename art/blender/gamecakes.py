"""Shared helpers for Gamecakes Blender asset scripts.

Import from a sibling script:

    import sys, os
    sys.path.append(os.path.dirname(os.path.realpath(__file__)))
    import gamecakes as gc

Everything here is deliberately small and obvious — the point is that the asset
scripts read as modelling, not as boilerplate.
"""

import math
import os

import bpy

# Mirrors FROSTING in src/lib/town/three/land-structure.ts. Authored art sits
# next to procedural pieces that have not been replaced yet, so a drifting
# palette shows up immediately.
PALETTE = {
    "strawberry": 0xFB7185,
    "mint": 0x6EE7B7,
    "vanilla": 0xFDE68A,
    "cream": 0xFFF1D6,
    "chocolate": 0xB5764A,
    "cherry": 0xE11D48,
    "roof": 0xF472B6,
    "door": 0x8B5E3C,
    "blueberry": 0x8B93F8,
}


def srgb_to_linear(c: float) -> float:
    """Blender works in linear; the palette is authored in sRGB hex."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name: str, hex_color: int, roughness: float = 0.6):
    """Flat candy shading — no textures. Reuses an existing material by name so
    repeated calls across a build do not multiply the material count."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    r = srgb_to_linear(((hex_color >> 16) & 0xFF) / 255)
    g = srgb_to_linear(((hex_color >> 8) & 0xFF) / 255)
    b = srgb_to_linear((hex_color & 0xFF) / 255)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def finish(obj_name: str, mat, parent=None, smooth: bool = False):
    """Name + material the object that was just added, and parent it."""
    obj = bpy.context.active_object
    obj.name = obj_name
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    if smooth:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
    return obj


def root_empty(name: str):
    empty = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(empty)
    return empty


# --- primitives ------------------------------------------------------------
# NOTE ON SIZING: primitive_cube_add(size=1) has HALF-extent 0.5, and `scale`
# multiplies that — so scale=(2.2, 1.8, 1.15) is a box 2.2 x 1.8 x 1.15 overall.
# Getting this backwards produced a cottage with a roof twice its body width.


def box(name, mat, size, at, parent=None, rot_z=0.0):
    """`size` and `at` are full dimensions / world centre, in Blender Z-up."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = finish(name, mat, parent)
    obj.scale = size
    obj.rotation_euler[2] = rot_z
    return obj


def cyl(name, mat, radius, height, at, parent=None, verts=16, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, vertices=verts, location=at)
    return finish(name, mat, parent, smooth=smooth)


def cone(name, mat, r_bottom, r_top, height, at, parent=None, verts=16, smooth=True, rot_z=0.0):
    bpy.ops.mesh.primitive_cone_add(
        radius1=r_bottom, radius2=r_top, depth=height, vertices=verts, location=at
    )
    obj = finish(name, mat, parent, smooth=smooth)
    obj.rotation_euler[2] = rot_z
    return obj


def ball(name, mat, radius, at, parent=None, segs=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segs, ring_count=rings, location=at)
    return finish(name, mat, parent, smooth=True)


def cherry(name, at, parent=None, radius=0.15):
    return ball(name, material("Cherry", PALETTE["cherry"], 0.25), radius, at, parent)


def crenellate(parent, mat, centre_z, radius, count, block=0.22, height=0.34):
    """Ring of merlons — the shorthand that makes a cylinder read as a castle."""
    for i in range(count):
        a = (i / count) * math.tau
        box(
            f"Merlon{i}",
            mat,
            (block, block, height),
            (math.cos(a) * radius, math.sin(a) * radius, centre_z + height / 2),
            parent,
            rot_z=a,
        )


# --- export + preview ------------------------------------------------------


def export_glb(repo_root: str, filename: str):
    """Export every mesh/empty. Cameras and lights are added AFTER this, so
    preview-only objects can never leak into the asset."""
    out = os.path.join(repo_root, "public", "models", "town", filename)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type in {"MESH", "EMPTY"})
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,   # bake modifiers + object scale
        export_yup=True,     # Blender Z-up -> glTF/three Y-up. Never hand-rotate.
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print(f"[gamecakes] wrote {out}")
    return out


def render_preview(png_path_noext: str, apex_u: float, distance_mult: float = 1.9):
    """Render a look-at-it image. This is not decoration: a broken model exports
    a perfectly valid GLB of the right byte count and passes every automated
    check. The ground plane below is the point — it shows whether the model
    actually sits on Z=0."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 40
    scene.cycles.device = "CPU"
    scene.render.resolution_x = 620
    scene.render.resolution_y = 620
    scene.render.filepath = png_path_noext

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.91, 1.0, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=max(24, apex_u * 4), location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "PreviewGround"
    ground.data.materials.append(material("PreviewGround", 0x9BD37A, 0.9))

    target = root_empty("PreviewTarget")
    target.location = (0, 0, apex_u * 0.45)

    d = apex_u * distance_mult
    bpy.ops.object.camera_add(location=(d * 0.75, -d, apex_u * 0.75))
    cam = bpy.context.active_object
    cam.data.lens = 50
    track = cam.constraints.new(type="TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam

    bpy.ops.object.light_add(type="SUN", location=(4, -4, apex_u + 6))
    sun = bpy.context.active_object
    sun.data.energy = 3.4
    sun.rotation_euler = (math.radians(48), math.radians(10), math.radians(35))

    bpy.ops.object.light_add(type="AREA", location=(-d * 0.7, -d * 0.5, apex_u * 0.8))
    fill = bpy.context.active_object
    fill.data.energy = 60 * apex_u
    fill.data.size = apex_u

    bpy.ops.render.render(write_still=True)
    print(f"[gamecakes] wrote {png_path_noext}.png")


def save_blend(path: str):
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print(f"[gamecakes] wrote {path}")


def paths(script_file: str, stem: str):
    """(repo_root, blend_path, png_noext) for a script in art/blender/."""
    here = os.path.dirname(os.path.realpath(script_file))
    repo = os.path.dirname(os.path.dirname(here))
    return repo, os.path.join(here, f"{stem}.blend"), os.path.join(here, f"{stem}-preview")


def torus(name, mat, radius, tube, at, parent=None, major=14, minor=8):
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD", location=at,
        major_radius=radius, minor_radius=tube,
        major_segments=major, minor_segments=minor,
    )
    return finish(name, mat, parent, smooth=True)
