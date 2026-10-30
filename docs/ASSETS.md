# Assets

Raw model downloads live in `assets-src/raw/<pack>/` and are **not** in git (about 75 MB). What is in git: `assets-src/licences.json` (one entry per model) and `assets-src/packs.json` (which models go in which pack).

## Adding models

1. Copy the `.glb` files into `assets-src/raw/<pack-name>/`.
2. `pnpm --filter @alexioncity/asset-tools cli scaffold --root ../../assets-src` adds a licence entry for each new file. It marks them `user-attested` (you said they are CC0). Open each model's source page, confirm the licence, set `status` to `verified`, and add `author` for any CC-BY model.
3. `pnpm assets:validate` checks the manifest against the files. Errors block a build; `user-attested` shows as a warning.
4. Add the files to a pack in `assets-src/packs.json` (exact paths or `folder/*`).
5. `pnpm assets:build` optimizes everything and writes versioned packs and `manifest.json` to `packs-out/`.
6. `pnpm dev:client` serves `packs-out/` at `/packs`; open Downloads in the app.

On a machine without `assets-src/raw`, `assets:validate` checks only the manifest format.

## What the optimizer does, measured on the current packs

| Pack                             | Models | Raw     | After   |
| -------------------------------- | ------ | ------- | ------- |
| avatars (modular men and women)  | 21     | 33.2 MB | 12.1 MB |
| city-core                        | 19     | 2.0 MB  | 0.6 MB  |
| city-extras (half the triangles) | 8      | 8.7 MB  | 7.2 MB  |
| interiors (furniture kit)        | 117    | 2.9 MB  | 0.8 MB  |

Required packs on first load: avatars plus city-core, about 6.8 MB.

It welds vertices, optionally simplifies, removes duplicates and unused data, quantizes, and compresses with meshopt. The client reads meshopt, and the 3D loader must register the decoder when Phase 1 loads models.

## Known limits

- **Simplification is patchy.** It works on single-material models (the hospital drops from 12,600 to 3,800 triangles at 30%). It barely changes the faceted multi-material models (town house 41,800 to 32,300) or the skinned characters. Heavy models such as the town house and the GTR-style car need a Blender decimate pass or a hand-made lighter version before they appear in a busy street.
- **Avatars are split.** The pipeline cuts each character into head, body, legs and feet files and ships the skeleton and 24 animation clips once per body frame, which is why the avatar pack is half the size and parts can be mixed. Each part's quantization is baked into its bind matrices, so the client brings parts into one space before merging them.
- **Textures are not compressed yet.** KTX2 needs an external encoder. The extras pack is mostly textures, which is why it only shrinks from 8.7 to 7.2 MB.
- **Four cars carry real brand names** (Nissan 180MX, Dodge Challenger, Nissan GTR, Mitsubishi L200). They are in `licences.json` but not in any pack. They are reworked into fictional cars first.
