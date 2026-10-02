export type Vec3 = [number, number, number];
export type Files = Record<string, Uint8Array>;
export interface Appearance {
    itemModel?: string;
    model?: string;
    customModelData?: number;
    customModelFloats?: number[];
    customModelStrings?: string[];
    customModelFlags?: boolean[];
    customModelColors?: number[];
    dye?: number;
    potionColor?: number;
    trimMaterial?: string;
    enchanted?: boolean;
    baseColor?: string;
    patterns?: { pattern: string; color: string }[];
    potDecorations?: string[];
    blockState?: Record<string, string>;
    skin?: string;
    map?: string;
}
export interface Transform {
    translation?: Vec3;
    scale?: Vec3;
    left_rotation?: [number, number, number, number];
    right_rotation?: [number, number, number, number];
}
export interface Special {
    type: string;
    texture?: string;
    kind?: string;
    color?: string;
    pose?: string;
    openness?: number;
    chest_type?: string;
    attachment?: string;
}
export interface Tint {
    type: string;
    value?: number;
    default?: number;
    index?: number;
    temperature?: number;
    downfall?: number;
}
export interface ModelNode {
    type: string;
    model?: string | Special;
    base?: string;
    models?: ModelNode[];
    transformation?: Transform;
    property?: string;
    component?: string;
    index?: number;
    block_state_property?: string;
    cases?: { when: string | string[]; model: ModelNode }[];
    entries?: { threshold: number; model: ModelNode }[];
    fallback?: ModelNode;
    on_true?: ModelNode;
    on_false?: ModelNode;
    scale?: number;
    tints?: Tint[];
}
export interface Face {
    texture: string;
    uv?: [number, number, number, number];
    rotation?: number;
    tintindex?: number;
}
export interface Element {
    from: Vec3;
    to: Vec3;
    faces: Partial<
        Record<"north" | "south" | "east" | "west" | "up" | "down", Face>
    >;
    rotation?: {
        origin: Vec3;
        axis: "x" | "y" | "z";
        angle: number;
        rescale?: boolean;
    };
    shade?: boolean;
}
export interface Model {
    parent?: string;
    textures?: Record<
        string,
        string | { sprite: string; force_translucent?: boolean }
    >;
    elements?: Element[];
    gui_light?: string;
    display?: Record<
        string,
        { rotation?: Vec3; translation?: Vec3; scale?: Vec3 }
    >;
    overrides?: { predicate: Record<string, number>; model: string }[];
    generated?: boolean;
}
export interface Catalog {
    version: string;
    rendererVersion: string;
    atlas: { url: string; width: number; height: number; cellSize: number };
    assets: { url: string; sha256: string };
    items: { itemId: string; name: string; x: number; y: number }[];
}
export interface ResourcePack {
    id: string;
    name: string;
    enabled: boolean;
    files: Files;
    warnings: string[];
}
export const GAME_VERSION = "26.3";
export const RENDERER_VERSION = "1";
export const RESOURCE_FORMAT = [97, 1] as const;
export const DYE_COLORS: Record<string, number> = {
    white: 0xf9fffe,
    orange: 0xf9801d,
    magenta: 0xc74ebd,
    light_blue: 0x3ab3da,
    yellow: 0xfed83d,
    lime: 0x80c71f,
    pink: 0xf38baa,
    gray: 0x474f52,
    light_gray: 0x9d9d97,
    cyan: 0x169c9c,
    purple: 0x8932b8,
    blue: 0x3c44aa,
    brown: 0x835432,
    green: 0x5e7c16,
    red: 0xb02e26,
    black: 0x1d1d21,
};
