import { createHash } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { build } from "esbuild";
import { unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import sharp from "sharp";
import {
    type Catalog,
    type Files,
    GAME_VERSION,
    RENDERER_VERSION,
} from "../lib/minecraft/types";
import registry from "./registry-26.3.json";

const CLIENT_SHA1 = "e877b6a07acd633fb3bb475002175cec036e7b87";
const CLIENT_URL = `https://piston-data.mojang.com/v1/objects/${CLIENT_SHA1}/client.jar`;
const hash = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
const cache = join(process.cwd(), ".cache");
mkdirSync(cache, { recursive: true });
const clientPath = join(cache, `client-${GAME_VERSION}.jar`);
if (!existsSync(clientPath)) {
    const response = await fetch(CLIENT_URL);
    if (!response.ok)
        throw new Error(`Client download failed: ${response.status}`);
    writeFileSync(clientPath, new Uint8Array(await response.arrayBuffer()));
}
const client = readFileSync(clientPath);
if (createHash("sha1").update(client).digest("hex") !== CLIENT_SHA1)
    throw new Error("Official client SHA-1 mismatch");
const all = unzipSync(client);
const files: Files = Object.create(null);
for (const [path, bytes] of Object.entries(all)) {
    if (!bytes.length || !path.startsWith("assets/minecraft/")) continue;
    if (
        /\/(items|models|atlases)\/.*\.json$/.test(path) ||
        path === "assets/minecraft/lang/en_us.json" ||
        /\/textures\/(?:block|item|trims|colormap|misc|palettes)\//.test(
            path,
        ) ||
        /\/textures\/entity\/(?:banner|shield|chest|shulker|conduit|decorated_pot|copper_golem|player|skeleton|zombie|creeper|enderdragon|piglin|trident|bed|signs|hanging_sign)\//.test(
            path,
        )
    )
        files[path] = bytes;
}
for (const [path, bytes] of Object.entries(files)) {
    if (!path.includes("/models/")) continue;
    const model = JSON.parse(new TextDecoder().decode(bytes));
    for (const value of Object.values(model.textures || {}) as (
        | string
        | { sprite: string }
    )[]) {
        const reference = typeof value === "string" ? value : value.sprite;
        if (reference.startsWith("#")) continue;
        const [namespace, name] = reference.includes(":")
            ? reference.split(":")
            : ["minecraft", reference];
        const texture = `assets/${namespace}/textures/${name}.png`;
        if (all[texture]) {
            files[texture] = all[texture];
            if (all[`${texture}.mcmeta`])
                files[`${texture}.mcmeta`] = all[`${texture}.mcmeta`];
        }
    }
}
files["pack.mcmeta"] = new TextEncoder().encode(
    JSON.stringify({
        pack: {
            min_format: [97, 1],
            max_format: [97, 1],
            description: "Java 26.3 vanilla item assets",
        },
    }),
);
const itemIds = Object.keys(files)
    .filter((path) => /\/items\/[^/]+\.json$/.test(path))
    .map((path) => `minecraft:${path.split("/").at(-1)?.slice(0, -5)}`)
    .sort();
if (JSON.stringify(itemIds) !== JSON.stringify(registry))
    throw new Error(
        "Item definitions differ from the official 26.3 item registry",
    );
const archive = zipSync(files, { level: 9, mtime: new Date(1980, 0, 1) });
const bundleHash = hash(archive);
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
    } else if (request.url === "/bundle.zip") response.end(archive);
    else {
        response.setHeader("Content-Type", "text/html");
        response.end('<script src="/harness.js"></script>');
    }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
    throw new Error("Asset server unavailable");
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
    browser = await chromium.launch({
        headless: true,
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate("Harness.initialize()");
    const columns = Math.ceil(Math.sqrt(registry.length)),
        cellSize = 32;
    const width = columns * cellSize,
        height = Math.ceil(registry.length / columns) * cellSize;
    const overlays: { input: Buffer; left: number; top: number }[] = [];
    const catalog: Catalog = {
        version: GAME_VERSION,
        rendererVersion: RENDERER_VERSION,
        atlas: { url: "", width, height, cellSize },
        assets: {
            url: `/minecraft-assets-${bundleHash.slice(0, 16)}.zip`,
            sha256: bundleHash,
        },
        items: [],
    };
    const names: Record<string, string> = JSON.parse(
        new TextDecoder().decode(files["assets/minecraft/lang/en_us.json"]),
    );
    const failures: string[] = [];
    mkdirSync(join(cache, "rendered"), { recursive: true });
    for (const [index, itemId] of registry.entries()) {
        try {
            const data = await page.evaluate(
                async (id) =>
                    (
                        window as unknown as {
                            Harness: {
                                render: (id: string) => Promise<string>;
                            };
                        }
                    ).Harness.render(id),
                itemId,
            );
            const png = Buffer.from(data, "base64");
            const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
            const visible = pixels.some(
                (value, offset) => offset % 4 === 3 && value > 0,
            );
            if (itemId !== "minecraft:air" && !visible)
                throw new Error("Unexpected transparent render");
            if (itemId === "minecraft:air" && visible)
                throw new Error("Air must be invisible");
            writeFileSync(
                join(cache, "rendered", `${itemId.split(":")[1]}.png`),
                png,
            );
            const input = await sharp(png)
                .resize(cellSize, cellSize, { kernel: "nearest" })
                .png()
                .toBuffer();
            const left = (index % columns) * cellSize,
                top = Math.floor(index / columns) * cellSize;
            overlays.push({ input, left, top });
            const id = itemId.split(":")[1];
            catalog.items.push({
                itemId,
                name:
                    names[`item.minecraft.${id}`] ||
                    names[`block.minecraft.${id}`] ||
                    id
                        .split("_")
                        .map((w) => w[0].toUpperCase() + w.slice(1))
                        .join(" "),
                x: left,
                y: top,
            });
        } catch (error) {
            failures.push(
                `${itemId}: ${error instanceof Error ? error.message : error}`,
            );
        }
        if ((index + 1) % 100 === 0)
            console.log(`Rendered ${index + 1}/${registry.length}`);
    }
    if (failures.length) {
        writeFileSync(join(cache, "render-failures.txt"), failures.join("\n"));
        throw new Error(
            `${failures.length} render failures:\n${failures.slice(0, 20).join("\n")}`,
        );
    }
    const atlas = await sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite(overlays)
        .png({ compressionLevel: 9, palette: false })
        .toBuffer();
    catalog.atlas.url = `/items-atlas-${hash(atlas).slice(0, 16)}.png`;
    writeFileSync(join("public", catalog.atlas.url.slice(1)), atlas);
    writeFileSync(join("public", catalog.assets.url.slice(1)), archive);
    writeFileSync(join("public", "items.json.tmp"), JSON.stringify(catalog));
    renameSync(join("public", "items.json.tmp"), join("public", "items.json"));
    console.log(
        `Generated ${registry.length} items. Atlas ${atlas.length} bytes; lazy asset bundle ${archive.length} bytes.`,
    );
} finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
}
