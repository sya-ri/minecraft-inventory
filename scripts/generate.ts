#!/usr/bin/env node

import { exec } from "node:child_process";
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execAsync = promisify(exec);

interface GitHubBranch {
    name: string;
    commit: {
        sha: string;
        url: string;
    };
    protected: boolean;
}

interface ItemInfo {
    name: string;
    texture: string;
    url: string;
    sprite?: {
        url: string;
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

type ItemDefinition = {
    model:
        | {
              type: "minecraft:model";
              model: string;
          }
        | {
              type: "minecraft:select";
              fallback:
                  | {
                        type: "minecraft:model";
                        model: string;
                    }
                  | {
                        type: "minecraft:special";
                    }
                  | {
                        // fallback for unknown models
                        type?: never;
                    };
          };
};

type ModelJson =
    | {
          parent:
              | "minecraft:item/generated"
              | "minecraft:item/handheld"
              | "minecraft:item/handheld_rod"
              | "minecraft:item/handheld_mace"
              | "minecraft:item/amethyst_bud"
              | "minecraft:item/template_music_disc"
              | "item/generated"
              | "item/handheld"
              | "item/handheld_rod"
              | "item/handheld_mace"
              | "item/amethyst_bud"
              | "item/template_music_disc";
          textures: {
              layer0: string;
              layer1?: string;
              layer2?: string;
          };
      }
    | {
          parent: "minecraft:block/cube_all" | "block/cube_all";
          textures: {
              all: string;
          };
      }
    | {
          // fallback for unknown models
          parent?: never;
      };

function parseVersion(versionString: string): number[] {
    // Convert "1.21.11" to [1, 21, 11]
    return versionString.split(".").map(Number);
}

function compareVersions(v1: string, v2: string): number {
    const parts1 = parseVersion(v1);
    const parts2 = parseVersion(v2);
    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }
    return 0;
}

async function getAllBranches(): Promise<GitHubBranch[]> {
    const branches: GitHubBranch[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const apiUrl = `https://api.github.com/repos/InventivetalentDev/minecraft-assets/branches?page=${page}&per_page=${perPage}`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(
                `GitHub API error: ${response.status} ${response.statusText}`,
            );
        }

        const pageBranches: GitHubBranch[] = await response.json();

        if (pageBranches.length === 0) {
            break;
        }

        branches.push(...pageBranches);

        // Check if there are more pages
        const linkHeader = response.headers.get("link");
        if (!linkHeader || !linkHeader.includes('rel="next"')) {
            break;
        }

        page++;
    }

    return branches;
}

async function getLatestVersion(): Promise<string> {
    try {
        console.log("Fetching all branches from GitHub...");
        const branches = await getAllBranches();
        console.log(`Found ${branches.length} total branches`);

        // Filter branches that look like version numbers (e.g., "1.21.11")
        const versionPattern = /^\d+\.\d+(\.\d+)?$/;
        const versions = branches
            .map((branch) => branch.name)
            .filter((name) => versionPattern.test(name))
            .sort((a, b) => compareVersions(b, a)); // Sort descending

        if (versions.length === 0) {
            throw new Error("No version branches found");
        }

        console.log(`Found ${versions.length} version branches`);
        return versions[0];
    } catch (error) {
        console.error("Error fetching latest version:", error);
        throw error;
    }
}

function resolveModelPath(modelPath: string): string {
    // Convert "minecraft:item/apple" to "assets/minecraft/models/item/apple.json"
    const parts = modelPath.replace("minecraft:", "").split("/");
    if (parts.length === 2) {
        return `assets/minecraft/models/${parts[0]}/${parts[1]}.json`;
    }
    return modelPath;
}

function resolveTexturePath(texturePath: string): string {
    // Convert "minecraft:item/apple" to "assets/minecraft/textures/item/apple.png"
    return `assets/minecraft/textures/${texturePath.replace("minecraft:", "")}.png`;
}

async function compileJavaRenderer(): Promise<void> {
    const javaDir = join(process.cwd(), "java-renderer");
    const javaFile = join(javaDir, "BlockRenderer.java");

    // Javaファイルが存在しない場合はスキップ
    if (!existsSync(javaFile)) {
        return;
    }

    try {
        console.log("Compiling Java renderer...");
        await execAsync(
            `C:\\Users\\gbv_s\\.jdks\\corretto-21.0.9\\bin\\javac "${javaFile}"`,
            {
                cwd: javaDir,
            },
        );
        console.log("Java renderer compiled successfully");
    } catch (error) {
        console.warn("Failed to compile Java renderer:", error);
    }
}

async function renderModel(
    repoRoot: string,
    modelPath: string,
    outputPath: string,
): Promise<"rendered" | "copied" | "failed"> {
    const resolvedPath = resolveModelPath(modelPath);
    const modelFilePath = join(repoRoot, resolvedPath);

    if (!existsSync(modelFilePath)) {
        return "failed";
    }

    try {
        const modelJson = readFileSync(modelFilePath, "utf8");
        const model: ModelJson = JSON.parse(modelJson);
        switch (model.parent) {
            case "minecraft:block/cube_all":
            case "block/cube_all": {
                const texturePath = model.textures.all;
                const success = await renderCubeAll(
                    repoRoot,
                    texturePath,
                    outputPath,
                );
                return success ? "rendered" : "failed";
            }

            case "minecraft:item/generated":
            case "minecraft:item/handheld":
            case "minecraft:item/handheld_rod":
            case "minecraft:item/handheld_mace":
            case "minecraft:item/amethyst_bud":
            case "minecraft:item/template_music_disc":
            case "item/generated":
            case "item/handheld":
            case "item/handheld_rod":
            case "item/handheld_mace":
            case "item/amethyst_bud":
            case "item/template_music_disc": {
                if (Object.keys(model.textures).length === 1) {
                    const texturePath = model.textures.layer0;
                    const resolvedTexturePath = resolveTexturePath(texturePath);
                    const textureSourcePath = join(
                        repoRoot,
                        resolvedTexturePath,
                    );
                    if (!existsSync(textureSourcePath)) return "failed";
                    cpSync(textureSourcePath, outputPath);
                    return "copied";
                }

                // Composite multiple layers
                const layers = Object.values(model.textures);
                const success = await compositeLayers(
                    repoRoot,
                    layers,
                    outputPath,
                );
                return success ? "rendered" : "failed";
            }

            default: {
                console.error(
                    `Unsupported model: ${modelPath} (${model.parent})`,
                );
                return "failed";
            }
        }
    } catch (error) {
        console.error(`Error parsing model ${modelPath}:`, error);
        return "failed";
    }
}

async function compositeLayers(
    repoRoot: string,
    texturePaths: string[],
    outputPath: string,
): Promise<boolean> {
    try {
        const resolvedPaths = texturePaths.map((path) =>
            join(repoRoot, resolveTexturePath(path)),
        );

        // Check if all textures exist
        for (const path of resolvedPaths) {
            if (!existsSync(path)) {
                console.error(`Texture not found: ${path}`);
                return false;
            }
        }

        // Load the first layer as base
        let composite = sharp(resolvedPaths[0]);

        // Composite additional layers on top
        if (resolvedPaths.length > 1) {
            const overlays = await Promise.all(
                resolvedPaths.slice(1).map(async (path) => {
                    return { input: await sharp(path).toBuffer() };
                }),
            );

            composite = composite.composite(overlays);
        }

        // Save the result
        await composite.png().toFile(outputPath);
        return existsSync(outputPath);
    } catch (error) {
        console.error(`Error compositing layers:`, error);
        return false;
    }
}

async function renderCubeAll(
    repoRoot: string,
    texturePath: string,
    outputPath: string,
): Promise<boolean> {
    try {
        const resolvedTexturePath = resolveTexturePath(texturePath);
        const textureSourcePath = join(repoRoot, resolvedTexturePath);

        if (!existsSync(textureSourcePath)) {
            return false;
        }

        // Javaレンダラーを呼び出す
        const javaDir = join(process.cwd(), "java-renderer");
        const classFile = join(javaDir, "BlockRenderer.class");

        if (!existsSync(classFile)) {
            console.warn(
                "Java renderer not compiled. Attempting to compile...",
            );
            compileJavaRenderer();
            if (!existsSync(classFile)) {
                console.error("Java renderer compilation failed");
                return false;
            }
        }

        // 引数形式: <output> <render_type> <...textures>
        await execAsync(
            `C:\\Users\\gbv_s\\.jdks\\corretto-21.0.9\\bin\\java -cp "${javaDir}" BlockRenderer "${outputPath}" "cube_all" "${textureSourcePath}"`,
        );

        return existsSync(outputPath);
    } catch (error) {
        console.error(`Error rendering cube_all:`, error);
        return false;
    }
}

function itemNameToDisplayName(name: string): string {
    return name
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

async function writeSpriteAtlas(items: ItemInfo[]): Promise<void> {
    const sourceDir = join(process.cwd(), "public", "items");
    const atlasPath = join(process.cwd(), "public", "items-atlas.png");
    const atlasUrl = "/items-atlas.png";
    const cellSize = 32;
    const columns = Math.ceil(Math.sqrt(items.length));
    const width = columns * cellSize;
    const rows = Math.ceil(items.length / columns);
    const height = rows * cellSize;

    const overlays = await Promise.all(
        items.map(async (item, index) => {
            const sourcePath = join(sourceDir, `${item.texture}.png`);
            const left = (index % columns) * cellSize;
            const top = Math.floor(index / columns) * cellSize;

            item.sprite = {
                url: atlasUrl,
                x: left,
                y: top,
                width: cellSize,
                height: cellSize,
            };

            const input = await sharp(sourcePath)
                .resize(cellSize, cellSize, {
                    fit: "contain",
                    kernel: "nearest",
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .png()
                .toBuffer();

            return { input, left, top };
        }),
    );

    await sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite(overlays)
        .png()
        .toFile(atlasPath);
}

async function prepareLocalRepo(version: string): Promise<string> {
    const cacheRoot = join(process.cwd(), ".cache", "minecraft-assets");
    const repoRoot = join(cacheRoot, version);

    if (!existsSync(cacheRoot)) {
        mkdirSync(cacheRoot, { recursive: true });
    }

    const repoUrl =
        "https://github.com/InventivetalentDev/minecraft-assets.git";

    if (existsSync(repoRoot)) {
        console.log(`Using cached repository at ${repoRoot}`);
        return repoRoot;
    }

    console.log(`Cloning ${repoUrl} (branch ${version}) into ${repoRoot}...`);
    await execAsync(
        `git clone --depth 1 --branch ${version} ${repoUrl} "${repoRoot}"`,
    );

    return repoRoot;
}

async function generate(): Promise<void> {
    const type = "items";

    console.log("Fetching latest version from GitHub...");
    const version = await getLatestVersion();
    console.log(`Latest version found: ${version}`);

    console.log(`Preparing local repository for version ${version}...`);
    const repoRoot = await prepareLocalRepo(version);
    console.log(`Using assets from local repo: ${repoRoot}`);

    try {
        const allJsonPath = join(repoRoot, "assets/minecraft/items/_all.json");
        if (!existsSync(allJsonPath)) {
            throw new Error(`_all.json not found at ${allJsonPath}`);
        }

        const allJsonContent = readFileSync(allJsonPath, "utf8");
        const allItems: Record<string, ItemDefinition> =
            JSON.parse(allJsonContent);
        const itemNames = Object.keys(allItems);
        console.log(`Found ${itemNames.length} item definitions`);

        const outputDir = join(process.cwd(), "public", type);
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        // Javaレンダラーを事前にコンパイル
        compileJavaRenderer();

        const items: ItemInfo[] = [];
        let copied = 0;
        let rendered = 0;
        let failed = 0;

        await Promise.all(
            itemNames.map(async (itemName) => {
                const itemDef = allItems[itemName];

                let modelPath: string | null = null;
                switch (itemDef.model.type) {
                    case "minecraft:model": {
                        modelPath = itemDef.model.model;
                        break;
                    }
                    case "minecraft:select": {
                        switch (itemDef.model.fallback.type) {
                            case "minecraft:model": {
                                modelPath = itemDef.model.fallback.model;
                                break;
                            }
                            case "minecraft:special": {
                                modelPath = null; // Unsupported
                                break;
                            }
                            default: {
                                console.warn(
                                    `Unsupported item model: ${itemName} (${itemDef.model.fallback.type})`,
                                );
                            }
                        }
                        break;
                    }
                }

                if (!modelPath) {
                    const reason = "no valid model path";
                    console.warn(`Skipping ${itemName}: ${reason}`);
                    failed++;
                    return;
                }

                const textureName =
                    modelPath.split("/").pop()?.replace("minecraft:", "") ||
                    itemName;
                const fileName = `${textureName}.png`;
                const filePath = join(outputDir, fileName);

                const result = await renderModel(repoRoot, modelPath, filePath);

                switch (result) {
                    case "copied":
                        copied++;
                        break;
                    case "rendered":
                        rendered++;
                        break;
                    default:
                        failed++;
                        break;
                }

                if (result !== "failed") {
                    items.push({
                        name: itemNameToDisplayName(itemName),
                        texture: textureName,
                        url: `/${type}/${fileName}`,
                    });
                }
            }),
        );

        const itemsJsonPath = join(process.cwd(), "public", "items.json");
        items.sort((a, b) => a.texture.localeCompare(b.texture));
        await writeSpriteAtlas(items);
        writeFileSync(itemsJsonPath, JSON.stringify(items, null, 2));
        console.log(`\n\nItems list saved to: ${itemsJsonPath}`);

        console.log(`\nAsset copy complete!`);
        console.log(`  Copied: ${copied}`);
        console.log(`  Rendered: ${rendered}`);
        console.log(`  Failed: ${failed}`);
        console.log(`  Total items: ${items.length}`);
        console.log(`  Output directory: ${outputDir}`);
    } catch (error) {
        console.error(`Error generating items for version ${version}:`, error);
        process.exit(1);
    }
}

generate().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
