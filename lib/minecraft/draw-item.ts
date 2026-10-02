import type { MinecraftItem, SlotPosition } from "../../types/inventory";

/** Detected slots are the 16×16 GUI interiors, excluding their border. */
export function itemBounds(slot: SlotPosition) {
    const size = Math.min(slot.width, slot.height);
    return {
        x: slot.x + (slot.width - size) / 2,
        y: slot.y + (slot.height - size) / 2,
        size,
    };
}

const images = new Map<string, Promise<HTMLImageElement>>();
export async function drawItem(
    ctx: CanvasRenderingContext2D,
    item: MinecraftItem,
    x: number,
    y: number,
    size: number,
) {
    if (item.error) throw new Error(item.error);
    const url = item.sprite?.url || item.url;
    let loading = images.get(url);
    if (!loading) {
        loading = new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => {
                images.delete(url);
                reject(new Error(`Failed to load item image: ${item.name}`));
            };
            image.src = url;
        });
        images.set(url, loading);
    }
    const image = await loading;
    if (item.sprite) {
        const sprite = item.sprite;
        ctx.drawImage(
            image,
            sprite.x,
            sprite.y,
            sprite.width,
            sprite.height,
            x,
            y,
            size,
            size,
        );
    } else ctx.drawImage(image, x, y, size, size);
    if (url.startsWith("blob:")) images.delete(url);
}
