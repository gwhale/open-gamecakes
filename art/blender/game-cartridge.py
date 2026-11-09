"""Gamecakes — a game cartridge, one floating over each game's spot in town.

    blender --background --factory-startup --python art/blender/game-cartridge.py

Replaces the mini houses for games. The shell is the TINT slot, so the town gives
each game its own colour. The game's picture is not in this file: game-cartridge.ts
lays a plane carrying the cover and name over the frame, so these numbers must
match CARTRIDGE in that file:

  shell 2.3 wide, 0.34 deep, 2.1 tall including its 0.24 connector.
  frame 1.98 x 1.47 centred at height 1.18, on the front (-Y here, +Z in the town).
"""

import os
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 2.1
W = 2.3
D = 0.34
CONNECTOR_H = 0.24
FRAME_W = 1.98
FRAME_H = 1.47
FRAME_Z = 1.18


def rounded_box(name, mat, size, at, parent, bevel):
    """A box with softened edges, so it catches highlights like moulded plastic."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * size[0] + at[0]
        v.co.y = v.co.y * size[1] + at[1]
        v.co.z = v.co.z * size[2] + at[2]
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=3, profile=0.5, affect="EDGES")
    bm.to_mesh(mesh)
    bm.free()
    return obj


def build():
    gc.clear_scene()
    root = gc.root_empty("GameCartridge")

    m_shell = gc.tint("tint", 0.42)
    m_dark = gc.material("Cartridge_Dark", 0x2B2A33, 0.55)
    m_board = gc.material("Cartridge_Board", 0x3D5A45, 0.7)
    m_pin = gc.material("Cartridge_Pin", 0xD9A93A, 0.3)

    shell_h = APEX_U - CONNECTOR_H
    rounded_box("Shell", m_shell, (W, D, shell_h), (0, 0, CONNECTOR_H + shell_h / 2), root, 0.07)

    # The dark frame the game's picture sits in, standing just proud of the shell.
    rounded_box("Frame", m_dark, (FRAME_W, 0.03, FRAME_H), (0, -D / 2 - 0.005, FRAME_Z), root, 0.012)

    # Grip ribs across the top, and a finger scoop below the picture.
    for i in range(3):
        gc.box(f"Rib{i}", m_dark, (W * 0.74, 0.02, 0.03), (0, -D / 2 - 0.004, 2.04 - i * 0.055), root)
    gc.box("Scoop", m_dark, (W * 0.42, 0.02, 0.06), (0, -D / 2 - 0.004, 0.36), root)

    # The connector that plugs in: a circuit board with a row of gold contacts.
    gc.box("Board", m_board, (W * 0.76, D * 0.42, CONNECTOR_H), (0, 0, CONNECTOR_H / 2), root)
    pins = 11
    for i in range(pins):
        x = (i - (pins - 1) / 2) * 0.145
        gc.box(f"Pin{i}", m_pin, (0.09, D * 0.46, CONNECTOR_H * 0.74), (x, 0, CONNECTOR_H * 0.37), root)
    return root


def main():
    build()
    gc.ship(__file__, "game-cartridge", APEX_U, distance_mult=2.6)


main()
