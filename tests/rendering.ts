import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import { unzipSync } from "fflate";
import { chromium } from "playwright";
import sharp from "sharp";
import type { Appearance, Catalog, ModelNode } from "../lib/minecraft/types";

const catalog = JSON.parse(
    readFileSync("public/items.json", "utf8"),
) as Catalog;
const script = await build({
    entryPoints: ["scripts/render-harness.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "Harness",
    platform: "browser",
    target: "es2022",
});
const server = createServer((request, response) => {
    if (request.url === "/harness.js") {
        response.setHeader("Content-Type", "text/javascript");
        response.end(script.outputFiles[0].contents);
    } else if (request.url === "/bundle.zip")
        response.end(readFileSync(`public${catalog.assets.url}`));
    else {
        response.setHeader("Content-Type", "text/html");
        response.end('<script src="/harness.js"></script>');
    }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate("Harness.initialize()");
    const render = async (itemId: string, appearance?: Appearance) =>
        Buffer.from(
            await page.evaluate(
                async ({ itemId, appearance }) =>
                    (
                        window as unknown as {
                            Harness: {
                                render: (
                                    id: string,
                                    appearance?: Appearance,
                                ) => Promise<string>;
                            };
                        }
                    ).Harness.render(itemId, appearance),
                { itemId, appearance },
            ),
            "base64",
        );
    const samples = [
        "stone",
        "oak_stairs",
        "glass",
        "grass_block",
        "chest",
        "white_banner",
        "shield",
        "shulker_box",
        "player_head",
        "dragon_head",
        "decorated_pot",
        "conduit",
        "trident",
        "diamond_sword",
        "potion",
        "leather_chestplate",
        "nether_star",
        "copper_golem_statue",
        "filled_map",
    ];
    for (const name of samples) {
        const itemId = `minecraft:${name}`,
            png = await render(itemId);
        const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
        assert(
            pixels.some((value, i) => i % 4 === 3 && value > 0),
            `${itemId} must be visible`,
        );
        const cached = `.cache/rendered/${name}.png`;
        if (existsSync(cached))
            assert.deepEqual(
                pixels,
                await sharp(readFileSync(cached))
                    .ensureAlpha()
                    .raw()
                    .toBuffer(),
                `${itemId}: pre-generation and browser output differ`,
            );
        const item = catalog.items.find((i) => i.itemId === itemId);
        assert(item);
        const expected = await sharp(`public${catalog.atlas.url}`)
            .extract({ left: item.x, top: item.y, width: 32, height: 32 })
            .ensureAlpha()
            .raw()
            .toBuffer();
        const actual = await sharp(png)
            .resize(32, 32, { kernel: "nearest" })
            .ensureAlpha()
            .raw()
            .toBuffer();
        let error = 0,
            samples = 0;
        for (let i = 0; i < expected.length; i += 4) {
            assert(
                Math.abs(expected[i + 3] - actual[i + 3]) <= 16,
                `${itemId}: atlas silhouette differs`,
            );
            if (actual[i + 3] > 0)
                for (let c = 0; c < 3; c++) {
                    error += Math.abs(expected[i + c] - actual[i + c]);
                    samples++;
                }
        }
        assert(
            error / Math.max(1, samples) < 12,
            `${itemId}: atlas color error ${error / samples}`,
        );
    }
    const variants: [string, Appearance][] = [
        ["potion", { potionColor: 0xff0000 }],
        ["leather_chestplate", { dye: 0x0000ff }],
        ["leather_chestplate", { trimMaterial: "minecraft:quartz" }],
        [
            "white_banner",
            { patterns: [{ pattern: "stripe_center", color: "red" }] },
        ],
        [
            "shield",
            {
                baseColor: "blue",
                patterns: [{ pattern: "stripe_center", color: "red" }],
            },
        ],
        [
            "decorated_pot",
            {
                potDecorations: [
                    "angler_pottery_sherd",
                    "angler_pottery_sherd",
                    "angler_pottery_sherd",
                    "angler_pottery_sherd",
                ],
            },
        ],
        ["diamond_sword", { enchanted: true }],
        ["nether_star", { enchanted: false }],
        [
            "player_head",
            {
                skin: `data:image/png;base64,${(
                    await sharp({
                        create: {
                            width: 64,
                            height: 64,
                            channels: 4,
                            background: "#00ff00",
                        },
                    })
                        .png()
                        .toBuffer()
                ).toString("base64")}`,
            },
        ],
        [
            "filled_map",
            {
                map: `data:image/png;base64,${(
                    await sharp({
                        create: {
                            width: 16,
                            height: 16,
                            channels: 4,
                            background: "#ff0000",
                        },
                    })
                        .png()
                        .toBuffer()
                ).toString("base64")}`,
            },
        ],
    ];
    const files = unzipSync(readFileSync(`public${catalog.assets.url}`));
    const allVariants: { itemId: string; appearance: Appearance }[] = [];
    const collect = (itemId: string, node: ModelNode) => {
        if (node.type === "minecraft:select")
            for (const entry of node.cases || [])
                for (const value of Array.isArray(entry.when)
                    ? entry.when
                    : [entry.when]) {
                    if (node.property === "minecraft:trim_material")
                        allVariants.push({
                            itemId,
                            appearance: { trimMaterial: value },
                        });
                    if (
                        node.property === "minecraft:block_state" &&
                        node.block_state_property
                    )
                        allVariants.push({
                            itemId,
                            appearance: {
                                blockState: {
                                    [node.block_state_property]: value,
                                },
                            },
                        });
                }
        for (const child of [
            ...(node.models || []),
            ...(node.cases || []).map((c) => c.model),
            ...(node.entries || []).map((e) => e.model),
            ...[node.fallback, node.on_false, node.on_true].filter(
                (n): n is ModelNode => !!n,
            ),
        ])
            collect(itemId, child);
    };
    for (const item of catalog.items) {
        const [, name] = item.itemId.split(":");
        collect(
            item.itemId,
            JSON.parse(
                new TextDecoder().decode(
                    files[`assets/minecraft/items/${name}.json`],
                ),
            ).model,
        );
    }
    for (const { itemId, appearance } of allVariants) {
        try {
            const pixels = await sharp(await render(itemId, appearance))
                .ensureAlpha()
                .raw()
                .toBuffer();
            assert(pixels.some((value, index) => index % 4 === 3 && value > 0));
        } catch (error) {
            throw new Error(
                `${itemId} ${JSON.stringify(appearance)}: ${error}`,
            );
        }
    }
    for (const [name, appearance] of variants) {
        const plain = await sharp(await render(`minecraft:${name}`))
            .ensureAlpha()
            .raw()
            .toBuffer();
        const changed = await sharp(
            await render(`minecraft:${name}`, appearance),
        )
            .ensureAlpha()
            .raw()
            .toBuffer();
        assert(
            !plain.equals(changed),
            `${name}: appearance must change pixels (${JSON.stringify(appearance)})`,
        );
    }
    const encode = (value: unknown) => [
        ...new TextEncoder().encode(JSON.stringify(value)),
    ];
    const animated = await sharp({
        create: { width: 16, height: 32, channels: 4, background: "#ff0000" },
    })
        .composite([
            {
                input: await sharp({
                    create: {
                        width: 16,
                        height: 16,
                        channels: 4,
                        background: "#0000ff",
                    },
                })
                    .png()
                    .toBuffer(),
                top: 16,
                left: 0,
            },
        ])
        .png()
        .toBuffer();
    const extra = {
        "assets/demo/models/item/full_cell.json": encode({
            parent: "minecraft:item/generated",
            textures: { layer0: "demo:item/animated" },
        }),
        "assets/demo/models/item/half_cell.json": encode({
            parent: "demo:item/full_cell",
            display: { gui: { scale: [0.5, 0.5, 0.5] } },
        }),
        "assets/demo/items/animated.json": encode({
            model: { type: "minecraft:model", model: "demo:item/animated" },
        }),
        "assets/demo/items/flag.json": encode({
            model: {
                type: "minecraft:condition",
                property: "minecraft:custom_model_data",
                index: 0,
                on_true: {
                    type: "minecraft:model",
                    model: "demo:item/animated",
                },
                on_false: {
                    type: "minecraft:model",
                    model: "minecraft:item/paper",
                },
            },
        }),
        "assets/demo/items/number.json": encode({
            model: {
                type: "minecraft:range_dispatch",
                property: "minecraft:custom_model_data",
                index: 0,
                entries: [
                    {
                        threshold: 1,
                        model: {
                            type: "minecraft:model",
                            model: "demo:item/animated",
                        },
                    },
                ],
                fallback: {
                    type: "minecraft:model",
                    model: "minecraft:item/paper",
                },
            },
        }),
        "assets/demo/items/string.json": encode({
            model: {
                type: "minecraft:select",
                property: "minecraft:custom_model_data",
                index: 0,
                cases: [
                    {
                        when: "blue",
                        model: {
                            type: "minecraft:model",
                            model: "demo:item/animated",
                        },
                    },
                ],
                fallback: {
                    type: "minecraft:model",
                    model: "minecraft:item/paper",
                },
            },
        }),
        "assets/demo/models/item/animated.json": encode({
            parent: "minecraft:item/generated",
            textures: { layer0: "demo:item/animated" },
            display: { gui: { rotation: [0, 45, 0] } },
        }),
        "assets/demo/textures/item/animated.png": [...animated],
        "assets/demo/textures/item/animated.png.mcmeta": encode({
            animation: { frames: [1, 0] },
        }),
        "assets/minecraft/models/item/paper.json": encode({
            parent: "minecraft:item/generated",
            textures: { layer0: "minecraft:item/paper" },
            overrides: [
                {
                    predicate: { custom_model_data: 1 },
                    model: "demo:item/animated",
                },
            ],
        }),
    };
    await page.evaluate(
        async (extra) =>
            (
                window as unknown as {
                    Harness: {
                        initialize: (
                            files: Record<string, number[]>,
                        ) => Promise<void>;
                    };
                }
            ).Harness.initialize(extra),
        extra,
    );
    for (const [model, start, end] of [
        ["demo:item/full_cell", 0, 128],
        ["demo:item/half_cell", 32, 96],
    ] as const) {
        const pixels = await sharp(await render("minecraft:paper", { model }))
            .ensureAlpha()
            .raw()
            .toBuffer();
        for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++)
                assert.equal(
                    pixels[(y * 128 + x) * 4 + 3],
                    x >= start && x < end && y >= start && y < end ? 255 : 0,
                    `${model}: GUI size must follow the client's unit-to-cell scale (${x}, ${y})`,
                );
    }
    const frame = await sharp(await render("demo:animated"))
        .ensureAlpha()
        .raw()
        .toBuffer();
    assert(
        frame.some((value, index) => index % 4 === 2 && value > 200),
        "First designated animation frame must be blue",
    );
    assert(
        !frame.some((value, index) => index % 4 === 0 && value > 0),
        "Frame 0 red must not appear",
    );
    const legacy = await sharp(
        await render("minecraft:paper", { customModelData: 1 }),
    )
        .ensureAlpha()
        .raw()
        .toBuffer();
    assert.deepEqual(
        legacy,
        frame,
        "Legacy override must share the same rendering path",
    );
    for (const [id, appearance] of [
        ["demo:flag", { customModelFlags: [true] }],
        ["demo:number", { customModelFloats: [1] }],
        ["demo:string", { customModelStrings: ["blue"] }],
    ] as [string, Appearance][])
        assert.deepEqual(
            await sharp(await render(id, appearance))
                .ensureAlpha()
                .raw()
                .toBuffer(),
            frame,
            `${id}: typed branch must select the animated model`,
        );
    console.log(
        `Rendering checks passed: ${samples.length} shapes match pre-generation/atlas; ${variants.length} appearance variants change pixels; ${allVariants.length} vanilla trim/block-state branches render.`,
    );
} finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
}
