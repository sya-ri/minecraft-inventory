import type React from "react";
import { MinecraftItemIcon } from "@/components/minecraft-item-icon";
import type { PlacedMinecraftItem } from "@/types/inventory";

interface ItemSlotProps {
    position: number;
    item?: PlacedMinecraftItem | null;
    onDrop: (position: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onClick: (position: number) => void;
    onDragStart: (id: string) => void;
    onRemoveItem?: (position: number) => void;
    width: number;
    height: number;
}

export function ItemSlot({
    position,
    item,
    onDrop,
    onDragOver,
    onClick,
    onDragStart,
    onRemoveItem,
}: ItemSlotProps) {
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (item && onRemoveItem) {
            onRemoveItem(position);
        }
    };

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop functionality requires native DOM events for onDrop, onDragOver, and onContextMenu
        // biome-ignore lint/a11y/useKeyWithClickEvents: Click handler is for game inventory interaction, keyboard alternative provided at parent level
        <div
            className="relative w-full h-full"
            onDrop={(e) => {
                e.preventDefault();
                onDrop(position);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                onDragOver(e);
            }}
            onClick={() => onClick(position)}
            onContextMenu={handleContextMenu}
        >
            {item ? (
                // biome-ignore lint/a11y/noStaticElementInteractions: Draggable item requires onDragStart event on non-interactive element for drag and drop functionality
                <div
                    className="w-full h-full"
                    draggable
                    onDragStart={(e) => {
                        onDragStart(item.id);
                        e.dataTransfer.effectAllowed = "move";
                    }}
                >
                    <div className="relative w-full h-full p-[20%]">
                        <MinecraftItemIcon
                            item={item}
                            alt="Item"
                            className="h-full w-full"
                            imageClassName="object-contain pixelated"
                        />
                    </div>
                </div>
            ) : (
                <div className="w-full h-full bg-black/20" />
            )}
        </div>
    );
}
