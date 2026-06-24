"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MinecraftItemIcon } from "@/components/minecraft-item-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { MinecraftItem } from "@/types/inventory";

interface ItemSelectorProps {
    onSelectItem: (item: MinecraftItem) => void;
    onClose: () => void;
    recentItems: MinecraftItem[];
}

// Cache for Minecraft items
let cachedItems: MinecraftItem[] | null = null;

const ITEM_SIZE = 64;
const ITEM_GAP = 8;
const ROW_HEIGHT = ITEM_SIZE + ITEM_GAP;
const OVERSCAN_ROWS = 3;

export default function ItemSelector({
    onSelectItem,
    onClose,
    recentItems,
}: ItemSelectorProps) {
    const [items, setItems] = useState<MinecraftItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<MinecraftItem[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualListRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportSize, setViewportSize] = useState({
        width: 0,
        height: 0,
    });
    const shouldShowAllItems = searchQuery.trim().length > 0;

    useEffect(() => {
        const fetchItems = async () => {
            try {
                setLoading(true);
                setError(null);

                // Use cached items if available
                if (cachedItems) {
                    setItems(cachedItems);
                    setFilteredItems(cachedItems);
                    setLoading(false);
                    return;
                }

                const response = await fetch(`/items.json`);

                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch item list: ${response.status}`,
                    );
                }

                const items: MinecraftItem[] = await response.json();

                if (!items || !Array.isArray(items)) {
                    throw new Error("Invalid data format received");
                }

                // Cache the fetched items
                cachedItems = items;
                setItems(items);
                setFilteredItems(items);
                setLoading(false);
            } catch (error) {
                console.error("Error fetching Minecraft items:", error);
                setError("Failed to load items. Please try again.");
                setLoading(false);
            }
        };

        fetchItems();
    }, []);

    useEffect(() => {
        if (searchQuery) {
            const filtered = items.filter((item) =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()),
            );
            setFilteredItems(filtered);
        } else {
            setFilteredItems(items);
        }
    }, [searchQuery, items]);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;

        const updateViewportSize = () => {
            setViewportSize({
                width: element.clientWidth,
                height: element.clientHeight,
            });
        };

        updateViewportSize();

        const resizeObserver = new ResizeObserver(updateViewportSize);
        resizeObserver.observe(element);

        return () => resizeObserver.disconnect();
    }, []);

    const gridWidth = Math.max(ITEM_SIZE, viewportSize.width - 32);
    const columns = Math.max(
        1,
        Math.floor((gridWidth + ITEM_GAP) / (ITEM_SIZE + ITEM_GAP)),
    );
    const listScrollTop = Math.max(
        0,
        scrollTop - (virtualListRef.current?.offsetTop ?? 0),
    );
    const totalRows = Math.ceil(filteredItems.length / columns);
    const startRow = Math.max(
        0,
        Math.floor(listScrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
    );
    const endRow = Math.min(
        totalRows,
        Math.ceil((listScrollTop + viewportSize.height) / ROW_HEIGHT) +
            OVERSCAN_ROWS,
    );
    const visibleItems = useMemo(() => {
        const startIndex = startRow * columns;
        const endIndex = Math.min(filteredItems.length, endRow * columns);

        return filteredItems.slice(startIndex, endIndex);
    }, [columns, endRow, filteredItems, startRow]);

    return (
        <>
            <div className="p-4 border-b border-gray-800">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search items..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setScrollTop(0);
                            scrollRef.current?.scrollTo({ top: 0 });
                        }}
                    />
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 h-[400px] overflow-y-auto"
                onScroll={(event) => {
                    setScrollTop(event.currentTarget.scrollTop);
                }}
            >
                <div className="p-4">
                    {/* Recent Items Section */}
                    {recentItems.length > 0 && !searchQuery && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-gray-400 mb-2">
                                Recent Items
                            </h3>
                            <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                                {recentItems.map((item) => (
                                    <button
                                        key={item.name}
                                        type="button"
                                        className="w-16 h-16 bg-gray-800 rounded border border-gray-700 hover:border-primary transition-colors p-1 flex items-center justify-center relative"
                                        onClick={() => onSelectItem(item)}
                                        title={item.name}
                                    >
                                        <div className="relative flex h-12 w-12 items-center justify-center">
                                            <MinecraftItemIcon
                                                item={item}
                                                className="h-8 w-8"
                                            />
                                        </div>
                                        {item.isCustom && (
                                            <div className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* All Items Section */}
                    {loading ? (
                        <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                            {[...Array(16)].map((_, i) => (
                                <Skeleton
                                    // biome-ignore lint/suspicious/noArrayIndexKey: Static placeholder array with fixed size - items are never reordered, added, or removed
                                    key={i}
                                    className="w-16 h-16 bg-gray-800"
                                />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="text-center py-8 text-red-400">
                            {error}
                        </div>
                    ) : shouldShowAllItems ? (
                        <div>
                            <div
                                ref={virtualListRef}
                                className="relative"
                                style={{
                                    height: `${totalRows * ROW_HEIGHT}px`,
                                }}
                            >
                                {filteredItems.length > 0 ? (
                                    <div
                                        className="absolute left-0 grid gap-2"
                                        style={{
                                            top: `${startRow * ROW_HEIGHT}px`,
                                            gridTemplateColumns: `repeat(${columns}, ${ITEM_SIZE}px)`,
                                        }}
                                    >
                                        {visibleItems.map((item) => (
                                            <button
                                                key={item.name}
                                                type="button"
                                                className="w-16 h-16 bg-gray-800 rounded border border-gray-700 hover:border-primary transition-colors p-1 flex items-center justify-center"
                                                onClick={() =>
                                                    onSelectItem(item)
                                                }
                                                title={item.name}
                                            >
                                                <div className="relative flex h-12 w-12 items-center justify-center">
                                                    <MinecraftItemIcon
                                                        item={item}
                                                        className="h-8 w-8"
                                                    />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="col-span-full text-center py-8 text-gray-400">
                                        No items found matching {searchQuery}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            Search to browse all items
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 border-t border-gray-800 flex justify-end">
                <Button variant="outline" onClick={onClose}>
                    Cancel
                </Button>
            </div>
        </>
    );
}
