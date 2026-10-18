"""Gamecakes — Cakey, the mascot, rigged and animated.

    blender --background --factory-startup --python art/blender/cakey.py

Keeps the procedural Cakey's silhouette from src/lib/town/three/cakey.ts (same
tier footprints and heights at scale 1, same palette and roughness), but bakes
it as a decorated cake rather than stacked boxes: soft rounded tiers with a
little bulge and crumb, a frosting cap on each tier with drips down its sides,
piped bead borders where the tiers meet, star rosettes round the cherry and a
scatter of sprinkles. Then it gives him a skeleton and six clips. The runtime
draws his face, contact shadow and tap box itself, so none of those are here.

The face is a flat plane in front of the vanilla tier (three z = 0.30). Nothing
modelled there may come further forward than that, which is why the vanilla
cap has no drips across the face.

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
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

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
# Decoration only: the cream piping (gamecakes.py PALETTE "cream") and one
# blueberry sprinkle colour (PALETTE "blueberry").
PIPING = gc.PALETTE["cream"]
SPRINKLE_BLUE = gc.PALETTE["blueberry"]


def _clear_of_face(x, y, nx, ny):
    """Vanilla drips stay off the front where the face plane sits."""
    return not (ny < -0.5 and abs(x) < 0.26)


def _clear_of_arms(x, y, nx, ny):
    """Strawberry drips stay off the sides where the arms come out."""
    return not (abs(nx) > 0.5 and abs(y + 0.04) < 0.16)


# The procedural tiers, bottom up: footprint (w, d), z range, and where the
# frosting cap's top sits (the old rim's top, so the next tier stands on it).
# n / cap_n are outline samples (about 0.075u apart on a tier, 0.027u on a cap,
# so a drip about 0.11u wide spans four samples and keeps a rounded end).
TIERS = (
    {"name": "Strawberry", "size": (0.92, 0.64), "z": (0.28, 0.56), "cap_top": 0.59,
     "cake": "strawberry", "frosting": "strawberryRim", "bone": "body",
     "n": 38, "cap_n": 112, "drip_slots": 14, "drip_max": 0.12, "keep": _clear_of_arms},
    {"name": "Vanilla", "size": (0.74, 0.54), "z": (0.58, 0.82), "cap_top": 0.84,
     "cake": "vanilla", "frosting": "vanillaRim", "bone": "body",
     "n": 30, "cap_n": 92, "drip_slots": 12, "drip_max": 0.1, "keep": _clear_of_face},
    {"name": "Mint", "size": (0.56, 0.44), "z": (0.84, 1.06), "cap_top": 1.08,
     "cake": "mint", "frosting": "mintRim", "bone": "top",
     "n": 24, "cap_n": 72, "drip_slots": 10, "drip_max": 0.09, "keep": lambda *_: True},
)


def drip_layout(rng, w, d, slots, max_len, keep):
    """Drips at roughly even spacing round a cap, each nudged, a few skipped,
    lengths varied, so the run looks poured rather than stamped."""
    drips = []
    for i, (x, y, nx, ny) in enumerate(rrect(w, d, 0.11, slots)):
        if not keep(x, y, nx, ny) or rng.random() < 0.2:
            continue
        where = (i + rng.uniform(-0.25, 0.25)) / slots
        drips.append((where, max_len * rng.uniform(0.4, 1.0), rng.uniform(0.05, 0.064)))
    return drips


def bind(obj, bone):
    """Rigid skinning: every vertex of this part follows one bone."""
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    return obj


# --- cake-shaped geometry ----------------------------------------------------
# Every tier is a rounded rectangle in plan. rrect() samples its outline evenly
# by arc length, starting at the FRONT centre (Blender -Y) and running
# anticlockwise seen from above, with the outward normal at each sample. An
# offset along that normal is exact for a rounded rectangle (it is the same
# shape with a bigger corner), so every ring of a tier, its cap, drips and
# piping are built from one set of samples and line up by construction.


def rrect(w, d, r, n):
    """n samples (x, y, nx, ny) round a w x d rectangle with corner radius r."""
    hw, hd = w / 2 - r, d / 2 - r
    q = math.pi / 2 * r
    # (length, point-at-u) for each straight edge and corner, in order.
    segs = (
        (hw, lambda u: (hw * u, -hd - r, 0.0, -1.0)),
        (q, lambda u: _arc(hw, -hd, r, -math.pi / 2 + u * math.pi / 2)),
        (2 * hd, lambda u: (hw + r, -hd + 2 * hd * u, 1.0, 0.0)),
        (q, lambda u: _arc(hw, hd, r, u * math.pi / 2)),
        (2 * hw, lambda u: (hw - 2 * hw * u, hd + r, 0.0, 1.0)),
        (q, lambda u: _arc(-hw, hd, r, math.pi / 2 + u * math.pi / 2)),
        (2 * hd, lambda u: (-hw - r, hd - 2 * hd * u, -1.0, 0.0)),
        (q, lambda u: _arc(-hw, -hd, r, math.pi + u * math.pi / 2)),
        (hw, lambda u: (-hw + hw * u, -hd - r, 0.0, -1.0)),
    )
    total = sum(length for length, _ in segs)
    out = []
    for i in range(n):
        s = i / n * total
        for length, at in segs:
            if s <= length or at is segs[-1][1]:
                out.append(at(min(1.0, s / length) if length else 0.0))
                break
            s -= length
    return out


def _arc(cx, cy, r, a):
    return (cx + r * math.cos(a), cy + r * math.sin(a), math.cos(a), math.sin(a))


def sweep(name, mat, rings, top=None, bottom=None):
    """Skin closed rings of equal length, listed bottom-to-top along the
    surface, with smooth-shaded quads; `top` / `bottom` close an end with a
    fan to that point. Rings must run anticlockwise seen from above (rrect
    order), which makes every face point outward without a normals pass —
    recalc_face_normals guesses wrong on open shells like a frosting cap."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for lo, hi in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((lo[i], lo[j], hi[j], hi[i])).smooth = True
    if top is not None:
        c = bm.verts.new(top)
        for i in range(n):
            bm.faces.new((vs[-1][i], vs[-1][(i + 1) % n], c)).smooth = True
    if bottom is not None:
        c = bm.verts.new(bottom)
        for i in range(n):
            bm.faces.new((vs[0][(i + 1) % n], vs[0][i], c)).smooth = True
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return obj


def ring(samples, off, z, wobble=None):
    """One ring at height z, pushed `off` out along the outline normal (plus a
    per-sample `wobble`, for crumb)."""
    return [
        (x + nx * (off + (wobble[i] if wobble else 0)), y + ny * (off + (wobble[i] if wobble else 0)), z)
        for i, (x, y, nx, ny) in enumerate(samples)
    ]


def tier(name, mat, w, d, h, z0, rng, n, r=0.11, bevel=0.035, bulge=0.009, crumb=0.0035,
         close_bottom=False):
    """A soft sponge tier: rounded corners, a rounded bottom edge, sides that
    bulge a little at mid-height, and a faint per-vertex wobble so the light
    breaks up on it like crumb instead of sliding off a box. The top is left
    open; a frosting cap sits over it."""
    s = rrect(w, d, r, n)
    wob = lambda: [rng.uniform(-crumb, crumb) for _ in range(n)]  # noqa: E731
    rings = [
        ring(s, -bevel, z0),
        ring(s, -bevel * (1 - math.sin(math.pi / 4)), z0 + bevel * (1 - math.cos(math.pi / 4))),
        ring(s, 0, z0 + bevel, wob()),
        ring(s, bulge, z0 + h * 0.55, wob()),
        ring(s, 0, z0 + h),
    ]
    return sweep(name, mat, rings, bottom=(0, 0, z0) if close_bottom else None)


def cap(name, mat, w, d, top, n, drips, r=0.11, out=0.018, skirt=0.045):
    """The frosting poured over a tier: a flat top, a rounded lip just proud of
    the tier wall, and a skirt whose lower edge runs down into drips. `drips`
    is [(where, length, half_width)], `where` a fraction round the outline
    from the front centre. Each drip has an elliptical end, so it reads as a
    rounded run, not a notch."""
    s = rrect(w, d, r, n)
    span = 2 * (w + d)  # close enough to the outline length for widths

    def drop(f):
        deepest = 0.0
        for at, length, half in drips:
            u = abs((f - at + 0.5) % 1.0 - 0.5) * span / half
            if u < 1:
                deepest = max(deepest, length * math.sqrt(1 - u * u))
        return deepest

    hem = [top - skirt - drop(i / n) for i in range(n)]
    rings = [
        # Underside back into the tier, so a low camera never sees inside.
        [(x - nx * 0.012, y - ny * 0.012, z) for (x, y, nx, ny), z in zip(s, hem)],
        [(x + nx * out, y + ny * out, z) for (x, y, nx, ny), z in zip(s, hem)],
        ring(s, out + 0.004, top - 0.014),
        ring(s, out - 0.03, top),
    ]
    return sweep(name, mat, rings, top=(0, 0, top))


def bead_border(name, mat, w, d, z, n_beads, radius, r=0.11, out=0.0, sides=4):
    """Piped bead border round a tier's foot: a tube along the outline whose
    radius swells and pinches twice per bead."""
    s = rrect(w, d, r, n_beads * 2)
    rings = []
    for k in range(sides):
        a = -math.pi / 2 + k / sides * math.tau  # first point straight down
        rings.append([
            (
                x + nx * (out + math.cos(a) * radius * (1.0 if i % 2 == 0 else 0.6)),
                y + ny * (out + math.cos(a) * radius * (1.0 if i % 2 == 0 else 0.6)),
                z + math.sin(a) * radius * (1.0 if i % 2 == 0 else 0.6),
            )
            for i, (x, y, nx, ny) in enumerate(s)
        ])
    # A tube is rings round the path, not along it: transpose so each ring is
    # one cross-section point travelling the whole outline, and close it.
    obj = sweep(name, mat, rings + [rings[0]])
    return obj


def rosette(name, mat, at, radius=0.044, height=0.042, points=5):
    """A piped star: a fluted base, a smaller twisted ring, a peak."""
    x0, y0, z0 = at
    base, mid = [], []
    for i in range(points * 2):
        a = i / (points * 2) * math.tau
        rr = radius * (1.0 if i % 2 == 0 else 0.7)
        base.append((x0 + math.cos(a) * rr, y0 + math.sin(a) * rr, z0))
        a2 = a + math.pi / (points * 2)
        rr2 = radius * (0.72 if i % 2 == 0 else 0.55)
        mid.append((x0 + math.cos(a2) * rr2, y0 + math.sin(a2) * rr2, z0 + height * 0.6))
    return sweep(name, mat, [base, mid], top=(x0, y0, z0 + height))


def sprinkle(name, mat, centre, normal, spin):
    """A tiny candy rod lying flat on a tier wall, turned `spin` about the
    wall normal."""
    obj = gc.box(name, mat, (1, 1, 1), (0, 0, 0))
    n = Vector(normal).normalized()
    t = Vector((0, 0, 1)).cross(n).normalized()
    up = n.cross(t)
    along = t * math.cos(spin) + up * math.sin(spin)
    basis = Matrix((along, n, along.cross(n))).transposed().to_4x4()
    size = Matrix.Diagonal((0.036, 0.012, 0.012, 1.0))
    obj.matrix_world = Matrix.Translation(Vector(centre) + n * 0.004) @ basis @ size
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

    m["cream"] = gc.material("Frosting_Cream", PIPING, FROSTING)
    sprinkle_mats = [
        gc.material(f"Candy_Sprinkle{i}", hex_color, CANDY)
        for i, hex_color in enumerate((C["mint"], C["vanilla"], PIPING, SPRINKLE_BLUE))
    ]
    rng = random.Random(7)  # fixed seed: the same crumb, drips and sprinkles every build

    # ---- Three tiers, each with its frosting cap. Footprints, heights and
    #      colours are the procedural Cakey's; (w, d) in Blender. ----
    for spec in TIERS:
        name, (w, d), (z0, z1), top = spec["name"], spec["size"], spec["z"], spec["cap_top"]
        bone = spec["bone"]
        bind(tier(f"Tier{name}", m[spec["cake"]], w, d, z1 - z0, z0, rng, spec["n"],
                  close_bottom=name == "Strawberry"), bone)
        drips = drip_layout(rng, w, d, spec["drip_slots"], spec["drip_max"], spec["keep"])
        bind(cap(f"Cap{name}", m[spec["frosting"]], w, d, top, spec["cap_n"], drips), bone)

    # ---- Piped bead borders where a tier stands on the one below. At the
    #      front of the vanilla tier the beads sit under the mouth, so they
    #      stay flush (out=0) and the face plane at y=-0.30 stays in front. ----
    bind(bead_border("BorderVanilla", m["cream"], 0.74, 0.54, 0.602, 37, 0.02), "body")
    bind(bead_border("BorderMint", m["strawberryRim"], 0.56, 0.44, 0.852, 29, 0.018), "top")

    # ---- Star rosettes round the cherry on the mint top ----
    for i, (x, y, _nx, _ny) in enumerate(rrect(0.39, 0.27, 0.05, 8)):
        bind(rosette(f"Rosette{i}", m["cream"], (x, y, 1.078)), "top")

    # ---- Sprinkles on the strawberry tier (clear of the arms) ----
    wall = rrect(0.92, 0.64, 0.11, 240)
    placed = 0
    while placed < 16:
        x, y, nx, ny = wall[rng.randrange(len(wall))]
        z = rng.uniform(0.32, 0.5)
        if abs(x) > 0.38 and abs(y + 0.04) < 0.16:
            continue
        bulge = 0.009 * math.sin(math.pi * min(1.0, (z - 0.28) / (0.28 * 0.55)))
        bind(sprinkle(f"Sprinkle{placed}", sprinkle_mats[placed % len(sprinkle_mats)],
                      (x + nx * bulge, y + ny * bulge, z), (nx, ny, 0), rng.uniform(0, math.pi)), "body")
        placed += 1

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
