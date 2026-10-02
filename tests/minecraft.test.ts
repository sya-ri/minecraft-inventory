import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unzipSync, zipSync } from "fflate";
import sharp from "sharp";
import { Assets, mergePacks } from "../lib/minecraft/assets";
import { catalogItems, itemKey, validatePacks } from "../lib/minecraft/client";
import { itemBounds } from "../lib/minecraft/draw-item";
import { digest, makePack, unzipPack } from "../lib/minecraft/pack";
import { property, tintColor } from "../lib/minecraft/renderer";
import type { Catalog, Files } from "../lib/minecraft/types";
import registry from "../scripts/registry-26.3.json";

const encode = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value));
const metadata = encode({ pack: { min_format: [97, 1], max_format: [97, 1] } });

test("preview/export item bounds share a 10% inset at any GUI scale", () => {
    for (const [side, inset, size] of [
        [16, 2, 12],
        [32, 3, 26],
        [48, 5, 38],
        [64, 6, 52],
    ]) {
        assert.deepEqual(
            itemBounds({ x: 10, y: 20, width: side, height: side }),
            { x: 10 + inset, y: 20 + inset, size },
        );
    }
    assert.deepEqual(itemBounds({ x: 10, y: 20, width: 64, height: 32 }), {
        x: 29,
        y: 23,
        size: 26,
    });
});

test("published catalog covers the official registry with one shared atlas", async () => {
    const catalog = JSON.parse(
        readFileSync("public/items.json", "utf8"),
    ) as Catalog;
    assert.equal(catalog.version, "26.3");
    assert.equal(
        catalog.atlas.cellSize,
        128,
        "Keep the renderer's full resolution for enlarged block previews",
    );
    assert.equal(catalog.items.length, 1658);
    assert.deepEqual(catalog.items.map((i) => i.itemId).sort(), registry);
    assert.equal(new Set(catalog.items.map((i) => `${i.x}:${i.y}`)).size, 1658);
    assert(
        catalog.items.every(
            (i) =>
                i.x >= 0 &&
                i.y >= 0 &&
                i.x + catalog.atlas.cellSize <= catalog.atlas.width &&
                i.y + catalog.atlas.cellSize <= catalog.atlas.height,
        ),
    );
    const items = catalogItems(catalog);
    assert.equal(new Set(items.map((i) => i.url)).size, 1);
    assert.notEqual(itemKey(items[0]), itemKey(items[1]));
    assert.equal(
        await digest(readFileSync(`public${catalog.assets.url}`)),
        catalog.assets.sha256,
    );
    assert.equal(
        await digest(
            zipSync(unzipSync(readFileSync(`public${catalog.assets.url}`)), {
                level: 9,
                mtime: new Date(1980, 0, 1),
            }),
        ),
        catalog.assets.sha256,
        "Asset ZIP must be reproducible without timestamp-dependent hashes",
    );
    assert(
        catalog.atlas.url.includes(
            (await digest(readFileSync(`public${catalog.atlas.url}`))).slice(
                0,
                16,
            ),
        ),
    );
    const { data, info } = await sharp(`public${catalog.atlas.url}`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    for (const item of catalog.items) {
        let visible = false;
        for (let y = item.y; y < item.y + catalog.atlas.cellSize; y++)
            for (let x = item.x; x < item.x + catalog.atlas.cellSize; x++)
                if (data[(y * info.width + x) * 4 + 3]) visible = true;
        assert.equal(
            visible,
            item.itemId !== "minecraft:air",
            `${item.itemId}: unexpected transparency`,
        );
    }
});

test("atlas sources stack, replace sprite aliases and filter prior sprites", async () => {
    const path = "assets/minecraft/atlases/items.json";
    const base: Files = {
        [path]: encode({
            sources: [
                {
                    type: "minecraft:directory",
                    source: "item",
                    prefix: "item/",
                },
                {
                    type: "minecraft:single",
                    resource: "demo:old",
                    sprite: "demo:alias",
                },
            ],
        }),
        "assets/demo/textures/item/foo.png": new Uint8Array([1]),
    };
    const pack = await makePack("Atlas", {
        "pack.mcmeta": metadata,
        [path]: encode({
            sources: [
                {
                    type: "minecraft:single",
                    resource: "demo:new",
                    sprite: "demo:alias",
                },
                {
                    type: "minecraft:filter",
                    pattern: { namespace: "demo", path: "item/foo" },
                },
            ],
        }),
    });
    const assets = new Assets(mergePacks(base, [pack]));
    assert.equal(assets.sprite("demo:alias")?.resource, "demo:new");
    assert.equal(assets.sprite("demo:item/foo"), null);
    assert.equal(assets.get<{ sources: unknown[] }>(path).sources.length, 4);
});
test("pack model and definition failures leave validation unsuccessful", async () => {
    const pack = await makePack("Broken", {
        "pack.mcmeta": metadata,
        "assets/demo/items/broken.json": encode({
            model: { type: "minecraft:model", model: "demo:missing" },
        }),
    });
    await assert.rejects(() => validatePacks({}, [pack]), /Missing asset/);
    const texturePack = await makePack("Broken texture", {
        "pack.mcmeta": metadata,
        "assets/demo/models/item/foo.json": encode({
            textures: { layer0: "demo:missing" },
        }),
    });
    await assert.rejects(
        () => validatePacks({}, [texturePack]),
        /Missing texture/,
    );
});
test("pack ZIP roots, CRC and traversal are validated", async () => {
    const valid = zipSync({
        "Example/pack.mcmeta": metadata,
        "Example/assets/demo/items/test.json": encode({
            model: { type: "minecraft:empty" },
        }),
    });
    const pack = await makePack("Example", unzipPack(valid));
    assert(pack.files["assets/demo/items/test.json"]);
    assert.throws(() => unzipPack(valid.subarray(0, valid.length - 5)), /ZIP/);
    assert.throws(
        () => unzipPack(zipSync({ "../pack.mcmeta": metadata })),
        /Unsafe/,
    );
    const damaged = zipSync({ "pack.mcmeta": metadata }, { level: 0 });
    const header = new DataView(damaged.buffer);
    damaged[30 + header.getUint16(26, true) + header.getUint16(28, true)] ^= 1;
    assert.throws(() => unzipPack(damaged), /CRC/);
});
test("priority, overlays, filters and disable restore vanilla", async () => {
    const path = "assets/minecraft/models/item/paper.json";
    const base: Files = {
        [path]: encode({ textures: { layer0: "minecraft:item/paper" } }),
        "assets/minecraft/items/removed.json": encode({
            model: { type: "minecraft:empty" },
        }),
    };
    const low = await makePack("Low", {
        "pack.mcmeta": metadata,
        [path]: encode({ textures: { layer0: "demo:low" } }),
    });
    const high = await makePack("High", {
        "pack.mcmeta": encode({
            pack: { min_format: [97, 1], max_format: [97, 1] },
            filter: {
                block: [
                    { namespace: "minecraft", path: "items/removed\\.json" },
                ],
            },
            overlays: {
                entries: [
                    {
                        directory: "current",
                        min_format: [97, 1],
                        max_format: [97, 1],
                    },
                    {
                        directory: "future",
                        min_format: [98, 0],
                        max_format: [98, 0],
                    },
                ],
            },
        }),
        [`current/${path}`]: encode({ textures: { layer0: "demo:high" } }),
        [`future/${path}`]: encode({ textures: { layer0: "demo:future" } }),
    });
    const merged = new Assets(mergePacks(base, [high, low]));
    assert.equal(
        merged.model("minecraft:item/paper").textures?.layer0,
        "demo:high",
    );
    assert(!merged.files["assets/minecraft/items/removed.json"]);
    assert.equal(
        new Assets(mergePacks(base, [{ ...high, enabled: false }, low])).model(
            "minecraft:item/paper",
        ).textures?.layer0,
        "demo:low",
    );
    assert.equal(
        new Assets(mergePacks(base, [])).model("minecraft:item/paper").textures
            ?.layer0,
        "minecraft:item/paper",
    );
});
test("model inheritance and cycles and legacy override selection", () => {
    const files: Files = {
        "assets/demo/models/root.json": encode({
            textures: { base: "minecraft:item/paper", layer0: "#base" },
            display: { gui: { scale: [1, 1, 1] } },
        }),
        "assets/demo/models/child.json": encode({
            parent: "demo:root",
            textures: { base: "demo:paper" },
        }),
        "assets/demo/models/cycle.json": encode({ parent: "demo:cycle" }),
        "assets/minecraft/models/item/paper.json": encode({
            overrides: [
                { predicate: { custom_model_data: 1 }, model: "demo:one" },
                { predicate: { custom_model_data: 2 }, model: "demo:two" },
            ],
        }),
        "assets/minecraft/items/paper.json": encode({
            model: { type: "minecraft:model", model: "minecraft:item/paper" },
        }),
    };
    const assets = new Assets(files);
    const model = assets.model("demo:child");
    assert.equal(assets.textureReference(model, "#layer0"), "demo:paper");
    assert.deepEqual(model.display?.gui.scale, [1, 1, 1]);
    assert.throws(() => assets.model("demo:cycle"), /cycle/);
    assert.equal(
        assets.definition("minecraft:paper", { customModelData: 2 }).model,
        "demo:two",
    );
    assert.equal(
        assets.definition("minecraft:paper", { customModelData: 0 }).model,
        "minecraft:item/paper",
    );
});
test("modern CustomModelData branches use independent typed arrays and colors", () => {
    const appearance = {
        customModelStrings: ["variant"],
        customModelFloats: [2],
        customModelFlags: [false],
        dye: 0xff0000,
    };
    assert.equal(
        property(
            {
                type: "minecraft:select",
                property: "minecraft:custom_model_data",
            },
            appearance,
        ),
        "variant",
    );
    assert.equal(
        property(
            {
                type: "minecraft:condition",
                property: "minecraft:custom_model_data",
            },
            appearance,
        ),
        false,
    );
    assert.equal(
        property(
            {
                type: "minecraft:range_dispatch",
                property: "minecraft:custom_model_data",
            },
            appearance,
        ),
        2,
    );
    assert.equal(
        tintColor({ type: "minecraft:dye", default: 0 }, appearance),
        0xff0000,
    );
    assert.equal(
        tintColor(
            { type: "minecraft:potion", default: 123 },
            { potionColor: 456 },
        ),
        456,
    );
    assert.equal(
        tintColor(
            { type: "minecraft:custom_model_data", index: 1, default: 123 },
            { customModelColors: [0, 456] },
        ),
        456,
    );
});
