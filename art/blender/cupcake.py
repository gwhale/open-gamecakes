"""Gamecakes — the kid's cupcake character, as a library of parts.

    blender --background --factory-startup --python art/blender/cupcake.py

Every kid builds their own cupcake in the Cakey Store: three bases, two
frosting heights, a foil collar, five faces, four glasses, five hats and five
toppings, in any colours. So this is not one model but a PARTS LIBRARY: one
GLB (`public/models/cupcake/cupcake.glb`) holding a node per part, which
`buildCupcakeModel` in src/lib/town/three/avatar.ts clones and assembles per
kid. The node names below are a contract with that file's PART_NAMES; rename
one and the runtime silently falls back to the code-built part.

EVERY NODE'S ORIGIN IS ITS ATTACH POINT, and the runtime zeroes each clone's
position before placing it:
  * bodies (cupcake_*, cakepop_*, layered_*): the base centre, on the ground;
  * face parts: the feature's centre, facing front (-Y here, +Z in three);
  * glasses: the bridge centre, lenses at x = +-0.085;
  * hats: the middle of the brim's underside;
  * toppings: the point they rest on, everything above it.
The parts are laid out on a sheet for the .blend and the preview, and the
pivots carry them home.

COLOUR SLOTS. Whatever the kid colours is modelled white in a tint slot
(gamecakes.py TINT_SLOTS). What a slot means depends on the part: on a wrapper
or sponge `tint` is the paper and `tint2` its darker band; on frosting `tint`
is the icing; on a hat `tint` is the hat colour and `tint2` its shade; on
glasses `tint` is the frame. Everything else (eyes, gold, cherries) is a fixed
colour in the atlas.

Sizes match the code-built cupcake this replaces (about 0.9 units tall, base
at 0), because hats, faces and toppings are placed by the same anchors.
"""

import math
import os
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

TAU = math.tau

# Fixed colours. Hex values match the code-built cupcake's where it had one.
INK = 0x1F2937
WHITE = 0xFFFFFF
GOLD = 0xFCD34D
YELLOW = 0xFBBF24
ORANGE = 0xFB923C
CHERRY = 0xD9223F
PINK = 0xF472B6
CHEEK = 0xFB7185
MOUTH = 0x7F1D1D
LEAF = 0x4ADE80
STEM = 0x65A30D
BLUE = 0x60A5FA
PURPLE = 0xA78BFA
STICK = 0xE7CFA3
CANDLE = 0xFEF3C7
LENS = 0x111827
CLOUD = 0xF8FAFC


def mats():
    """One material per colour; the atlas keys on (colour, roughness)."""
    return {
        "ink": gc.material("Ink", INK, 0.35),
        "white": gc.material("White", WHITE, 0.85),
        "gold": gc.material("Gold", GOLD, 0.3),
        "yellow": gc.material("Yellow", YELLOW, 0.3),
        "orange": gc.material("Orange", ORANGE, 0.4),
        "cherry": gc.material("Cherry", CHERRY, 0.25),
        "pink": gc.material("Pink", PINK, 0.5),
        "cheek": gc.material("Cheek", CHEEK, 0.8),
        "mouth": gc.material("Mouth", MOUTH, 0.5),
        "leaf": gc.material("Leaf", LEAF, 0.5),
        "stem": gc.material("Stem", STEM, 0.6),
        "blue": gc.material("Blue", BLUE, 0.5),
        "purple": gc.material("Purple", PURPLE, 0.5),
        "stick": gc.material("Stick", STICK, 0.8),
        "candle": gc.material("Candle", CANDLE, 0.5),
        "lens": gc.material("Lens", LENS, 0.15),
        "cloud": gc.material("Cloud", CLOUD, 0.9),
        "tint": gc.tint("tint", 0.6),
        "tint2": gc.tint("tint2", 0.6),
    }


# --- mesh builders ----------------------------------------------------------


def _new_obj(name, parent):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def _slot(obj, mat):
    """Material slot index for `mat` on `obj`, adding it if needed."""
    names = [m.name for m in obj.data.materials]
    if mat.name not in names:
        obj.data.materials.append(mat)
        names.append(mat.name)
    return names.index(mat.name)


def lathe(name, mat, profile, parent=None, segs=20, smooth=True, closed=False, cap_bottom=True,
          cap_top=True, at=(0.0, 0.0, 0.0), band_mats=None):
    """Revolve a (radius, z) profile, bottom to top, round the Z axis. A radius
    of 0 makes a pole. `band_mats[i]` paints the band between profile points i
    and i+1 (stripes); `closed` joins the last point back to the first (a ring
    with thickness)."""
    obj = _new_obj(name, parent)
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((at[0], at[1], at[2] + z))])
        else:
            rings.append([
                bm.verts.new((at[0] + math.cos(i / segs * TAU) * r, at[1] + math.sin(i / segs * TAU) * r, at[2] + z))
                for i in range(segs)
            ])
    pairs = list(range(len(rings) - 1)) + ([len(rings) - 1] if closed else [])
    for b in pairs:
        lo, hi = rings[b], rings[(b + 1) % len(rings)]
        idx = _slot(obj, band_mats[b] if band_mats else mat)
        for i in range(segs):
            j = (i + 1) % segs
            if len(lo) == 1:
                # Pole at the bottom; recalc_face_normals below fixes the winding.
                f = bm.faces.new((lo[0], hi[i], hi[j]))
            elif len(hi) == 1:
                f = bm.faces.new((lo[i], lo[j], hi[0]))
            else:
                f = bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
            f.material_index = idx
            f.smooth = smooth
    if not closed:
        idx = _slot(obj, mat)
        if cap_bottom and len(rings[0]) > 1:
            f = bm.faces.new(list(reversed(rings[0])))
            f.material_index = idx
        if cap_top and len(rings[-1]) > 1:
            f = bm.faces.new(rings[-1])
            f.material_index = idx
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def dome(r, h, z0, steps=6, base=0.0):
    """Profile of a half-ellipsoid of radius r and height h standing at z0."""
    pts = []
    for i in range(steps + 1):
        a = i / steps * (math.pi / 2)
        pts.append((r * math.cos(a), z0 + h * math.sin(a)))
    if base > 0:
        pts.insert(0, (r, z0 - base))
    return pts


def blob(name, mat, radius, at, scale, parent, segs=14, rings=10):
    """A squashed sphere with its scale baked in (the runtime never rescales)."""
    obj = gc.ball(name, mat, radius, at, parent, segs=segs, rings=rings)
    obj.scale = scale
    return obj


def flat_shape(name, mat, outline, depth, parent, puff=0.0, at=(0.0, 0.0, 0.0)):
    """Extrude an outline drawn in the XZ plane (the front view) toward the
    viewer (-Y) by `depth`. With `puff`, the front face is pushed out to a
    centre point, so a star or heart reads as a little cushion, not a cutout."""
    obj = _new_obj(name, parent)
    bm = bmesh.new()
    back = [bm.verts.new((at[0] + x, at[1], at[2] + z)) for x, z in outline]
    front = [bm.verts.new((at[0] + x, at[1] - depth, at[2] + z)) for x, z in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((back[i], back[j], front[j], front[i]))
    bm.faces.new(list(reversed(back)))
    if puff > 0:
        cx = sum(x for x, _ in outline) / n
        cz = sum(z for _, z in outline) / n
        tip = bm.verts.new((at[0] + cx, at[1] - depth - puff, at[2] + cz))
        for i in range(n):
            bm.faces.new((front[i], front[(i + 1) % n], tip))
    else:
        bm.faces.new(front)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mat)
    return obj


def arc(name, mat, radius, tube, parent, at=(0.0, 0.0, 0.0), sweep=math.pi, segs=14):
    """A tube bent along an arc in the XZ plane, bulging up (an upside-down U):
    eyes shut, the smile. The runtime flips it with a half turn about the view
    axis. Ends are capped with a small ball so they read rounded."""
    obj = _new_obj(name, parent)
    bm = bmesh.new()
    ring_n = 6
    rings = []
    for s in range(segs + 1):
        a = s / segs * sweep
        cx, cz = math.cos(a) * radius, math.sin(a) * radius
        # Tube cross-section in the plane spanned by the radial dir and Y.
        rx, rz = math.cos(a), math.sin(a)
        ring = []
        for k in range(ring_n):
            t = k / ring_n * TAU
            off_r, off_y = math.cos(t) * tube, math.sin(t) * tube
            ring.append(bm.verts.new((at[0] + cx + rx * off_r, at[1] + off_y, at[2] + cz + rz * off_r)))
        rings.append(ring)
    for s in range(segs):
        for k in range(ring_n):
            q = (k + 1) % ring_n
            f = bm.faces.new((rings[s][k], rings[s][q], rings[s + 1][q], rings[s + 1][k]))
            f.smooth = True
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mat)
    return obj


def spiral(name, mat, parent, r0, r1, z0, z1, tube0, tube1, turns, points_per_turn=22, start=math.pi / 2):
    """Piped frosting: a tapering tube wound up a cone, from radius r0 at z0 to
    r1 at z1. Starts at the back (+Y), thin, so its start never shows. The
    last stretch climbs steeply into the little peak a piping bag leaves."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 1.0
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    n = int(turns * points_per_turn)
    sp = curve.splines.new("POLY")
    sp.points.add(n)
    for i in range(n + 1):
        t = i / n
        ease = t ** 0.85
        r = r0 + (r1 - r0) * ease
        z = z0 + (z1 - z0) * t
        a = start + t * turns * TAU
        sp.points[i].co = (math.cos(a) * r, math.sin(a) * r, z, 1.0)
        # The piping swells out of the bed over the first stretch, so its
        # start has no cut end to see from behind.
        swell = min(1.0, 0.25 + 0.75 * t / 0.12)
        sp.points[i].radius = (tube0 + (tube1 - tube0) * t) * swell
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    if parent:
        obj.parent = parent
    return obj


def star_outline(outer, inner, points=5, cx=0.0, cz=0.0):
    out = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = i / (points * 2) * TAU
        out.append((cx + math.sin(a) * r, cz + math.cos(a) * r))
    return out


def heart_outline(s, steps=8):
    """The same heart the code-built glasses used: point down, ~s wide."""
    def cubic(p0, p1, p2, p3):
        pts = []
        for i in range(steps):
            t = i / steps
            u = 1 - t
            pts.append(tuple(u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d
                             for a, b, c, d in zip(p0, p1, p2, p3)))
        return pts
    p0 = (0, -s * 0.55)
    left = cubic(p0, (-s * 0.9, -s * 0.05), (-s * 0.55, s * 0.6), (0, s * 0.25))
    right = cubic((0, s * 0.25), (s * 0.55, s * 0.6), (s * 0.9, -s * 0.05), p0)
    # Counter-clockwise seen from the front (-Y), like every other outline.
    return list(reversed(left + right))


# --- bodies -------------------------------------------------------------------


def pleated_wrapper(name, parent, m, r_bot=0.24, r_top=0.34, h=0.42, pleats=22, depth=0.016):
    """The paper liner: a frustum folded into pleats. Ridges are the old
    cylinder's radius, so the face sits where it always did; the rolled rim
    is the band colour."""
    obj = _new_obj(name, parent)
    bm = bmesh.new()
    n = pleats * 2
    rows = []
    for z, r in ((0.0, r_bot), (h, r_top)):
        rows.append([
            bm.verts.new((math.cos(i / n * TAU) * (r - (depth if i % 2 else 0)),
                          math.sin(i / n * TAU) * (r - (depth if i % 2 else 0)), z))
            for i in range(n)
        ])
    paper = _slot(obj, m["tint"])
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((rows[0][i], rows[0][j], rows[1][j], rows[1][i]))
        f.material_index = paper
    f = bm.faces.new(list(reversed(rows[0])))
    f.material_index = paper
    f = bm.faces.new(rows[1])
    f.material_index = paper
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    gc.torus(f"{name}Rim", m["tint2"], r_top + 0.002, 0.018, (0, 0, h - 0.012), parent, major=28, minor=6)
    return obj


def build_bodies(m):
    parts = {}

    # Cupcake: pleated liner, piped swirl, optional tall swirl and foil collar.
    root = parts["cupcake_wrapper"] = gc.root_empty("cupcake_wrapper")
    pleated_wrapper("Wrapper", root, m)

    root = parts["cupcake_frosting"] = gc.root_empty("cupcake_frosting")
    # A soft puddle under the piping fills the gaps between the turns.
    lathe("FrostingBed", m["tint"], dome(0.31, 0.16, 0.42, base=0.04), root, segs=24)
    spiral("FrostingSwirl", m["tint"], root, r0=0.25, r1=0.02, z0=0.47, z1=0.72,
           tube0=0.11, tube1=0.055, turns=2.6)

    root = parts["cupcake_frosting_tall"] = gc.root_empty("cupcake_frosting_tall")
    lathe("TallBed", m["tint"], dome(0.31, 0.16, 0.42, base=0.04), root, segs=24)
    spiral("TallSwirl", m["tint"], root, r0=0.25, r1=0.02, z0=0.47, z1=0.9,
           tube0=0.11, tube1=0.05, turns=3.8)

    root = parts["cupcake_collar"] = gc.root_empty("cupcake_collar")
    # Foil collar with a scalloped edge: a ring of little gold beads on a band.
    lathe("CollarBand", m["gold"], [(0.335, 0.38), (0.36, 0.40), (0.36, 0.43), (0.345, 0.445)], root,
          segs=28, smooth=False, closed=True)
    for i in range(14):
        a = i / 14 * TAU
        gc.ball(f"CollarBead{i}", m["gold"], 0.022, (math.cos(a) * 0.362, math.sin(a) * 0.362, 0.448), root,
                segs=6, rings=4)

    # Cake pop: stick and a candy-coated ball with a drip collar at the stick.
    root = parts["cakepop_stick"] = gc.root_empty("cakepop_stick")
    gc.cyl("Stick", m["stick"], 0.03, 0.6, (0, 0, 0.3), root, verts=10)

    root = parts["cakepop_ball"] = gc.root_empty("cakepop_ball")
    gc.ball("Ball", m["tint"], 0.3, (0, 0, 0.66), root, segs=24, rings=16)
    lathe("Drip", m["tint"], [(0.032, 0.33), (0.05, 0.37), (0.11, 0.39)], root, segs=16, cap_bottom=True,
          cap_top=False)

    # Layered cake: three sponge tiers (wrapper colours) and their icing.
    root = parts["layered_sponge"] = gc.root_empty("layered_sponge")
    for i, (rb, rt, h, z) in enumerate(((0.36, 0.34, 0.2, 0.0), (0.27, 0.25, 0.18, 0.25),
                                        (0.19, 0.17, 0.16, 0.48))):
        # A band of the darker colour halfway up each tier: the jam layer.
        mid = z + h * 0.5
        lathe(f"Tier{i}", m["tint"], [(rb, z), (rb - (rb - rt) * 0.45, mid - 0.012),
                                      (rb - (rb - rt) * 0.55, mid + 0.012), (rt, z + h)],
              root, segs=24, smooth=False, band_mats=[m["tint"], m["tint2"], m["tint"]])

    root = parts["layered_icing"] = gc.root_empty("layered_icing")
    for i, (r, z) in enumerate(((0.37, 0.2), (0.28, 0.43))):
        lathe(f"Icing{i}", m["tint"], [(r - 0.02, z), (r, z + 0.01), (r, z + 0.035), (r - 0.03, z + 0.05)],
              root, segs=24)
        # Piped beads round the icing's edge.
        beads = 16 if i == 0 else 12
        for k in range(beads):
            a = k / beads * TAU
            gc.ball(f"Bead{i}_{k}", m["tint"], 0.026, (math.cos(a) * (r - 0.004), math.sin(a) * (r - 0.004), z + 0.045),
                    root, segs=6, rings=4)
    lathe("Crown", m["tint"], dome(0.19, 0.14, 0.62, steps=7, base=0.0), root, segs=24)
    for k in range(10):
        a = k / 10 * TAU
        gc.ball(f"CrownBead{k}", m["tint"], 0.022, (math.cos(a) * 0.185, math.sin(a) * 0.185, 0.625), root,
                segs=6, rings=4)
    return parts


# --- face ---------------------------------------------------------------------


def build_face(m):
    parts = {}
    root = parts["face_eye"] = gc.root_empty("face_eye")
    blob("Eye", m["ink"], 0.032, (0, 0, 0), (1.0, 0.6, 1.3), root, segs=12, rings=8)
    gc.ball("EyeGlint", m["white"], 0.009, (-0.01, -0.019, 0.016), root, segs=6, rings=4)

    root = parts["face_eye_closed"] = gc.root_empty("face_eye_closed")
    arc("EyeShut", m["ink"], 0.03, 0.011, root)

    root = parts["face_smile"] = gc.root_empty("face_smile")
    arc("Smile", m["ink"], 0.05, 0.011, root)

    # The grin: an open D, flat edge on top at the origin, a strip of teeth.
    root = parts["face_grin"] = gc.root_empty("face_grin")
    d = [(math.cos(math.pi + i / 12 * math.pi) * 0.065, math.sin(math.pi + i / 12 * math.pi) * 0.065)
         for i in range(13)]
    flat_shape("Grin", m["mouth"], list(reversed(d)), 0.012, root)
    teeth = [(-0.05, -0.002), (-0.045, -0.018), (0.045, -0.018), (0.05, -0.002)]
    flat_shape("Teeth", m["white"], teeth, 0.004, root, at=(0, -0.012, 0))
    gc.ball("GrinTongue", m["pink"], 0.03, (0, -0.008, -0.045), root, segs=10, rings=6).scale = (1.1, 0.4, 0.6)

    root = parts["face_sleepy_mouth"] = gc.root_empty("face_sleepy_mouth")
    arc("SleepyMouth", m["ink"], 0.022, 0.01, root, sweep=TAU, segs=16)

    root = parts["face_tongue"] = gc.root_empty("face_tongue")
    blob("Tongue", m["pink"], 0.03, (0, 0, 0), (1.0, 0.5, 1.2), root, segs=10, rings=8)

    root = parts["face_cheek"] = gc.root_empty("face_cheek")
    blob("Cheek", m["cheek"], 0.03, (0, 0, 0), (1.3, 0.3, 0.8), root, segs=10, rings=8)
    return parts


# --- glasses ------------------------------------------------------------------

LENS_X = 0.085


def bridge(root, m):
    obj = gc.cyl("Bridge", m["tint"], 0.009, 0.06, (0, 0, 0.01), root, verts=8)
    obj.rotation_euler[1] = math.pi / 2
    return obj


def build_glasses(m):
    parts = {}
    for style in ("round", "sunnies"):
        root = parts[f"glasses_{style}"] = gc.root_empty(f"glasses_{style}")
        for sx in (-1, 1):
            ring = gc.torus(f"Rim{sx}", m["tint"], 0.055, 0.012, (sx * LENS_X, 0, 0), root, major=20, minor=8)
            ring.rotation_euler[0] = math.pi / 2
            if style == "sunnies":
                lens = gc.cyl(f"Lens{sx}", m["lens"], 0.052, 0.006, (sx * LENS_X, -0.002, 0), root, verts=18)
                lens.rotation_euler[0] = math.pi / 2
        bridge(root, m)

    root = parts["glasses_heart"] = gc.root_empty("glasses_heart")
    for sx in (-1, 1):
        flat_shape(f"Heart{sx}", m["tint"], heart_outline(0.07), 0.015, root, puff=0.006, at=(sx * LENS_X, 0, 0))
    bridge(root, m)

    root = parts["glasses_star"] = gc.root_empty("glasses_star")
    for sx in (-1, 1):
        flat_shape(f"Star{sx}", m["tint"], star_outline(0.075, 0.034), 0.015, root, puff=0.008, at=(sx * LENS_X, 0, 0))
    bridge(root, m)
    return parts


# --- hats ---------------------------------------------------------------------
# Heights (brim to top) match HAT_HEIGHT in avatar.ts, which lifts a topping
# onto the hat: party 0.38, beanie 0.24, top hat 0.31, wizard 0.5, crown 0.19.


def build_hats(m):
    parts = {}

    # Party hat: striped cone, white pom-pom.
    root = parts["hat_party"] = gc.root_empty("hat_party")
    prof = [(0.15 * (1 - i / 6), 0.34 * i / 6) for i in range(7)]
    lathe("Cone", m["tint"], prof, root, segs=20, smooth=False,
          band_mats=[m["tint"], m["tint2"], m["tint"], m["tint2"], m["tint"], m["tint"]])
    gc.torus("Trim", m["white"], 0.148, 0.018, (0, 0, 0.012), root, major=20, minor=6)
    gc.ball("PomPom", m["white"], 0.05, (0, 0, 0.35), root, segs=10, rings=8)

    # Beanie: knitted dome, rolled cuff in the shade, pom-pom.
    root = parts["hat_beanie"] = gc.root_empty("hat_beanie")
    lathe("Dome", m["tint"], dome(0.22, 0.187, -0.03, steps=7), root, segs=22, cap_bottom=False)
    gc.torus("Cuff", m["tint2"], 0.21, 0.035, (0, 0, -0.02), root, major=24, minor=8)
    gc.ball("Bobble", m["white"], 0.06, (0, 0, 0.19), root, segs=10, rings=8)

    # Top hat: brim, crown, band in the shade.
    root = parts["hat_tophat"] = gc.root_empty("hat_tophat")
    lathe("Brim", m["tint"], [(0.26, 0.0), (0.26, 0.025)], root, segs=28, smooth=False)
    lathe("Crown", m["tint"], [(0.17, 0.02), (0.16, 0.30), (0.155, 0.31)], root, segs=24, smooth=False)
    lathe("Band", m["tint2"], [(0.173, 0.035), (0.172, 0.085)], root, segs=24, smooth=False)

    # Wizard: wide brim, a cone that leans like it is floppy, gold band and stars.
    root = parts["hat_wizard"] = gc.root_empty("hat_wizard")
    lathe("Brim", m["tint"], [(0.3, 0.0), (0.3, 0.02)], root, segs=28, smooth=False)
    lean = gc.root_empty("WizardLean")
    lean.parent = root
    lean.location = (0, 0, 0.25)
    lean.rotation_euler[1] = -0.12  # tip leans to three's -x, as the code hat did
    lathe("Cone", m["tint"], [(0.19, -0.24), (0.13, -0.05), (0.07, 0.1), (0.0, 0.24)], lean, segs=20, smooth=False)
    lathe("Band", m["gold"], [(0.193, -0.23), (0.187, -0.19)], lean, segs=20, smooth=False)
    for i, (x, z, s) in enumerate(((-0.05, -0.1, 0.035), (0.045, 0.0, 0.025))):
        r_here = 0.19 - (z + 0.24) * (0.19 / 0.48)
        flat_shape(f"Star{i}", m["gold"], star_outline(s, s * 0.45), 0.006, lean, puff=0.004,
                   at=(x, -math.sqrt(max(0.0, r_here ** 2 - x * x)) + 0.004, z))

    # Crown: a gold band with five points, ball tips, jewels in the kid's colour.
    root = parts["hat_crown"] = gc.root_empty("hat_crown")
    lathe("Band", m["gold"], [(0.16, 0.0), (0.17, 0.11), (0.155, 0.11), (0.145, 0.0)], root, segs=24,
          smooth=False, closed=True)
    for i in range(5):
        a = i / 5 * TAU
        # Angle 0 faces the front (-Y), like the code crown.
        x, y = math.sin(a), -math.cos(a)
        gc.cone(f"Point{i}", m["gold"], 0.035, 0.0, 0.08, (x * 0.165, y * 0.165, 0.15), root, verts=8)
        gc.ball(f"Tip{i}", m["gold"], 0.016, (x * 0.165, y * 0.165, 0.195), root, segs=8, rings=5)
        gc.ball(f"Jewel{i}", m["tint"], 0.025, (x * 0.172, y * 0.172, 0.055), root, segs=8, rings=6)
    return parts


# --- toppings -----------------------------------------------------------------


def build_toppings(m):
    parts = {}

    root = parts["topping_cherry"] = gc.root_empty("topping_cherry")
    gc.ball("Cherry", m["cherry"], 0.1, (0, 0, 0.09), root, segs=14, rings=10)
    stem = gc.cyl("Stem", m["stem"], 0.008, 0.12, (0.02, 0, 0.23), root, verts=6)
    stem.rotation_euler[1] = 0.35
    leaf = blob("Leaf", m["leaf"], 0.03, (0.06, 0, 0.27), (1.4, 0.35, 0.7), root, segs=8, rings=6)
    leaf.rotation_euler[1] = -0.5

    # Candle: candy-striped, a wick and a two-tone flame.
    root = parts["topping_candle"] = gc.root_empty("topping_candle")
    bands = 6
    prof = [(0.035, -0.03 + 0.2 * i / bands) for i in range(bands + 1)]
    lathe("Candle", m["candle"], prof, root, segs=12, smooth=True,
          band_mats=[m["candle"] if i % 2 == 0 else m["pink"] for i in range(bands)])
    gc.cyl("Wick", m["ink"], 0.006, 0.03, (0, 0, 0.18), root, verts=6)
    lathe("Flame", m["yellow"], [(0.0, 0.18), (0.028, 0.2), (0.034, 0.225), (0.024, 0.255), (0.0, 0.3)], root,
          segs=12, band_mats=[m["orange"], m["yellow"], m["yellow"], m["yellow"]])

    # Sprinkles: a whipped-cream dollop scattered with sprinkles, so the pick
    # reads on a hat as well as on frosting.
    root = parts["topping_sprinkles"] = gc.root_empty("topping_sprinkles")
    lathe("Dollop", m["white"], [(0.0, -0.02), (0.09, -0.02), (0.1, 0.02), (0.08, 0.06), (0.045, 0.09), (0.0, 0.12)],
          root, segs=16)
    colours = [m["pink"], m["blue"], m["yellow"], m["leaf"], m["purple"]]
    for i in range(14):
        a = i * 2.39996  # golden angle: an even scatter without a grid
        t = 0.25 + 0.7 * ((i * 0.618) % 1)
        z = 0.12 * t if t < 1 else 0.12
        r = max(0.015, 0.1 * (1 - t) + 0.03)
        s = gc.cyl(f"Sprinkle{i}", colours[i % len(colours)], 0.009, 0.034,
                   (math.cos(a) * r, math.sin(a) * r, z - 0.01 + 0.025 * (1 - t)), root, verts=6)
        s.rotation_euler = (1.1 + 0.4 * math.sin(i * 1.3), 0.3 * math.cos(i), a)

    # Star: a gold cushion star standing up, one point down in the frosting.
    root = parts["topping_star"] = gc.root_empty("topping_star")
    flat_shape("Star", m["yellow"], star_outline(0.1, 0.045), 0.03, root, puff=0.025, at=(0, 0.015, 0.09))

    # Rainbow: five bands on an arch, a cloud at each foot.
    root = parts["topping_rainbow"] = gc.root_empty("topping_rainbow")
    bands_m = [m["cherry"], m["orange"], m["yellow"], m["leaf"], m["blue"]]
    for i, bm_ in enumerate(bands_m):
        r_out = 0.13 - i * 0.018
        r_in = r_out - 0.018
        outline = ([(math.cos(k / 12 * math.pi) * r_out, math.sin(k / 12 * math.pi) * r_out) for k in range(13)]
                   + [(math.cos(k / 12 * math.pi) * r_in, math.sin(k / 12 * math.pi) * r_in) for k in range(12, -1, -1)])
        flat_shape(f"Band{i}", bm_, list(reversed(outline)), 0.03, root, at=(0, 0.015, 0.03))
    for sx in (-1, 1):
        for k, (dx, dz, r) in enumerate(((0.0, 0.03, 0.035), (sx * 0.03, 0.02, 0.028), (-sx * 0.028, 0.02, 0.026))):
            gc.ball(f"Cloud{sx}_{k}", m["cloud"], r, (sx * 0.1 + dx, 0, dz), root, segs=10, rings=6)
    return parts


def layout(parts):
    """Spread the parts on a sheet (rows run back along +Y) and return the
    pivots for _join_groups: each part's attach point after the move."""
    rows = [
        ["cupcake_wrapper", "cupcake_frosting", "cupcake_frosting_tall", "cupcake_collar",
         "cakepop_stick", "cakepop_ball", "layered_sponge", "layered_icing"],
        ["face_eye", "face_eye_closed", "face_smile", "face_grin", "face_sleepy_mouth", "face_tongue",
         "face_cheek", "glasses_round", "glasses_sunnies", "glasses_heart", "glasses_star"],
        ["hat_party", "hat_beanie", "hat_tophat", "hat_wizard", "hat_crown"],
        ["topping_cherry", "topping_candle", "topping_sprinkles", "topping_star", "topping_rainbow"],
    ]
    spacing = [0.85, 0.3, 0.75, 0.4]
    groups = []
    y = 0.0
    for row, dx in zip(rows, spacing):
        x0 = -dx * (len(row) - 1) / 2
        for i, key in enumerate(row):
            at = (x0 + i * dx, y, 0.0 if row is rows[0] else 0.35)
            parts[key].location = at
            # The join names the node after the part; the empty must not hold
            # that name first, or the node exports as "<key>.001".
            parts[key].name = f"{key}_sheet"
            groups.append((key, parts[key], at))
        y += 0.8
    missing = set(parts) - {g[0] for g in groups}
    if missing:
        raise ValueError(f"parts missing from the sheet: {missing}")
    return groups


def main():
    gc.clear_scene()
    m = mats()
    parts = {}
    parts.update(build_bodies(m))
    parts.update(build_face(m))
    parts.update(build_glasses(m))
    parts.update(build_hats(m))
    parts.update(build_toppings(m))
    groups = layout(parts)
    bpy.context.view_layer.update()
    gc.ship(__file__, "cupcake", 2.6, distance_mult=2.8, groups=groups, atlas_cols=8, subdir="cupcake")


main()
