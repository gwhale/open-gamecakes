"""Gamecakes — tiling normal map for the town's candy sea.

    blender --background --factory-startup --python art/blender/water-normals.py

Writes public/textures/town/water-normal.png (the runtime texture) and
art/blender/water-normals-preview.png (a 2x2 tiling, lit, to check for seams).

The waves come from Blender's Ocean modifier, an FFT ocean (Tessendorf), so the
wave shapes and how big and small swells mix are real ocean physics. Its
output is periodic over `spatial_size` by construction, which is what makes the
map tile with no seam. Three things then make it read as cake rather than sea:

  1. LOW-PASS. Everything shorter than CUTOFF of the tile is dropped. Real chop
     is busy and noisy; what is left are rounded, glossy swells.
  2. FROSTING PROFILE. Heights go through tanh, which flattens the extremes into
     soft plateaus: crests read as dollops of whipped cream and troughs as
     smooth, instead of sharp peaks.
  3. GENTLE STRENGTH. The normals are shallow, so the sun makes broad soft
     highlights that drift, not glittery sparkle.

No .blend is saved: the modifier settings below are the whole source.
"""

import os

import bpy
import numpy as np

STEM = "water-normal"
OUT_PX = 512  # runtime texture size; power of two for mipmaps

# Ocean modifier. The FFT grid is RESOLUTION squared: 16 gives 256x256.
RESOLUTION = 16
SPATIAL_SIZE = 60.0  # metres per tile; with WIND sets the swell size in the tile
WIND = 5.0  # m/s
ALIGNMENT = 0.0  # 0 = waves from every direction, higher = aligned to the wind
DIRECTION = 0.55  # radians; keeps swells off the tile axes so repeats hide
SEED = 7

CUTOFF = 16  # keep wavelengths of tile/16 and longer (cycles per tile)
FROSTING = 1.7  # tanh softness of crests and troughs; 0 would be off
STRENGTH = 3.2  # slope multiplier; higher = bumpier, lower = glassier


def ocean_heights() -> np.ndarray:
    """One periodic height field from the Ocean modifier, rows = +Y."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add()
    obj = bpy.context.active_object
    mod = obj.modifiers.new("Ocean", "OCEAN")
    mod.geometry_mode = "GENERATE"
    mod.resolution = mod.viewport_resolution = RESOLUTION
    mod.spatial_size = int(SPATIAL_SIZE)
    mod.wind_velocity = WIND
    mod.wave_alignment = ALIGNMENT
    mod.wave_direction = DIRECTION
    mod.choppiness = 0.0  # heights only: chop moves vertices sideways off the grid
    mod.random_seed = SEED

    dg = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(dg).to_mesh()
    co = np.empty(len(mesh.vertices) * 3, np.float64)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)

    # The generated grid repeats its first row and column at the far edge
    # (65x65 for a 64 FFT). Sort into rows by Y then X, then drop the repeats.
    n = int(round(np.sqrt(len(co))))
    order = np.lexsort((co[:, 0], co[:, 1]))
    grid = co[order, 2].reshape(n, n)
    return grid[:-1, :-1]


def frosting(h: np.ndarray) -> np.ndarray:
    """Low-pass + resample to OUT_PX in one FFT, then the tanh profile.

    Zero-padding the spectrum is exact periodic interpolation, so the upscaled
    map still tiles perfectly."""
    n = h.shape[0]
    spec = np.fft.fftshift(np.fft.fft2(h))
    f = np.arange(n) - n // 2
    fx, fy = np.meshgrid(f, f)
    radius = np.hypot(fx, fy)
    # Smooth roll-off rather than a hard cut, which would ring.
    spec *= np.clip(1.0 - (radius - CUTOFF) / 6.0, 0.0, 1.0)

    big = np.zeros((OUT_PX, OUT_PX), complex)
    o = OUT_PX // 2 - n // 2
    big[o:o + n, o:o + n] = spec
    out = np.real(np.fft.ifft2(np.fft.ifftshift(big)))

    out /= np.abs(out).max()
    if FROSTING > 0:
        out = np.tanh(FROSTING * out) / np.tanh(FROSTING)
    return out


def normals(h: np.ndarray) -> np.ndarray:
    """Tangent-space normals, OpenGL convention (green = +Y), as three expects.
    np.roll wraps, so the edge pixels' slopes come from the opposite edge."""
    scale = STRENGTH * h.shape[0] / 256.0
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * scale
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * scale
    nrm = np.dstack((-dx, -dy, np.ones_like(h)))
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    return nrm


def save_png(rgb: np.ndarray, path: str, colorspace: str):
    """rgb: (rows bottom-up, cols, 3) in 0..1."""
    hgt, wid = rgb.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), wid, hgt, alpha=False)
    img.colorspace_settings.name = colorspace
    rgba = np.dstack((rgb, np.ones((hgt, wid))))
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print(f"[water] wrote {path}")


def preview(nrm: np.ndarray) -> np.ndarray:
    """2x2 tiling shaded by a low sun with the town's water blue, so a seam or
    an obvious repeat shows up as a line or a grid."""
    tiled = np.tile(nrm, (2, 2, 1))
    sun = np.array([-0.5, 0.45, 0.74])
    sun /= np.linalg.norm(sun)
    lit = np.clip(tiled @ sun, 0, 1)[..., None]
    spec = (np.clip(tiled @ ((sun + [0, 0, 1]) / np.linalg.norm(sun + [0, 0, 1])), 0, 1) ** 60)[..., None]
    blue = np.array([0x3B, 0x82, 0xF6]) / 255.0
    return np.clip(blue * (0.35 + 0.75 * lit) + spec, 0, 1)


def main():
    here = os.path.dirname(os.path.realpath(__file__))
    repo = os.path.dirname(os.path.dirname(here))
    out_dir = os.path.join(repo, "public", "textures", "town")
    os.makedirs(out_dir, exist_ok=True)

    h = frosting(ocean_heights())
    nrm = normals(h)
    save_png(nrm * 0.5 + 0.5, os.path.join(out_dir, f"{STEM}.png"), "Non-Color")
    save_png(preview(nrm), os.path.join(here, "water-normals-preview.png"), "Non-Color")


main()
