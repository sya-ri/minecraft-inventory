import type { MinecraftItem } from "../../types/inventory";
import { Assets, json, mergePacks, resourcePath } from "./assets";
import { digest, makePack, PACK_LIMITS, safePath } from "./pack";
import { storage } from "./storage";
import type {
    Appearance,
    Catalog,
    Files,
    Model,
    ModelNode,
    ResourcePack,
} from "./types";

let catalogPromise: Promise<Catalog> | undefined;
export function loadCatalog() {
    if (!catalogPromise)
        catalogPromise = fetch("/items.json")
            .then(async (response) => {
                if (!response.ok)
                    throw new Error("Failed to load item catalog");
                const catalog = (await response.json()) as Catalog;
                if (!catalog.items || !catalog.atlas || !catalog.assets)
                    throw new Error("Invalid item catalog");
                return catalog;
            })
            .catch((error) => {
                catalogPromise = undefined;
                throw error;
            });
    return catalogPromise;
}
export function catalogItems(catalog: Catalog): MinecraftItem[] {
    return catalog.items.map((item) => ({
        name: item.name,
        itemId: item.itemId,
        url: catalog.atlas.url,
        sprite: {
            url: catalog.atlas.url,
            x: item.x,
            y: item.y,
            width: catalog.atlas.cellSize,
            height: catalog.atlas.cellSize,
            atlasWidth: catalog.atlas.width,
            atlasHeight: catalog.atlas.height,
        },
    }));
}
export function itemKey(item: MinecraftItem) {
    return item.itemId
        ? `${item.itemId}:${JSON.stringify(item.appearance || {})}`
        : item.url;
}
export function uniqueItems(items: MinecraftItem[]) {
    return [...new Map(items.map((item) => [itemKey(item), item])).values()];
}
export function unpack(
    bytes: Uint8Array,
    signal?: AbortSignal,
): Promise<Files> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./pack-worker.ts", import.meta.url));
        const stop = () => {
            worker.terminate();
            signal?.removeEventListener("abort", abort);
        };
        const abort = () => {
            stop();
            reject(new Error("Import cancelled"));
        };
        if (signal?.aborted) {
            abort();
            return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        worker.onmessage = (
            event: MessageEvent<{ files?: Files; error?: string }>,
        ) => {
            stop();
            if (event.data.files) resolve(event.data.files);
            else reject(new Error(event.data.error || "Failed to extract ZIP"));
        };
        worker.onerror = (event) => {
            stop();
            reject(new Error(event.message));
        };
        const buffer = bytes.slice().buffer;
        worker.postMessage(buffer, [buffer]);
    });
}
let basePromise: Promise<Files> | undefined;
export function loadBase(catalog: Catalog) {
    if (!basePromise)
        basePromise = (async () => {
            let bytes = await storage<Uint8Array>(
                `base:${catalog.assets.sha256}`,
            ).catch(() => undefined);
            if (bytes && (await digest(bytes)) !== catalog.assets.sha256)
                bytes = undefined;
            if (!bytes) {
                const response = await fetch(catalog.assets.url);
                if (!response.ok)
                    throw new Error("Failed to load vanilla asset bundle");
                bytes = new Uint8Array(await response.arrayBuffer());
                if ((await digest(bytes)) !== catalog.assets.sha256)
                    throw new Error("Vanilla asset bundle hash mismatch");
                await storage(`base:${catalog.assets.sha256}`, bytes).catch(
                    () => {},
                );
            }
            return unpack(bytes);
        })().catch((error) => {
            basePromise = undefined;
            throw error;
        });
    return basePromise;
}
export async function importPack(
    selected: File[],
    signal?: AbortSignal,
): Promise<ResourcePack> {
    if (!selected.length) throw new Error("No files selected");
    if (
        selected.length === 1 &&
        selected[0].name.toLowerCase().endsWith(".zip")
    ) {
        if (selected[0].size > PACK_LIMITS.input)
            throw new Error("ZIP exceeds 128 MiB");
        return makePack(
            selected[0].name.replace(/\.zip$/i, ""),
            await unpack(
                new Uint8Array(await selected[0].arrayBuffer()),
                signal,
            ),
        );
    }
    if (selected.length > PACK_LIMITS.entries)
        throw new Error("Too many files");
    const files: Files = Object.create(null);
    let total = 0;
    for (const file of selected) {
        if (signal?.aborted) throw new Error("Import cancelled");
        const path = safePath(file.webkitRelativePath || file.name);
        if (!/(?:^|\/)pack\.mcmeta$|\.(?:json|png|png\.mcmeta)$/.test(path))
            continue;
        total += file.size;
        if (file.size > PACK_LIMITS.file || total > PACK_LIMITS.total)
            throw new Error("Pack exceeds decompressed limits");
        if (files[path]) throw new Error(`Duplicate file: ${path}`);
        files[path] = new Uint8Array(await file.arrayBuffer());
    }
    return makePack(
        selected[0].webkitRelativePath.split("/")[0] || "Resource Pack",
        files,
    );
}
export function packItems(
    base: MinecraftItem[],
    assets: Assets,
): MinecraftItem[] {
    const known = new Set(base.map((item) => item.itemId));
    const result = [...base];
    const names: Record<string, string> = {};
    for (const path of Object.keys(assets.files).filter((p) =>
        p.endsWith("/lang/en_us.json"),
    ))
        Object.assign(names, json<Record<string, string>>(assets.files, path));
    for (const path of Object.keys(assets.files).filter((p) =>
        /^assets\/[^/]+\/items\/.+\.json$/.test(p),
    )) {
        const match = /^assets\/([^/]+)\/items\/(.+)\.json$/.exec(path);
        if (!match) continue;
        const id = `${match[1]}:${match[2]}`;
        if (known.has(id)) continue;
        known.add(id);
        result.push({
            itemId: id,
            name:
                names[`item.${match[1]}.${match[2].replaceAll("/", ".")}`] ||
                id,
            url: "",
            isCustom: true,
        });
    }
    for (const path of Object.keys(assets.files).filter((p) =>
        /^assets\/[^/]+\/models\/item\/.+\.json$/.test(p),
    )) {
        const match = /^assets\/([^/]+)\/models\/item\/(.+)\.json$/.exec(path);
        if (!match) continue;
        const model = json<Model>(assets.files, path);
        for (const override of model?.overrides || [])
            result.push({
                itemId: `${match[1]}:${match[2]}`,
                name: `${override.model} (${override.predicate.custom_model_data ?? "override"})`,
                appearance: { model: override.model },
                url: "",
                isCustom: true,
            });
    }
    return uniqueItems(result).map((item) => ({
        ...item,
        name:
            item.itemId && !item.appearance?.model
                ? names[`item.${item.itemId.replace(":", ".")}`] ||
                  names[`block.${item.itemId.replace(":", ".")}`] ||
                  item.name
                : item.name,
    }));
}
const ownedUrls = new Map<string, { references: number; retired: boolean }>();
export function ownImage(blob: Blob) {
    const url = URL.createObjectURL(blob);
    ownedUrls.set(url, { references: 0, retired: false });
    return url;
}
export function retainImage(url: string) {
    const entry = ownedUrls.get(url);
    if (entry) entry.references++;
}
export function releaseImage(url: string) {
    const entry = ownedUrls.get(url);
    if (entry) {
        entry.references--;
        if (entry.references <= 0 && entry.retired) {
            URL.revokeObjectURL(url);
            ownedUrls.delete(url);
        }
    }
}
export function retireImage(url: string) {
    const entry = ownedUrls.get(url);
    if (entry) {
        entry.retired = true;
        if (entry.references <= 0) {
            URL.revokeObjectURL(url);
            ownedUrls.delete(url);
        }
    }
}
export async function validatePacks(base: Files, packs: ResourcePack[]) {
    const assets = new Assets(mergePacks(base, packs));
    const checked = new Set<string>();
    const checkModel = (id: string) => {
        if (checked.has(id)) return;
        checked.add(id);
        const model = assets.model(id);
        for (const input of Object.values(model.textures || {})) {
            const texture = assets.textureReference(model, input),
                sprite = assets.sprite(texture);
            if (
                sprite === null ||
                !assets.files[
                    resourcePath(sprite?.resource || texture, "textures", "png")
                ]
            )
                throw new Error(`Missing texture: ${texture}`);
        }
        for (const override of model.overrides || [])
            checkModel(override.model);
    };
    const visit = (node: ModelNode, depth = 0) => {
        if (!node || depth > 64)
            throw new Error("Invalid or excessively nested item definition");
        const type = node.type?.replace(/^minecraft:/, "");
        if (type === "model") {
            if (typeof node.model !== "string")
                throw new Error("Model ID is required");
            checkModel(node.model);
        } else if (type === "special") {
            if (!node.base) throw new Error("Special model base is required");
            checkModel(node.base);
        } else if (
            ![
                "composite",
                "select",
                "condition",
                "range_dispatch",
                "empty",
                "bundle/selected_item",
            ].includes(type)
        )
            throw new Error(`Unsupported item node: ${node.type}`);
        for (const child of [
            ...(node.models || []),
            ...(node.cases || []).map((c) => c.model),
            ...(node.entries || []).map((e) => e.model),
            ...[node.fallback, node.on_true, node.on_false].filter(
                (n): n is ModelNode => !!n,
            ),
        ])
            visit(child, depth + 1);
    };
    for (const pack of packs.filter((p) => p.enabled))
        for (const rawPath of Object.keys(pack.files)) {
            const path = rawPath.replace(/^[^/]+\/(assets\/)/, "$1");
            if (!assets.files[path]) continue;
            const model = /^assets\/([^/]+)\/models\/(.+)\.json$/.exec(path);
            if (model) {
                checkModel(`${model[1]}:${model[2]}`);
            }
            if (/^assets\/[^/]+\/items\/.+\.json$/.test(path))
                visit(assets.get<{ model: ModelNode }>(path).model);
        }
    return assets;
}
export function appearanceEmpty(value?: Appearance) {
    return !value || Object.keys(value).length === 0;
}
