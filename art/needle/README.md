# Gamecakes Needle authoring

This directory is for the Needle Engine spike. Blender-authored Gamecakes world
assets live in `art/blender/`; see its README. Binary source is tracked with Git LFS. Exported scenes under `public/` deliberately
are not; see `.gitattributes`.

## Pinned spike toolchain

- Blender 4.5 LTS
- Needle Engine for Blender 1.x
- Needle Engine runtime 6.0.0-alpha.2 (spike only)
- `toktx` 4.1 or newer

This machine does not currently have Blender or `toktx` installed. Until those tools
are available, `npm run needle:generate-spike` deterministically generates the
placeholder Game Dome GLB used to prove the Next.js runtime integration.

## Authoring contract

- Put modular `.blend` source files under `art/needle/library/`.
- Use stable, unique object names. Runtime IDs must not depend on Blender UUIDs.
- Put exported scenes under `public/needle/scenes/`.
- Every exported scene must have a sibling `.manifest.json`.
- Run `npm run needle:validate` before review.
- Include a rendered preview when changing binary art.

The first Blender replacement must retain the nodes named in
`public/needle/scenes/game-dome-spike.manifest.json`.
