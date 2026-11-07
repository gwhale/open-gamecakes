"""Gamecakes — mint puff tree, the plain "Tree" build piece kids buy and place.

    blender --background --factory-startup --python art/blender/tree-mint-puff.py

A chocolate trunk under a cloud of mint buttercream puffs, dotted with cherry
sprinkles. Origin at the foot, centred in a one-unit grid square.

No tint slot, so it stays one material and one instanced draw.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import gamecakes as gc  # noqa: E402

APEX_U = 1.6


def build():
    gc.clear_scene()
    root = gc.root_empty("TreeMintPuff")

    m_trunk = gc.material("Chocolate", 0x78350F, 0.7)
    m_mint = gc.material("Buttercream_Mint", 0x4ADE80, 0.5)
    m_mint2 = gc.material("Buttercream_MintLight", gc.PALETTE["mint"], 0.5)
    m_cherry = gc.material("Cherry", gc.PALETTE["cherry"], 0.25)

    gc.cone("Trunk", m_trunk, 0.12, 0.08, 0.9, (0, 0, 0.45), root, verts=8)
    # Two branch stubs so the trunk reads as a tree, not a post.
    for i, (x, rot) in enumerate(((0.08, 0.6), (-0.08, -0.6))):
        b = gc.cyl(f"Branch{i}", m_trunk, 0.03, 0.22, (x, 0, 0.78), root, verts=6)
        b.rotation_euler[1] = rot

    # Canopy puffs: (radius, x, y, z, material).
    puffs = [
        (0.42, 0.0, 0.0, 1.06, m_mint),
        (0.3, 0.24, -0.08, 1.28, m_mint2),
        (0.28, -0.22, 0.1, 1.27, m_mint2),
        (0.24, 0.02, 0.2, 1.36, m_mint),
        (0.22, -0.04, -0.06, APEX_U - 0.22, m_mint2),
    ]
    for i, (r, x, y, z, m) in enumerate(puffs):
        gc.ball(f"Puff{i}", m, r, (x, y, z), root, segs=12, rings=8)

    for i, (x, y, z) in enumerate((
        (0.3, -0.28, 0.98), (-0.34, -0.12, 1.1), (0.05, -0.36, 1.32),
        (0.38, 0.12, 1.2), (-0.2, 0.3, 1.02), (-0.12, -0.2, 1.48),
    )):
        gc.ball(f"Cherry{i}", m_cherry, 0.055, (x, y, z), root, segs=8, rings=5)

    return root


def main():
    build()
    gc.ship(__file__, "tree-mint-puff", APEX_U, distance_mult=2.4)


main()
