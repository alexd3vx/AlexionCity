# Phase 1: World

Goal: a walkable 3D district with the chosen HUD, avatars, three cameras, day and night, and collisions, running within a budget set for a budget Android phone.

**Gate:** runs on a real 3 GB Android. **Not verified:** I have no such phone. Draw calls and triangles are measured and within budget (below); real frame rate is unknown until it is tried on a device.

Status key: `[x]` done and tested here, `[~]` works but is a placeholder or only partly tested, `[ ]` not done. Items for you are marked **you**.

## Avatars

- [x] Asset tool splits each character into head, body, legs and feet files plus one rig per body frame; avatar pack 12.1 MB down to 6.1 MB
- [x] All 21 outfits mix freely inside a body frame (two frames: the men's and women's packs); tested by rendering parts mixed across every outfit
- [x] Parts are re-bound to a shared skeleton and merged into one skinned mesh, so an avatar is one draw call
- [x] 10 skin tones and 10 hair colours; the tint changes the model's named materials
- [x] Avatar editor in the Me panel: build, head, top, bottoms, shoes, skin, hair, shuffle; saved on the device and applied live
- [ ] Custom hair and accessory meshes in Blender (the next step after mix-and-match)
- [ ] Save the avatar to the player's account (Phase 2, with accounts and profiles)

## District

- [x] Seeded, data-driven layout: 4 streets each way with names, 9 blocks, 75 buildings, 222 trees, parked cars, lamps, bus stops, ATMs, plaza with fountain and benches, 17 places of interest (12 unit tests)
- [x] Default look from the first frame (simple shapes, lit windows at night), then real models swap in live after download, with no reload
- [x] Works with only the required packs (about 6.8 MB); landmarks from the optional pack keep stand-ins until it is downloaded
- [x] Level of detail per block: nearby blocks use the real models, far blocks one merged low-detail mesh
- [x] Ambient pedestrians walking pavement loops (4 on Low, 10 on High)
- [~] Billboards are procedural frames showing a "Your brand here" placeholder; the ad system is Phase 6
- [~] Only the first district; the other planned districts and the other countries come later

## Cameras, time, collisions

- [x] Chase, high and overhead cameras; the eye button cycles them; drag to orbit; recenter button
- [x] Day and night follow the player's real clock; sky, fog, light, lamps with pools of light, lit windows (12 unit tests)
- [x] Collision for the player against buildings, trees, cars and props, and for the camera against buildings; tested by walking into three real buildings
- [ ] First-person camera (later, as agreed)
- [~] Detailed (model) buildings have no lit windows at night, only a faint glow; far blocks show lit windows. A lighting and materials pass will unify this

## HUD (brand A)

- [x] Top pill: go home, time and sun or moon, "Where to?" with the current street, money, add button
- [x] Destination: pick a place from the map or the nearby strip; a beam marks it in the world, a bar shows direction and distance, a toast says you arrived
- [x] Side buttons (recenter, view, settings), minimap that turns with the camera, nearby-places strip, context button, bottom bar (Me, Buy, Map, Phone)
- [x] Map panel with every place; Me panel with the avatar editor, graphics setting (Auto, Low, High) and Downloads
- [~] Needs meters and the money counter are static previews until Phase 3
- [~] The context button and "Talk" show a short "coming in Phase 2 or 3" message; interiors and chat do not exist yet
- [~] Buy and Phone are honest "coming soon" panels (Phases 3 and 4)
- [ ] **you** Look at the HUD and say whether this is the style you want, or what to change. The gate item "HUD style chosen" needs your yes

## Performance (measured with `pnpm perf`, which needs a running dev server)

Draw calls and triangles do not depend on the machine. Budgets are proposals to confirm on a real phone.

| Tier | Budget                         | Worst measured spot      |
| ---- | ------------------------------ | ------------------------ |
| Low  | 120 draw calls, 150k triangles | 54 calls, 98k triangles  |
| High | 200 draw calls, 300k triangles | 83 calls, 243k triangles |

- [x] First load stays small: required packs are 6.8 MB (avatars 6.1 MB, city core 0.7 MB)
- [ ] **you** Frame rate and heat on a real 3 GB Android. Open the game with `?debug` to see fps, draw calls and triangles
- [ ] Texture compression (KTX2) and lighter versions of the heaviest models, to shrink the optional pack (7.2 MB)
