"""Gamecakes — Cakey, the mascot, rigged and animated.

    blender --background --factory-startup --python art/blender/cakey.py

Reproduces the procedural Cakey in src/lib/town/three/cakey.ts part for part
(same sizes at scale 1, same palette and roughness), then gives him a skeleton
and six clips. The runtime draws his face, contact shadow and tap box itself,
so none of those are here.

THE CONTRACT the runtime codes against — rename nothing without changing it:
  bones  root, body, top, hat, arm.L, arm.R, leg.L, leg.R
         root -> body -> top -> hat;  body -> arm.L / arm.R;  root -> leg.L / leg.R
  clips  Idle, Walk, Wave, Celebrate, Think (loops), Oops (one-shot)

Coordinates: three (x, y, z) -> Blender (x, -z, y). Cakey faces three +Z, which
is Blender -Y. ".L" is the character's left, Blender +X. Feet at the origin.

Poses are authored in WORLD axes (lean forward, raise this arm toward that
point) and converted into each bone's local space, so the signs read the way
they look instead of depending on bone roll.
"""

import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 1.41  # top of the cherry stem
FPS = 30

# Lifted from cakey.ts (which lifts it from GamecakesMascot.tsx).
C = {
    "strawberry": 0xFB7185,
    "strawberryRim": 0xFDA4AF,
    "vanilla": 0xFDE68A,
    "vanillaRim": 0xFEF3C7,
    "mint": 0x6EE7B7,
    "mintRim": 0xA7F3D0,
    "cherry": 0xDC2626,
    "stem": 0x166534,
    "shoe": 0xDC2626,
}
# Roughness of materials.ts cakeMat / frostingMat / candyMat.
CAKE, FROSTING, CANDY = 0.82, 0.34, 0.24


def bind(obj, bone):
    """Rigid skinning: every vertex of this part follows one bone."""
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    return obj


def build():
    gc.clear_scene()
    bpy.context.scene.render.fps = FPS

    m = {
        "shoe": gc.material("Candy_Shoe", C["shoe"], CANDY),
        "leg": gc.material("Cake_Vanilla", C["vanilla"], CAKE),
        "strawberry": gc.material("Cake_Strawberry", C["strawberry"], CAKE),
        "vanilla": gc.material("Cake_Vanilla", C["vanilla"], CAKE),
        "mint": gc.material("Cake_Mint", C["mint"], CAKE),
        "strawberryRim": gc.material("Frosting_Strawberry", C["strawberryRim"], FROSTING),
        "vanillaRim": gc.material("Frosting_Vanilla", C["vanillaRim"], FROSTING),
        "mintRim": gc.material("Frosting_Mint", C["mintRim"], FROSTING),
        "arm": gc.material("Candy_Strawberry", C["strawberry"], CANDY),
        "hand": gc.material("Candy_StrawberryRim", C["strawberryRim"], CANDY),
        "cherry": gc.material("Candy_Cherry", C["cherry"], CANDY),
        "stem": gc.material("Cake_Stem", C["stem"], CAKE),
    }

    # ---- Shoes + legs ----
    for side, bone in ((1, "leg.L"), (-1, "leg.R")):
        x = side * 0.16
        shoe = gc.ball(f"Shoe.{bone[-1]}", m["shoe"], 0.12, (x, -0.12, 0.06), segs=12, rings=10)
        shoe.scale = (1, 1.5, 0.55)  # squashed toe pointing forward (-Y)
        bind(shoe, bone)
        bind(gc.cyl(f"Leg.{bone[-1]}", m["leg"], 0.06, 0.16, (x, -0.06, 0.17), verts=10), bone)

    # ---- Three tiers + rims. box() sizes are (w, d, h) in Blender. ----
    for name, mat, size, z, bone in (
        ("TierStrawberry", "strawberry", (0.92, 0.64, 0.28), 0.42, "body"),
        ("RimStrawberry", "strawberryRim", (0.94, 0.66, 0.05), 0.565, "body"),
        ("TierVanilla", "vanilla", (0.74, 0.54, 0.24), 0.70, "body"),
        ("RimVanilla", "vanillaRim", (0.76, 0.56, 0.045), 0.815, "body"),
        ("TierMint", "mint", (0.56, 0.44, 0.22), 0.95, "top"),
        ("RimMint", "mintRim", (0.58, 0.46, 0.045), 1.06, "top"),
    ):
        bind(gc.box(name, m[mat], size, (0, 0, z)), bone)

    # ---- Arms: strawberry nubs angled out from the bottom tier ----
    for side, bone in ((1, "arm.L"), (-1, "arm.R")):
        arm = gc.cyl(f"Arm.{bone[-1]}", m["arm"], 0.05, 0.2, (side * 0.5, -0.04, 0.42), verts=8)
        arm.rotation_euler[1] = -side * 0.5  # three rotation.z = side*0.5
        bind(arm, bone)
        bind(gc.ball(f"Hand.{bone[-1]}", m["hand"], 0.06, (side * 0.58, -0.04, 0.33), segs=10, rings=8), bone)

    # ---- Cherry hat + stem ----
    bind(gc.ball("Cherry", m["cherry"], 0.12, (0, 0, 1.2), segs=14, rings=12), "hat")
    stem = gc.cyl("Stem", m["stem"], 0.02, 0.18, (0.05, 0, 1.32), verts=6)
    stem.rotation_euler[1] = 0.35
    bind(stem, "hat")


# --- skeleton ----------------------------------------------------------------

BONES = (
    # name,   head,                 tail,                 parent
    ("root", (0, 0, 0), (0, 0, 0.25), None),
    ("body", (0, 0, 0.28), (0, 0, 0.83), "root"),
    ("top", (0, 0, 0.83), (0, 0, 1.09), "body"),
    ("hat", (0, 0, 1.09), (0, 0, 1.40), "top"),
    ("arm.L", (0.452, -0.04, 0.508), (0.58, -0.04, 0.33), "body"),
    ("arm.R", (-0.452, -0.04, 0.508), (-0.58, -0.04, 0.33), "body"),
    ("leg.L", (0.16, -0.06, 0.25), (0.16, -0.06, 0.0), "root"),
    ("leg.R", (-0.16, -0.06, 0.25), (-0.16, -0.06, 0.0), "root"),
)


def rig(mesh):
    arm_data = bpy.data.armatures.new("CakeyRig")
    arm_obj = bpy.data.objects.new("CakeyRig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        if parent:
            eb.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    mesh.parent = arm_obj
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm_obj


# --- posing in world axes -------------------------------------------------------
# Blender world: +X = Cakey's left, -Y = his front, +Z = up.
#   rot_x(+a) leans a bone's top FORWARD; swings a hanging limb's end BACKWARD.
#   rot_y(+a) tips a bone's top toward his LEFT (+X).

IDENTITY = Quaternion()


def rot_x(a):
    return Quaternion((1, 0, 0), a)


def rot_y(a):
    return Quaternion((0, 1, 0), a)


def aim(arm_obj, bone, direction):
    """World rotation that swings `bone` from its rest direction to point
    along `direction` — the readable way to say 'arm up and out'."""
    b = arm_obj.data.bones[bone]
    rest = (b.tail_local - b.head_local).normalized()
    return rest.rotation_difference(Vector(direction).normalized())


def apply_pose(arm_obj, pose):
    """pose: {bone: {"rot": world Quaternion, "loc": world Vector, "scale":
    (side, along-bone, side)}}. Every bone not named returns to rest, so each
    sampled frame is a complete pose and loops close exactly."""
    for pb in arm_obj.pose.bones:
        spec = pose.get(pb.name, {})
        B = pb.bone.matrix_local.to_quaternion()
        Bi = B.inverted()
        q = spec.get("rot", IDENTITY)
        pb.rotation_quaternion = Bi @ q @ B
        pb.location = Bi @ Vector(spec.get("loc", (0, 0, 0)))
        sx, sy, sz = spec.get("scale", (1, 1, 1))
        pb.scale = (sx, sy, sz)


def smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


# Cakey's arms are 0.2u nubs: raised, they barely clear the bottom tier and the
# pose does not read from the town camera. Stretching the arm bone along its
# length while it is raised is the cartoon answer.
REACH = (1, 1.35, 1)


def squash(k):
    """Volume-ish preserving squash/stretch along the bone (local Y)."""
    side = 1 / math.sqrt(k)
    return (side, k, side)


# --- the six clips -------------------------------------------------------------
# Each clip is (frames, loop, pose_fn(t, arm_obj)) with t in [0, 1]. Loops are
# built from full periods of sin/cos, so frame 0 and the last frame match.


def idle(t, a):
    s = math.sin(math.tau * t)
    return {
        "body": {"scale": squash(1 + 0.025 * s)},
        "top": {"rot": rot_y(0.025 * math.sin(math.tau * t + 0.6))},
        "hat": {"rot": rot_y(0.09 * math.sin(math.tau * t + 1.2))},
        "arm.L": {"rot": rot_x(0.06 * s)},
        "arm.R": {"rot": rot_x(0.06 * s)},
    }


def walk(t, a):
    s = math.sin(math.tau * t)
    bob = 0.045 * (1 - math.cos(2 * math.tau * t)) / 2
    return {
        "root": {"loc": (0, 0, bob)},
        "body": {"rot": rot_y(0.05 * s)},
        "hat": {"rot": rot_y(-0.08 * s)},
        "leg.L": {"rot": rot_x(0.5 * s)},
        "leg.R": {"rot": rot_x(-0.5 * s)},
        "arm.L": {"rot": rot_x(-0.45 * s)},
        "arm.R": {"rot": rot_x(0.45 * s)},
    }


def wave(t, a):
    # Right arm overhead, swinging between up-and-out and nearly straight up,
    # two waves per loop. A little answering sway in the body and hat.
    k = (1 + math.sin(2 * math.tau * t)) / 2
    up = Vector((-0.55, -0.1, 0.83)).lerp(Vector((-0.12, -0.1, 0.99)), k)
    s = math.sin(math.tau * t)
    return {
        "arm.R": {"rot": aim(a, "arm.R", up), "scale": REACH},
        "body": {"rot": rot_y(0.06 * s)},
        "hat": {"rot": rot_y(-0.1 * s)},
        "arm.L": {"rot": rot_x(0.08 * s)},
    }


def celebrate(t, a):
    # Crouch, hop, land with a squash, recover — arms up the whole time,
    # pumping, so the loop closes on 'arms up' and crossfades handle entry.
    if t < 0.2:
        u = smooth(t / 0.2)
        z, k = -0.06 * u, 1 - 0.12 * u
    elif t < 0.6:
        u = (t - 0.2) / 0.4
        z = -0.06 * (1 - u) + 1.3 * u * (1 - u)
        k = 1 + 0.1 * math.sin(math.pi * u) - 0.12 * (1 - smooth(u * 4))
    elif t < 0.8:
        v = (t - 0.6) / 0.2
        z, k = 0.0, 1 - 0.12 * math.sin(math.pi * v)
    else:
        z, k = 0.0, 1.0
    pump = 0.12 * math.sin(2 * math.tau * t)
    return {
        "root": {"loc": (0, 0, z)},
        "body": {"scale": squash(k)},
        "arm.L": {"rot": aim(a, "arm.L", (0.45 + pump, -0.1, 0.89)), "scale": REACH},
        "arm.R": {"rot": aim(a, "arm.R", (-0.45 - pump, -0.1, 0.89)), "scale": REACH},
        "hat": {"rot": rot_y(0.12 * math.sin(math.tau * t))},
    }


def think(t, a):
    # Top tier tipped to one side, left hand up at the face tier, hat bobbing.
    s = math.sin(math.tau * t)
    return {
        "top": {"rot": rot_y(0.16 + 0.03 * s)},
        "hat": {"rot": rot_y(0.12 + 0.08 * math.sin(math.tau * t + 0.8))},
        # Hand up at the cheek, just in front of the face tier.
        "arm.L": {"rot": aim(a, "arm.L", (-0.3, -0.85, 0.45 + 0.06 * s)), "scale": REACH},
        "body": {"rot": rot_y(-0.04)},
    }


def oops(t, a):
    # Flinch back with arms flung out, then a side-to-side wobble that decays
    # to nothing, ending exactly at rest.
    f = smooth(t / 0.15) if t < 0.15 else 1 - smooth((t - 0.15) / 0.7)
    wob = 0.22 * math.sin(math.tau * 2.5 * t) * (1 - t) ** 2
    out_l = aim(a, "arm.L", (0.9, -0.1, 0.4))
    out_r = aim(a, "arm.R", (-0.9, -0.1, 0.4))
    return {
        "root": {"loc": (0, 0.07 * f, 0)},
        "body": {"rot": rot_x(-0.22 * f) @ rot_y(wob), "scale": squash(1 - 0.06 * f)},
        "top": {"rot": rot_y(-0.6 * wob)},
        "hat": {"rot": rot_y(0.8 * wob)},
        "arm.L": {"rot": IDENTITY.slerp(out_l, f)},
        "arm.R": {"rot": IDENTITY.slerp(out_r, f)},
    }


CLIPS = (
    ("Idle", 60, idle),
    ("Walk", 20, walk),
    ("Wave", 30, wave),
    ("Celebrate", 36, celebrate),
    ("Think", 60, think),
    ("Oops", 30, oops),
)


def animate(arm_obj):
    arm_obj.animation_data_create()
    for name, frames, fn in CLIPS:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        arm_obj.animation_data.action = action
        for f in range(frames + 1):
            apply_pose(arm_obj, fn(f / frames, arm_obj))
            for pb in arm_obj.pose.bones:
                pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
                pb.keyframe_insert("location", frame=f, group=pb.name)
                pb.keyframe_insert("scale", frame=f, group=pb.name)
    # Leave the rig unanimated and at rest, so the bind pose, the .blend and the
    # preview all show Cakey standing normally.
    arm_obj.animation_data.action = None
    apply_pose(arm_obj, {})


def main():
    repo, blend_out, png_out = gc.paths(__file__, "cakey")
    build()
    mesh = gc.join_with_palette("cakey")
    arm_obj = rig(mesh)
    animate(arm_obj)
    gc.save_blend(blend_out)
    gc.export_glb(
        repo,
        "cakey.glb",
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
    )
    gc.render_preview(png_out, APEX_U, distance_mult=2.6)


main()
