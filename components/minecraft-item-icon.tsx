"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { MinecraftItem } from "@/types/inventory";

interface MinecraftItemIconProps {
    item: MinecraftItem;
    alt?: string;
    className?: string;
    imageClassName?: string;
}

export function MinecraftItemIcon({
    item,
    alt = item.name,
    className,
    imageClassName,
}: MinecraftItemIconProps) {
    if (item.sprite && !item.isCustom) {
        return (
            <span
                aria-label={alt}
                className={cn("block bg-no-repeat", className)}
                role="img"
                style={{
                    backgroundImage: `url(${item.sprite.url})`,
                    backgroundPosition: `-${item.sprite.x}px -${item.sprite.y}px`,
                    backgroundSize: "auto",
                    imageRendering: "pixelated",
                }}
            />
        );
    }

    return (
        <Image
            src={item.url}
            alt={alt}
            fill
            className={cn("object-contain pixelated", imageClassName)}
            fetchPriority="low"
            loading="lazy"
            sizes="48px"
        />
    );
}
