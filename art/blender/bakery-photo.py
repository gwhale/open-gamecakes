"""Gamecakes — a photographic bakery counter for the top of /play, and the wood its
shelves are made of. Real path-traced light on the town's own Blender models.

    blender --background --factory-startup --python art/blender/bakery-photo.py

Writes public/play/bakery-counter.jpg and public/play/shelf-wood.jpg.
"""

import math
import os

import bpy

HERE = os.path.dirname(os.path.realpath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, "public", "play")
MODELS = os.path.join(REPO, "public", "models", "town")


def linear(hex_color):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (channel((hex_color >> 16) & 255), channel((hex_color >> 8) & 255), channel(hex_color & 255), 1)


def wood_material(name, light, dark, grain_scale):
    """Long-grain planks: stretched noise bent by a wave, with satin varnish."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (grain_scale * 0.14, grain_scale * 2.4, grain_scale)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 12.0
    noise.inputs["Roughness"].default_value = 0.62
    noise.inputs["Distortion"].default_value = 1.6
    links.new(mapping.outputs[0], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.34
    ramp.color_ramp.elements[0].color = linear(dark)
    ramp.color_ramp.elements[1].position = 0.68
    ramp.color_ramp.elements[1].color = linear(light)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.36
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.02
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs[0], bsdf.inputs["Normal"])
    return mat


def tile_material():
    """Cream glazed wall tile with soft grout, the classic bakery backsplash."""
    mat = bpy.data.materials.new("Tile")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    coord = nodes.new("ShaderNodeTexCoord")
    brick = nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.5
    brick.inputs["Color1"].default_value = linear(0xF6EBD6)
    brick.inputs["Color2"].default_value = linear(0xEFE2C8)
    brick.inputs["Mortar"].default_value = linear(0xC9B99E)
    brick.inputs["Scale"].default_value = 1.5
    brick.inputs["Mortar Size"].default_value = 0.022
    brick.inputs["Brick Width"].default_value = 0.5
    brick.inputs["Row Height"].default_value = 0.25
    links.new(coord.outputs["Object"], brick.inputs["Vector"])
    links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.2
    return mat


def plane(name, mat, size, at, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=at, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def place_model(stem, at, height, turn=0.0, tint=None):
    """Imports a town model, scaled to `height` metres, standing on `at`."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, f"{stem}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    meshes = [o for o in new if o.type == "MESH"]

    def posed_heights():
        # The posed mesh: a rigged model's rest vertices are not where it stands.
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        out = []
        for o in meshes:
            posed = o.evaluated_get(depsgraph)
            out += [(posed.matrix_world @ v.co).z for v in posed.to_mesh().vertices]
            posed.to_mesh_clear()
        return out

    heights = posed_heights()
    s = height / (max(heights) - min(heights))
    for root in roots:
        root.scale = (root.scale.x * s, root.scale.y * s, root.scale.z * s)
        root.rotation_mode = "XYZ"
        root.rotation_euler[2] += turn
        root.location = (at[0], at[1], at[2])
    # Stand it on the surface, measured after scaling and placing.
    drop = min(posed_heights()) - at[2]
    for root in roots:
        root.location.z -= drop
    # The town's flat candy finish looks like plastic under real light.
    for o in meshes:
        for mat in o.data.materials:
            if mat and mat.use_nodes and "Principled BSDF" in mat.node_tree.nodes:
                bsdf = mat.node_tree.nodes["Principled BSDF"]
                if tint is not None and mat.name.startswith("tint"):
                    bsdf.inputs["Base Color"].default_value = linear(tint)
                bsdf.inputs["Subsurface Weight"].default_value = 0.35
                bsdf.inputs["Subsurface Radius"].default_value = (0.05, 0.03, 0.02)
                bsdf.inputs["Subsurface Scale"].default_value = 0.1
        for poly in o.data.polygons:
            poly.use_smooth = True


def point_at(obj, target):
    direction = (bpy.context.scene.cursor.location.__class__(target) - obj.location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_setup(w, h, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 80
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = linear(0xFFE9CF)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    scene.world = world
    return scene


def add_camera(at, target, lens, f_stop=None, focus=None):
    bpy.ops.object.camera_add(location=at)
    cam = bpy.context.active_object
    point_at(cam, target)
    cam.data.lens = lens
    if f_stop:
        cam.data.dof.use_dof = True
        cam.data.dof.aperture_fstop = f_stop
        cam.data.dof.focus_distance = focus
    bpy.context.scene.camera = cam
    return cam


def area_light(at, target, size, watts, color):
    bpy.ops.object.light_add(type="AREA", location=at)
    light = bpy.context.active_object
    point_at(light, target)
    light.data.size = size
    light.data.energy = watts
    light.data.color = color


def counter():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = render_setup(1800, 720, 96)
    wood = wood_material("Counter", 0xB57B45, 0x6B4023, 3.0)
    plane("Counter", wood, (6, 3, 1), (0, 0.2, 0))
    plane("Wall", tile_material(), (6, 2.4, 1), (0, 1.25, 1.1), rot=(math.radians(90), 0, 0))
    # A dark shelf along the wall, with cakes out of focus behind.
    plane("Shelf", wood, (6, 0.32, 1), (0, 1.09, 0.82))
    place_model("hero-cake", (-0.86, 0.02, 0), 0.5, turn=0.35, tint=0xF7A6BC)
    place_model("cakey", (0.0, -0.18, -0.19), 0.72, turn=-0.25)  # its mesh measures 0.19 low
    place_model("hero-cake", (0.88, 0.12, 0), 0.42, turn=-0.5, tint=0x8A5A3A)
    place_model("gumdrop", (-0.42, -0.42, 0), 0.07, tint=0xE5484D)
    place_model("gumdrop", (0.48, -0.5, 0), 0.06, tint=0x5FBF8F)
    place_model("hero-cake", (-1.1, 1.09, 0.82), 0.26, tint=0xF3D27A)
    place_model("hero-cake", (0.1, 1.09, 0.82), 0.22, turn=1.1, tint=0xA7D8C6)
    place_model("hero-cake", (1.2, 1.09, 0.82), 0.27, turn=2.2, tint=0xC9A6E0)
    add_camera((0, -4.6, 0.95), (0, 0, 0.44), 62, f_stop=5.6, focus=4.4)
    # Window light from the left, a warm fill from the right.
    area_light((-3.2, -1.8, 2.4), (0, 0, 0.3), 3.0, 620, (1.0, 0.95, 0.86))
    area_light((3.0, -1.6, 1.4), (0, 0, 0.3), 3.0, 120, (1.0, 0.84, 0.66))
    scene.render.filepath = os.path.join(OUT, "bakery-counter.jpg")
    bpy.ops.render.render(write_still=True)


def shelf():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = render_setup(1600, 72, 32)
    wood = wood_material("Shelf", 0xB9824C, 0x75492A, 3.0)
    plane("Shelf", wood, (8, 0.36, 1), (0, 0, 0))
    bpy.ops.object.camera_add(location=(0, 0, 4))
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 8
    scene.camera = cam
    # Even light end to end: shelves repeat this strip side by side.
    area_light((0, 0, 12), (0, 0, 0), 60, 9000, (1.0, 0.94, 0.84))
    scene.render.filepath = os.path.join(OUT, "shelf-wood.jpg")
    bpy.ops.render.render(write_still=True)


os.makedirs(OUT, exist_ok=True)
counter()
shelf()
