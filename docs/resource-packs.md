# Resource packs and item rendering

## Using packs

Open an inventory slot and choose **Resource Packs**. Import a ZIP or select its folder. A pack must contain `pack.mcmeta`; a single enclosing folder is accepted. Packs, their order and enabled state are saved in this browser's IndexedDB. The first enabled pack wins; missing assets fall through lower packs and then vanilla. Applicable overlays and namespace/path filters are applied for resource format **97.1**.

Use the checkboxes, Up/Down and Delete controls to manage layers. Failed imports leave the current layers intact. Standard Java assets and legacy `models/item` overrides are supported. OptiFine and other MOD-only extensions are outside the supported format.

Custom `assets/<namespace>/items/*.json` definitions and legacy override model variants appear in the item list. For a model JSON without an item definition, register its model ID with a vanilla base item ID. **Upload Custom Item** continues to accept a standalone image.

Click an item to place it immediately. Use its small appearance-settings button only when you want to customize `item_model`, CustomModelData numbers and typed arrays, potion/dye colors, trim material, banner/shield base colors and patterns, pot decorations or glint. Block state uses the default GUI context and has no input prompt. Pattern IDs are standard texture names such as `stripe_center`; colors use Java dye names. Player heads accept an explicitly selected 64×64 or 64×32 skin PNG; maps accept an explicitly selected image. No remote player-profile lookup is performed.

Changing packs updates displayed inventory items and history through their item IDs and appearance settings. If a custom definition disappears, its slot and instance ID remain and its icon shows `?` with a reason; open the slot to select a replacement. PNG export reports unresolved items instead of silently substituting stale images.

## Rendering and delivery

`lib/minecraft/renderer.ts` is shared by the browser and `scripts/render-harness.ts`. A single queued WebGL renderer reuses decoded textures and releases per-render meshes/materials. Texture and rendered-image caches keep at most 128 and 256 entries. Pack changes dispose the old renderer and retire Blob URLs; visible references keep their URL until replaced. Result keys include pack content hashes/order, appearance, the vanilla bundle hash and renderer version.

The generated catalog has one atlas URL and per-item ID/name/cell coordinates. Both the UI and PNG export crop the same atlas; there are no individual vanilla PNGs in `public`. Atlas and asset ZIP URLs contain SHA-256-derived hashes and are cached immutably. `items.json` requires revalidation, keeping coordinates and image versions together.

GUI scale follows the official client's `GuiItemAtlas`: one model unit fills the 16×16 item cell before `display.gui` transforms. Detected slot interiors exclude the border; preview and PNG export use the full interior with identical bounds and no additional padding or shrinking.

Resource packs are extracted in a browser worker. Imports check paths, ZIP directory bounds, CRC, encryption, file counts, decompressed sizes, PNG dimensions/decoding, JSON and model inheritance. Limits: 128 MiB ZIP, 256 MiB decompressed, 16 MiB per file, 20,000 files and 16 million pixels per PNG. Extruded generated-item textures are limited to 512×512 pixels to bound mesh memory. No imported file is sent to a server. The vanilla ZIP is lazy and stored under its full content hash in IndexedDB; ordinary atlas use never needs it.

Animations freeze at the first frame listed by `.mcmeta`, or frame 0. The GUI context fixes dimension to the overworld, time/compass to zero and seasonal date to January 1; use/world animations are not simulated. Maps and player heads use standard visuals unless their local image is explicitly supplied. GUI backgrounds are not affected by packs.

## Source and accuracy

The generator verifies the pinned [official 26.3 client](https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar) against SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`. `scripts/registry-26.3.json` comes from the official server data generator's `minecraft:item` registry report. The seven default-glint items in `lib/minecraft/defaults.ts` come from the same version's item component report.

`native-geometry.json` records cube UVs, dimensions, offsets, rotations and deformation from the client's ChestModel, SkullModel, HumanoidHeadModel, DragonHeadModel, PiglinHeadModel, ShulkerModel, ShieldModel, TridentModel, BannerModel, ConduitModel, DecoratedPotModel and CopperGolemStatueModel mesh builders. TypeScript applies their GUI model transforms and textures. Generated items use the client's ItemModelGenerator depth (7.5–8.5) and opaque-edge extrusion.

Shape, orientation, texture, transparency and major colors aim to match the game's inventory display. Three.js lighting, static glint and pixel scaling can differ. Automated checks cover every catalog ID, visible output except air, representative native/cuboid shapes, color/pattern variants and browser/pre-generation consistency. An actual game screenshot comparison still requires manual validation; these tests do not establish pixel-perfect parity with Minecraft.

To change the rendering algorithm, increment `RENDERER_VERSION` in `types.ts`, regenerate and run the validation commands in the README. Keep old hashed files available when deploying a changed catalog so an already-open tab can finish using its previous coordinates. The generator writes hashed images first and replaces the catalog last; it does not delete previous hashed releases automatically.
