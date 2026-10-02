import type {
    Appearance,
    Files,
    Model,
    ModelNode,
    ResourcePack,
} from "./types";

const decoder = new TextDecoder();
export function resourcePath(id: string, kind: string, extension = "json") {
    if (id.split(":").length > 2) throw new Error(`Invalid resource ID: ${id}`);
    const [namespace, name] = id.includes(":")
        ? id.split(":")
        : ["minecraft", id];
    if (
        !/^[a-z0-9_.-]+$/.test(namespace) ||
        !/^[a-z0-9_/.-]+$/.test(name) ||
        name.split("/").includes("..")
    ) {
        throw new Error(`Invalid resource ID: ${id}`);
    }
    return `assets/${namespace}/${kind}/${name}.${extension}`;
}
export function json<T>(files: Files, path: string): T | undefined {
    const bytes = files[path];
    return bytes ? (JSON.parse(decoder.decode(bytes)) as T) : undefined;
}
export class Assets {
    readonly used = new Set<string>();
    private models = new Map<string, Model>();
    private sprites?: Map<string, Sprite | null>;
    constructor(readonly files: Files) {}
    read(path: string) {
        const data = this.files[path];
        if (!data) throw new Error(`Missing asset: ${path}`);
        this.used.add(path);
        return data;
    }
    optional<T>(path: string): T | undefined {
        if (!this.files[path]) return undefined;
        return JSON.parse(decoder.decode(this.read(path))) as T;
    }
    get<T>(path: string): T {
        return JSON.parse(decoder.decode(this.read(path))) as T;
    }
    sprite(id: string): Sprite | null | undefined {
        if (!this.sprites) {
            this.sprites = new Map();
            const normalize = (value: string) =>
                value.includes(":") ? value : `minecraft:${value}`;
            for (const path of Object.keys(this.files).filter((path) =>
                /\/atlases\/[^/]+\.json$/.test(path),
            )) {
                for (const source of this.get<{ sources: SpriteSource[] }>(path)
                    .sources || []) {
                    const type = source.type.replace(/^minecraft:/, "");
                    if (type === "single" && source.resource)
                        this.sprites.set(
                            normalize(source.sprite || source.resource),
                            { resource: source.resource },
                        );
                    if (type === "directory")
                        for (const texture of Object.keys(this.files)) {
                            const match =
                                /^assets\/([^/]+)\/textures\/(.+)\.png$/.exec(
                                    texture,
                                );
                            if (match?.[2].startsWith(`${source.source}/`))
                                this.sprites.set(
                                    `${match[1]}:${source.prefix || ""}${match[2].slice((source.source || "").length + 1)}`,
                                    { resource: `${match[1]}:${match[2]}` },
                                );
                        }
                    if (type === "paletted_permutations")
                        for (const texture of source.textures || [])
                            for (const [suffix, palette] of Object.entries(
                                source.permutations || {},
                            ))
                                this.sprites.set(
                                    normalize(
                                        `${texture}${source.separator ?? "_"}${suffix}`,
                                    ),
                                    {
                                        resource: texture,
                                        paletteKey: source.palette_key,
                                        palette,
                                    },
                                );
                    if (type === "unstitch" && source.resource)
                        for (const region of source.regions || [])
                            this.sprites.set(normalize(region.sprite), {
                                resource: source.resource,
                                region: {
                                    ...region,
                                    divisorX: source.divisor_x ?? 1,
                                    divisorY: source.divisor_y ?? 1,
                                },
                            });
                    if (type === "filter") {
                        const namespace = new RegExp(
                                `^(?:${source.pattern?.namespace || ".*"})$`,
                            ),
                            name = new RegExp(
                                `^(?:${source.pattern?.path || ".*"})$`,
                            );
                        for (const key of this.sprites.keys()) {
                            const [ns, path] = key.split(":");
                            if (namespace.test(ns) && name.test(path))
                                this.sprites.set(key, null);
                        }
                    }
                }
            }
        }
        return this.sprites.get(id.includes(":") ? id : `minecraft:${id}`);
    }
    model(id: string, chain: string[] = []): Model {
        const path = resourcePath(id, "models");
        const cached = this.models.get(path);
        if (cached) return cached;
        if (chain.includes(path) || chain.length > 64)
            throw new Error(
                `Model parent cycle: ${[...chain, path].join(" -> ")}`,
            );
        const current = this.get<Model>(path);
        const parentId = current.parent?.replace(/^minecraft:/, "");
        const builtin =
            parentId === "builtin/generated" || parentId === "builtin/entity";
        const parent =
            current.parent && !builtin
                ? this.model(current.parent, [...chain, path])
                : {};
        const resolved = {
            ...parent,
            ...current,
            textures: { ...parent.textures, ...current.textures },
            display: { ...parent.display, ...current.display },
            generated:
                current.elements !== undefined
                    ? false
                    : parentId === "builtin/generated" || parent.generated,
        };
        this.models.set(path, resolved);
        return resolved;
    }
    textureReference(
        model: Model,
        input: string | { sprite: string },
        chain: string[] = [],
    ): string {
        const reference = typeof input === "string" ? input : input.sprite;
        if (!reference.startsWith("#") && !model.textures?.[reference])
            return reference;
        if (chain.includes(reference) || chain.length > 64)
            throw new Error(`Texture reference cycle: ${reference}`);
        const value =
            model.textures?.[
                reference.startsWith("#") ? reference.slice(1) : reference
            ];
        if (!value) throw new Error(`Missing texture variable: ${reference}`);
        return this.textureReference(model, value, [...chain, reference]);
    }
    definition(itemId: string, appearance: Appearance = {}): ModelNode {
        if (appearance.model)
            return { type: "minecraft:model", model: appearance.model };
        const id = appearance.itemModel || itemId;
        const modern = this.optional<{ model: ModelNode }>(
            resourcePath(id, "items"),
        );
        const legacy = this.optional<Model>(
            resourcePath(
                id.includes(":") ? id.replace(":", ":item/") : `item/${id}`,
                "models",
            ),
        );
        if (legacy?.overrides?.length && !appearance.itemModel) {
            const values: Record<string, number> = {
                custom_model_data:
                    appearance.customModelData ||
                    appearance.customModelFloats?.[0] ||
                    0,
                damage: 0,
                damaged: 0,
                pulling: 0,
                pull: 0,
                blocking: 0,
                charged: 0,
                firework: 0,
                cast: 0,
                lefthanded: 0,
            };
            const match = [...legacy.overrides]
                .reverse()
                .find((o) =>
                    Object.entries(o.predicate).every(
                        ([key, threshold]) =>
                            (values[key.replace(/^minecraft:/, "")] ?? 0) >=
                            threshold,
                    ),
                );
            if (match) return { type: "minecraft:model", model: match.model };
        }
        if (modern) return modern.model;
        if (legacy)
            return {
                type: "minecraft:model",
                model: id.replace(":", ":item/"),
            };
        throw new Error(`Item definition no longer available: ${id}`);
    }
}

export interface Sprite {
    resource: string;
    paletteKey?: string;
    palette?: string;
    region?: {
        x: number;
        y: number;
        width: number;
        height: number;
        divisorX: number;
        divisorY: number;
    };
}
interface SpriteSource {
    type: string;
    resource?: string;
    sprite?: string;
    source?: string;
    prefix?: string;
    textures?: string[];
    palette_key?: string;
    permutations?: Record<string, string>;
    separator?: string;
    regions?: {
        sprite: string;
        x: number;
        y: number;
        width: number;
        height: number;
    }[];
    divisor_x?: number;
    divisor_y?: number;
    pattern?: { namespace?: string; path?: string };
}

interface PackMetadata {
    pack?: {
        pack_format?: number;
        min_format?: number | number[];
        max_format?: number | number[];
        description?: unknown;
    };
    overlays?: {
        entries?: {
            directory: string;
            formats?: number | { min_inclusive: number; max_inclusive: number };
            min_format?: number | number[];
            max_format?: number | number[];
        }[];
    };
    filter?: { block?: { namespace?: string; path?: string }[] };
}
function formatNumber(value: number | number[] | undefined, fallback: number) {
    return Array.isArray(value)
        ? value[0] + (value[1] || 0) / 1000
        : (value ?? fallback);
}
export function mergePacks(base: Files, packs: ResourcePack[]): Files {
    const files = { ...base };
    for (const pack of [...packs].reverse().filter((p) => p.enabled)) {
        const metadata = json<PackMetadata>(pack.files, "pack.mcmeta");
        for (const filter of metadata?.filter?.block || []) {
            const namespace = new RegExp(`^(?:${filter.namespace || ".*"})$`);
            const path = new RegExp(`^(?:${filter.path || ".*"})$`);
            for (const file of Object.keys(files)) {
                const match = /^assets\/([^/]+)\/(.*)$/.exec(file);
                if (match && namespace.test(match[1]) && path.test(match[2]))
                    delete files[file];
            }
        }
        const layer = Object.fromEntries(
            Object.entries(pack.files).filter(([p]) => p.startsWith("assets/")),
        );
        for (const overlay of metadata?.overlays?.entries || []) {
            const legacy = overlay.formats;
            const min =
                typeof legacy === "number" ? legacy : legacy?.min_inclusive;
            const max =
                typeof legacy === "number" ? legacy : legacy?.max_inclusive;
            if (
                formatNumber(overlay.min_format, min ?? 0) > 97.001 ||
                formatNumber(overlay.max_format, max ?? Infinity) < 97.001
            )
                continue;
            if (!/^[a-zA-Z0-9_-]+$/.test(overlay.directory))
                throw new Error("Invalid overlay directory");
            const prefix = `${overlay.directory}/`;
            for (const [path, data] of Object.entries(pack.files))
                if (path.startsWith(`${prefix}assets/`))
                    layer[path.slice(prefix.length)] = data;
        }
        for (const [path, data] of Object.entries(layer)) {
            if (/\/atlases\/[^/]+\.json$/.test(path) && files[path]) {
                const lower = json<{ sources: SpriteSource[] }>(files, path),
                    upper = json<{ sources: SpriteSource[] }>(layer, path);
                files[path] = new TextEncoder().encode(
                    JSON.stringify({
                        sources: [
                            ...(lower?.sources || []),
                            ...(upper?.sources || []),
                        ],
                    }),
                );
            } else files[path] = data;
        }
    }
    return files;
}
