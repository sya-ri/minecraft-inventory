import { Assets } from "../lib/minecraft/assets";
import { unzipPack } from "../lib/minecraft/pack";
import { ItemRenderer } from "../lib/minecraft/renderer";
import type { Appearance } from "../lib/minecraft/types";

let renderer: ItemRenderer;
export async function initialize(extra: Record<string, number[]> = {}) {
    if (renderer) await renderer.dispose();
    const response = await fetch("/bundle.zip");
    renderer = new ItemRenderer(
        new Assets({
            ...unzipPack(new Uint8Array(await response.arrayBuffer())),
            ...Object.fromEntries(
                Object.entries(extra).map(([path, bytes]) => [
                    path,
                    new Uint8Array(bytes),
                ]),
            ),
        }),
    );
}
export async function render(itemId: string, appearance?: Appearance) {
    const blob = await renderer.render(itemId, appearance);
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
