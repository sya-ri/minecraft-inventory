export interface SlotPosition {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MinecraftItem {
    name: string;
    url: string;
    itemId?: string;
    appearance?: Appearance;
    error?: string;
    texture?: string;
    sprite?: {
        url: string;
        x: number;
        y: number;
        width: number;
        height: number;
        atlasWidth?: number;
        atlasHeight?: number;
    };
    isCustom?: boolean;
}

export interface PlacedMinecraftItem extends MinecraftItem {
    id: string;
    position: number | null;
}

import type { Appearance } from "@/lib/minecraft/types";
