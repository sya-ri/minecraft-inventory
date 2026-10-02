"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useMinecraftAssets } from "@/components/minecraft-assets-provider";
import { releaseImage, retainImage } from "@/lib/minecraft/client";
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
    const { renderItem, revision } = useMinecraftAssets();
    const [resolved, setResolved] = useState(() =>
        item.itemId && !item.sprite ? { ...item, url: "" } : item,
    );
    useEffect(() => {
        let active = true;
        void revision;
        renderItem(item)
            .then((value) => {
                if (active) setResolved(value);
            })
            .catch((error) => {
                if (active) setResolved({ ...item, error: String(error) });
            });
        return () => {
            active = false;
        };
    }, [item, renderItem, revision]);
    useEffect(() => {
        retainImage(resolved.url);
        return () => releaseImage(resolved.url);
    }, [resolved.url]);
    if (resolved.error)
        return (
            <span
                role="img"
                aria-label={resolved.error}
                title={resolved.error}
                className={cn(
                    "flex items-center justify-center text-red-400",
                    className,
                )}
            >
                ?
            </span>
        );
    if (resolved.sprite) {
        const sprite = resolved.sprite;
        return (
            <svg
                aria-label={alt}
                className={cn("block pixelated", className)}
                role="img"
                viewBox={`${sprite.x} ${sprite.y} ${sprite.width} ${sprite.height}`}
            >
                <image
                    href={sprite.url}
                    width={sprite.atlasWidth}
                    height={sprite.atlasHeight}
                />
            </svg>
        );
    }
    if (!resolved.url)
        return <span className={cn("animate-pulse bg-gray-700", className)} />;
    return (
        <Image
            src={resolved.url}
            alt={alt}
            fill
            className={cn("object-contain pixelated", imageClassName)}
            fetchPriority="low"
            loading="lazy"
            sizes="48px"
            unoptimized
        />
    );
}
