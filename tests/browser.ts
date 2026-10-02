import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { zipSync } from "fflate";
import { chromium } from "playwright";
import sharp from "sharp";

const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
});
const page = await context.newPage();
const requests: string[] = [],
    errors: string[] = [];
let downloads = 0;
page.on("download", () => downloads++);
page.on("request", (request) => {
    requests.push(request.url());
    assert.equal(request.method(), "GET", "Pack data must never be uploaded");
});
page.on("pageerror", (error) => errors.push(error.message));
const base = process.env.TEST_URL || "http://127.0.0.1:3100";
const slots = page.locator(
    '[style*="width:"][style*="height:"] > .relative.w-full.h-full',
);
const encode = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value));
try {
    await page.goto(base);
    await slots.first().click();
    await page.locator('button[title="Acacia Boat"]').waitFor();
    await page.locator('div[class*="h-[400px]"]').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await page.locator('button[title="Zombified Piglin Spawn Egg"]').waitFor();
    await page.getByPlaceholder("Search items...").fill("stone");
    await page.locator('button[title="Stone"]').click();
    await page.getByPlaceholder("Search items...").waitFor({ state: "hidden" });
    assert.equal(
        await page
            .getByRole("button", { name: "Use Item", exact: true })
            .count(),
        0,
        "Choosing an item must place it immediately without an appearance prompt",
    );
    await slots.first().click();
    await page.getByPlaceholder("Search items...").fill("stone");
    await page
        .getByRole("button", { name: "Edit appearance of Stone", exact: true })
        .click();
    await page.getByRole("button", { name: "Use Item", exact: true }).waitFor();
    assert.equal(
        await page.getByText("Block state (JSON)", { exact: true }).count(),
        0,
        "Block state must not be requested",
    );
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByPlaceholder("Search items...").fill("stone");
    await page.locator('button[title="Stone"]').click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await (await download).saveAs(".cache/download-test.png");
    assert.equal(
        requests.filter((url) => url.includes("/items.json")).length,
        1,
    );
    assert.equal(
        requests.filter((url) => url.includes("/items-atlas-")).length,
        1,
    );
    assert.equal(
        requests.filter((url) => url.includes("/minecraft-assets-")).length,
        0,
    );
    assert(!requests.some((url) => /\/items\/[^/]+\.png/.test(url)));
    await slots.first().click();
    await page
        .getByRole("button", { name: "Resource Packs", exact: true })
        .click();
    const png = await sharp({
        create: { width: 16, height: 16, channels: 4, background: "#ff0000" },
    })
        .png()
        .toBuffer();
    const zip = zipSync({
        "pack.mcmeta": encode({
            pack: { min_format: [97, 1], max_format: [97, 1] },
        }),
        "assets/minecraft/textures/block/stone.png": png,
        "assets/demo/items/gem.json": encode({
            model: { type: "minecraft:model", model: "demo:item/gem" },
        }),
        "assets/demo/models/item/gem.json": encode({
            parent: "minecraft:item/generated",
            textures: { layer0: "demo:item/gem" },
        }),
        "assets/demo/textures/item/gem.png": png,
    });
    await page.locator('input[accept=".zip"]').setInputFiles({
        name: "Test Pack.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(zip),
    });
    await page
        .getByText("Processing pack…")
        .waitFor({ state: "hidden", timeout: 60000 });
    assert(
        !(await page.getByRole("alert").allTextContents()).some((text) =>
            text.trim(),
        ),
        await page.locator("body").innerText(),
    );
    await page.getByText("Test Pack", { exact: true }).waitFor();
    // A rejected replacement must preserve the active pack and ordering.
    await page.locator('input[accept=".zip"]').setInputFiles({
        name: "Broken.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(
            zipSync({
                "pack.mcmeta": encode({ pack: { pack_format: 97 } }),
                "assets/demo/items/broken.json": encode({
                    model: {
                        type: "minecraft:model",
                        model: "demo:missing",
                    },
                }),
            }),
        ),
    });
    await page
        .getByRole("alert")
        .filter({ hasText: "Missing asset" })
        .waitFor();
    assert(await page.getByLabel("Test Pack", { exact: true }).isChecked());
    assert.equal(await page.getByText("Broken", { exact: true }).count(), 0);
    const folder = resolve(".cache/Folder Pack");
    mkdirSync(`${folder}/assets/minecraft/textures/block`, { recursive: true });
    writeFileSync(
        `${folder}/pack.mcmeta`,
        encode({ pack: { min_format: [97, 1], max_format: [97, 1] } }),
    );
    writeFileSync(
        `${folder}/assets/minecraft/textures/block/stone.png`,
        await sharp({
            create: {
                width: 16,
                height: 16,
                channels: 4,
                background: "#00ff00",
            },
        })
            .png()
            .toBuffer(),
    );
    await page.locator("input[webkitdirectory]").setInputFiles(folder);
    await page.getByText("Folder Pack", { exact: true }).waitFor();
    await page.getByText("Processing pack…").waitFor({ state: "hidden" });
    const packRow = (name: string) =>
        page
            .locator("div.rounded.border")
            .filter({ has: page.getByLabel(name, { exact: true }) });
    assert(
        await packRow("Folder Pack")
            .getByRole("button", { name: "Up", exact: true })
            .isDisabled(),
    );
    await packRow("Folder Pack")
        .getByRole("button", { name: "Down", exact: true })
        .click();
    await page.getByText("Processing pack…").waitFor({ state: "hidden" });
    assert(
        await packRow("Test Pack")
            .getByRole("button", { name: "Up", exact: true })
            .isDisabled(),
    );
    await packRow("Folder Pack")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
    await page
        .getByText("Folder Pack", { exact: true })
        .waitFor({ state: "hidden" });
    await page.getByLabel("Model ID", { exact: true }).fill("demo:item/gem");
    await page.getByRole("button", { name: "Add Model", exact: true }).click();
    await page.getByText("Processing pack…").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Back to Items" }).click();
    await page.getByPlaceholder("Search items...").fill("demo:item/gem");
    await page.locator('button[title="demo:item/gem"]').waitFor();
    await page.getByPlaceholder("Search items...").fill("demo:gem");
    await page.locator('button[title="demo:gem"]').click();
    await page.getByPlaceholder("Search items...").waitFor({ state: "hidden" });
    assert.equal(
        requests.filter((url) => url.includes("/minecraft-assets-")).length,
        1,
    );
    await page.screenshot({ path: ".cache/pack-browser.png" });
    const packDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await (await packDownload).saveAs(".cache/pack-download.png");
    const pixels = await sharp(readFileSync(".cache/pack-download.png"))
        .ensureAlpha()
        .raw()
        .toBuffer();
    assert(
        pixels.some(
            (value, i) =>
                i % 4 === 0 &&
                value > 240 &&
                pixels[i + 1] < 10 &&
                pixels[i + 2] < 10,
        ),
        "Locally rendered pack item must appear in PNG export",
    );
    // A vanished custom item retains its slot and is restored when its pack returns.
    await slots.first().click();
    await page
        .getByRole("button", { name: "Resource Packs", exact: true })
        .click();
    await page.getByLabel("Test Pack", { exact: true }).click();
    await page.waitForFunction(
        () =>
            !Array.from(document.querySelectorAll("label"))
                .find((label) => label.textContent?.trim() === "Test Pack")
                ?.querySelector("input")?.checked,
    );
    await page.getByText("Processing pack…").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Back to Items" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await slots
        .first()
        .getByRole("img", { name: /Item definition no longer available/ })
        .waitFor();
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await page
        .getByRole("alert")
        .filter({ hasText: "PNG export failed" })
        .waitFor();
    assert.equal(
        downloads,
        2,
        "Unresolved items must prevent a partial PNG download",
    );
    await slots.first().click();
    await page
        .getByRole("button", { name: "Resource Packs", exact: true })
        .click();
    await page.getByLabel("Test Pack", { exact: true }).click();
    await page.waitForFunction(
        () =>
            Array.from(document.querySelectorAll("label"))
                .find((label) => label.textContent?.trim() === "Test Pack")
                ?.querySelector("input")?.checked,
    );
    await page.getByText("Processing pack…").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Back to Items" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await slots
        .first()
        .getByRole("img", { name: "Item", exact: true })
        .waitFor();
    await page.reload();
    await slots.first().click();
    await page
        .getByRole("button", { name: "Resource Packs", exact: true })
        .click();
    await page.getByText("Test Pack", { exact: true }).waitFor();
    assert.equal(
        requests.filter((url) => url.includes("/minecraft-assets-")).length,
        1,
        "Persisted base bundle must not be downloaded on reload",
    );
    await page.getByLabel("Test Pack", { exact: true }).click();
    await page.waitForFunction(
        () =>
            !Array.from(document.querySelectorAll("label"))
                .find((label) => label.textContent?.trim() === "Test Pack")
                ?.querySelector("input")?.checked,
    );
    await page.getByText("Processing pack…").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Back to Items" }).click();
    await page.getByPlaceholder("Search items...").fill("stone");
    await page.locator('button[title="Stone"]').click();
    await page.getByPlaceholder("Search items...").waitFor({ state: "hidden" });
    assert.equal(errors.length, 0, errors.join("\n"));
    await slots.first().click();
    const chooser = page.waitForEvent("filechooser");
    await page
        .getByRole("button", { name: "Upload Custom Item", exact: true })
        .click();
    await (await chooser).setFiles({
        name: "Custom.png",
        mimeType: "image/png",
        buffer: png,
    });
    await slots
        .first()
        .getByRole("img", { name: "Item", exact: true })
        .waitFor();
    assert(
        !requests.some((url) => /^https?:/.test(url) && !url.startsWith(base)),
        "Pack processing must not contact external services",
    );
    const image = await sharp(
        readFileSync(".cache/download-test.png"),
    ).metadata();
    assert(image.width && image.height);
    console.log(
        "Browser checks passed: atlas-only use/export, local ZIP/folder rendering, priority/deletion, failed-import recovery, persistence, disabling and no uploads.",
    );
} finally {
    await context.close();
    await browser.close();
}
