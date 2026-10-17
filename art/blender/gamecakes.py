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


# Tint slots: parts the town recolours per instance (a booth in its land's
# ribbon colour, a tree canopy in one of four candies). They are modelled WHITE
# in a material named exactly "tint" or "tint2", and join_with_palette keeps
# them as their own material slot instead of baking them into the atlas. The
# runtime (authored-registry.ts) swaps in a coloured copy by that name. Each
# slot costs one extra draw call; check-models allows exactly that.
TINT_SLOTS = ("tint", "tint2")


def tint(slot: str = "tint", roughness: float = 0.55):
    if slot not in TINT_SLOTS:
        raise ValueError(f"tint slot must be one of {TINT_SLOTS}")
    mat = material(slot, 0xFFFFFF, roughness)
    mat.use_backface_culling = True  # same as the atlas; see _atlas_material
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


# --- palette atlas + join --------------------------------------------------
# The modelling above uses one Blender material per colour, because that is the
# readable way to build. What SHIPS is one mesh with one material: every face's
# UVs point at the centre of its colour's swatch in a tiny generated texture.
# 78 meshes x 9 materials was ~78 draw calls per castle; this makes it one.
#
# Swatches are SWATCH_PX square and power-of-two aligned, so box-filtered
# mipmaps keep each swatch a single pure colour down to 1px — colours only
# blend once the whole asset is a couple of pixels on screen. No padding tricks.

SWATCH_PX = 16
ATLAS_COLS = 4
ATLAS_PX = SWATCH_PX * ATLAS_COLS  # 64x64, room for 16 swatches


def _swatch_key(mat):
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    rgb = tuple(round(c, 5) for c in bsdf.inputs["Base Color"].default_value[:3])
    rough = round(bsdf.inputs["Roughness"].default_value, 3)
    return rgb, rough


def _linear_to_srgb(c: float) -> float:
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def _atlas_images(stem, swatches):
    """Two images: sRGB base colour, and Non-Color roughness in the G channel
    (glTF's metallicRoughness layout: G = roughness, B = metallic)."""
    base = bpy.data.images.new(f"{stem}-palette", ATLAS_PX, ATLAS_PX, alpha=False)
    mr = bpy.data.images.new(f"{stem}-roughness", ATLAS_PX, ATLAS_PX, alpha=False)
    mr.colorspace_settings.name = "Non-Color"
    base_px = [1.0] * (ATLAS_PX * ATLAS_PX * 4)
    mr_px = [1.0] * (ATLAS_PX * ATLAS_PX * 4)
    for i, (rgb, rough) in enumerate(swatches):
        col, row = i % ATLAS_COLS, i // ATLAS_COLS
        # Byte images store their colourspace's values, so sRGB goes in as-is.
        srgb = [_linear_to_srgb(c) for c in rgb]
        for y in range(row * SWATCH_PX, (row + 1) * SWATCH_PX):
            for x in range(col * SWATCH_PX, (col + 1) * SWATCH_PX):
                o = (y * ATLAS_PX + x) * 4
                base_px[o:o + 3] = srgb
                mr_px[o:o + 3] = (0.0, rough, 0.0)
    base.pixels = base_px
    mr.pixels = mr_px
    base.pack()
    mr.pack()
    return base, mr


def _atlas_material(stem, base_img, mr_img):
    mat = bpy.data.materials.new(f"{stem}-atlas")
    mat.use_nodes = True
    # Every part is a closed primitive, so back faces are never seen. Without
    # this the exporter marks the material doubleSided and three draws both.
    mat.use_backface_culling = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    t_base = nodes.new("ShaderNodeTexImage")
    t_base.image = base_img
    t_base.interpolation = "Closest"
    t_mr = nodes.new("ShaderNodeTexImage")
    t_mr.image = mr_img
    t_mr.interpolation = "Closest"
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(t_base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(t_mr.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    return mat


def join_with_palette(stem: str, groups=None):
    """Collapse every mesh in the scene into ONE mesh with ONE atlas material.
    Run after modelling and after save_blend(), so the editable source keeps
    its named parts and only the shipped asset is merged.

    `groups` is for an asset with a moving part (a chest lid): a list of
    (node_name, root_empty, pivot) tuples. Each root's meshes join into their
    own node, still sharing the one atlas, with the node's origin at `pivot`
    (Blender Z-up world point) so the runtime can rotate it about a hinge.
    Each group costs one draw call; say so in check-models' BUDGET_OVERRIDES."""
    if groups:
        return _join_groups(stem, groups)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    swatches = []
    tints_used = []
    for obj in meshes:
        for mat in obj.data.materials:
            if mat.name in TINT_SLOTS:
                if mat.name not in tints_used:
                    tints_used.append(mat.name)
            elif _swatch_key(mat) not in swatches:
                swatches.append(_swatch_key(mat))
    tints_used.sort()
    if len(swatches) > ATLAS_COLS * ATLAS_COLS:
        raise ValueError(f"{len(swatches)} swatches; the atlas holds {ATLAS_COLS ** 2}")

    # Which slot each face lands in: 0 = the atlas, then the tints in order.
    face_slot = {}
    for obj in meshes:
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
        slots = face_slot[obj.name] = []
        for poly in obj.data.polygons:
            mat = obj.data.materials[poly.material_index]
            if mat.name in TINT_SLOTS:
                slots.append(1 + tints_used.index(mat.name))
                for li in poly.loop_indices:
                    uv.data[li].uv = (0.5, 0.5)
                continue
            slots.append(0)
            i = swatches.index(_swatch_key(mat))
            # Image V runs bottom-up in Blender, matching the pixel rows above.
            u = ((i % ATLAS_COLS) + 0.5) / ATLAS_COLS
            v = ((i // ATLAS_COLS) + 0.5) / ATLAS_COLS
            for li in poly.loop_indices:
                uv.data[li].uv = (u, v)

    # Give every part the same slot list BEFORE joining, so the join keeps one
    # slot per material and each face keeps the index it was given here.
    atlas = _atlas_material(stem, *_atlas_images(stem, swatches))
    slot_mats = [atlas] + [bpy.data.materials[name] for name in tints_used]
    for obj in meshes:
        obj.data.materials.clear()
        for mat in slot_mats:
            obj.data.materials.append(mat)
        for poly, slot in zip(obj.data.polygons, face_slot[obj.name]):
            poly.material_index = slot

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # Bake parenting + transforms into vertices so the joined mesh sits at the
    # world origin with identity transform.
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = stem

    # Drop the now-childless root empties so the GLB is one node.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "EMPTY":
            bpy.data.objects.remove(obj)
    print(
        f"[gamecakes] joined {len(meshes)} meshes, {len(swatches)} swatches -> 1 mesh, "
        f"{len(slot_mats)} material(s) {[m.name for m in slot_mats]}"
    )
    return joined


def _join_groups(stem: str, groups):
    """join_with_palette for several nodes: paint the atlas over the whole
    scene first (one atlas for every group), then join per group."""
    owner = {}
    for node_name, root, _pivot in groups:
        for child in root.children_recursive:
            if child.type == "MESH":
                owner[child.name] = node_name
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    stray = [m.name for m in meshes if m.name not in owner]
    if stray:
        raise ValueError(f"meshes outside every group: {stray}")
    swatches = []
    for obj in meshes:
        for mat in obj.data.materials:
            if mat.name in TINT_SLOTS:
                raise ValueError("grouped assets do not support tint slots yet")
            if _swatch_key(mat) not in swatches:
                swatches.append(_swatch_key(mat))
    if len(swatches) > ATLAS_COLS * ATLAS_COLS:
        raise ValueError(f"{len(swatches)} swatches; the atlas holds {ATLAS_COLS ** 2}")
    for obj in meshes:
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
        for poly in obj.data.polygons:
            i = swatches.index(_swatch_key(obj.data.materials[poly.material_index]))
            u = ((i % ATLAS_COLS) + 0.5) / ATLAS_COLS
            v = ((i // ATLAS_COLS) + 0.5) / ATLAS_COLS
            for li in poly.loop_indices:
                uv.data[li].uv = (u, v)
    atlas = _atlas_material(stem, *_atlas_images(stem, swatches))
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(atlas)
        for poly in obj.data.polygons:
            poly.material_index = 0

    # Resolve every group BEFORE joining any: a join renames and deletes objects.
    parts = {name: [m for m in meshes if owner[m.name] == name] for name, _r, _p in groups}
    joined = []
    for node_name, _root, pivot in groups:
        part = parts[node_name]
        bpy.ops.object.select_all(action="DESELECT")
        for obj in part:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = part[0]
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if len(part) > 1:
            bpy.ops.object.join()
        node = bpy.context.active_object
        node.name = node_name
        # Move the origin to the pivot without moving the geometry.
        bpy.context.scene.cursor.location = pivot
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        joined.append(node)
    bpy.context.scene.cursor.location = (0, 0, 0)
    for obj in list(bpy.context.scene.objects):
        if obj.type == "EMPTY":
            bpy.data.objects.remove(obj)
    print(f"[gamecakes] joined {len(meshes)} meshes, {len(swatches)} swatches -> {len(joined)} nodes")
    return joined


def ship(script_file: str, stem: str, apex_u: float, distance_mult: float = 1.9, groups=None):
    """The whole tail of an asset script: save the editable parts, merge into
    the shipped form, export, then render the preview FROM the shipped form so
    the picture checks the atlas UVs as well as the geometry."""
    repo, blend_out, png_out = paths(script_file, stem)
    save_blend(blend_out)
    join_with_palette(stem, groups)
    export_glb(repo, f"{stem}.glb")
    render_preview(png_out, apex_u, distance_mult)


# --- export + preview ------------------------------------------------------


def export_glb(repo_root: str, filename: str, **gltf_options):
    """Export every mesh/empty/armature. Cameras and lights are added AFTER
    this, so preview-only objects can never leak into the asset. Extra keyword
    arguments go straight to the glTF exporter (e.g. animation settings)."""
    out = os.path.join(repo_root, "public", "models", "town", filename)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type in {"MESH", "EMPTY", "ARMATURE"})
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,   # bake modifiers + object scale
        export_yup=True,     # Blender Z-up -> glTF/three Y-up. Never hand-rotate.
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        **gltf_options,
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
