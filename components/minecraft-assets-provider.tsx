"use client";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Assets, mergePacks } from "@/lib/minecraft/assets";
import {
    appearanceEmpty,
    catalogItems,
    itemKey,
    loadBase,
    loadCatalog,
    ownImage,
    packItems,
    retireImage,
    uniqueItems,
    validatePacks,
} from "@/lib/minecraft/client";
import type { ItemRenderer } from "@/lib/minecraft/renderer";
import { storage } from "@/lib/minecraft/storage";
import type { Catalog, ResourcePack } from "@/lib/minecraft/types";
import type { MinecraftItem } from "@/types/inventory";

interface State {
    items: MinecraftItem[];
    packs: ResourcePack[];
    revision: number;
    error: string | null;
    applyPacks: (packs: ResourcePack[]) => Promise<void>;
    renderItem: (item: MinecraftItem) => Promise<MinecraftItem>;
    registerModel: (model: string, itemId: string) => Promise<void>;
}
const Context = createContext<State | null>(null);
export function useMinecraftAssets() {
    const context = useContext(Context);
    if (!context) throw new Error("Missing Minecraft assets provider");
    return context;
}
export function MinecraftAssetsProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [catalog, setCatalog] = useState<Catalog>();
    const [items, setItems] = useState<MinecraftItem[]>([]);
    const [packs, setPacks] = useState<ResourcePack[]>([]);
    const [revision, setRevision] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const renderer = useRef<{
        key: string;
        value: Promise<ItemRenderer>;
    } | null>(null);
    const cache = useRef(new Map<string, Promise<MinecraftItem>>());
    const completed = useRef(new Map<string, string>());
    const urls = useRef(new Set<string>());
    const [registered, setRegistered] = useState<MinecraftItem[]>([]);
    const originals = useMemo(
        () =>
            new Map(
                catalog
                    ? catalogItems(catalog).map((item) => [item.itemId, item])
                    : [],
            ),
        [catalog],
    );
    const resetRenderer = useCallback(() => {
        const old = renderer.current;
        renderer.current = null;
        if (old)
            void old.value.then((value) => value.dispose()).catch(() => {});
        cache.current.clear();
        completed.current.clear();
        for (const url of urls.current) retireImage(url);
        urls.current.clear();
    }, []);
    useEffect(() => {
        let active = true;
        Promise.all([
            loadCatalog(),
            storage<ResourcePack[]>("packs").catch(() => []),
            storage<MinecraftItem[]>("models").catch(() => []),
        ])
            .then(([loaded, saved, models]) => {
                if (!active) return;
                setCatalog(loaded);
                setItems(catalogItems(loaded));
                setPacks(saved || []);
                setRegistered(models || []);
            })
            .catch((e) => {
                if (active) setError(String(e));
            });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (!catalog) return;
        let active = true;
        if (packs.some((p) => p.enabled))
            loadBase(catalog)
                .then((files) => {
                    if (active)
                        setItems(
                            uniqueItems([
                                ...packItems(
                                    catalogItems(catalog),
                                    new Assets(mergePacks(files, packs)),
                                ),
                                ...registered,
                            ]),
                        );
                })
                .catch((e) => {
                    if (active) setError(String(e));
                });
        else setItems(uniqueItems([...catalogItems(catalog), ...registered]));
        return () => {
            active = false;
        };
    }, [catalog, packs, registered]);
    useEffect(() => resetRenderer, [resetRenderer]);
    const applyPacks = useCallback(
        async (next: ResourcePack[]) => {
            if (!catalog) throw new Error("Catalog is still loading");
            await validatePacks(await loadBase(catalog), next);
            await storage("packs", next);
            resetRenderer();
            setPacks(next);
            setRevision((r) => r + 1);
            setError(null);
        },
        [catalog, resetRenderer],
    );
    const renderItem = useCallback(
        async (item: MinecraftItem): Promise<MinecraftItem> => {
            if (!item.itemId) return item;
            if (!catalog) throw new Error("Catalog is still loading");
            if (
                !packs.some((p) => p.enabled) &&
                appearanceEmpty(item.appearance)
            ) {
                const original = originals.get(item.itemId);
                if (original) return original;
            }
            const assetKey = `${catalog.rendererVersion}:${catalog.assets.sha256}:${packs
                .filter((p) => p.enabled)
                .map((p) => p.id)
                .join(":")}`;
            const key = `${assetKey}:${itemKey(item)}`;
            let promise = cache.current.get(key);
            const cachedUrl = completed.current.get(key);
            if (cachedUrl) {
                completed.current.delete(key);
                completed.current.set(key, cachedUrl);
            }
            if (!promise) {
                if (renderer.current?.key !== assetKey) {
                    resetRenderer();
                    renderer.current = {
                        key: assetKey,
                        value: Promise.all([
                            loadBase(catalog),
                            import("@/lib/minecraft/renderer"),
                        ]).then(
                            ([files, module]) =>
                                new module.ItemRenderer(
                                    new Assets(mergePacks(files, packs)),
                                ),
                        ),
                    };
                }
                const session = renderer.current;
                promise = session.value.then(async (value) => {
                    if (renderer.current !== session)
                        throw new Error(
                            "Pack settings changed; select the item again",
                        );
                    const blob = await value.render(
                        item.itemId || "",
                        item.appearance,
                    );
                    if (renderer.current !== session)
                        throw new Error(
                            "Pack settings changed; select the item again",
                        );
                    const url = ownImage(blob);
                    urls.current.add(url);
                    completed.current.set(key, url);
                    while (completed.current.size > 256) {
                        const oldest = completed.current.entries().next().value;
                        if (!oldest) break;
                        completed.current.delete(oldest[0]);
                        cache.current.delete(oldest[0]);
                        urls.current.delete(oldest[1]);
                        retireImage(oldest[1]);
                    }
                    return {
                        ...item,
                        url,
                        sprite: undefined,
                        error: undefined,
                    };
                });
                cache.current.set(key, promise);
            }
            return promise;
        },
        [catalog, packs, originals, resetRenderer],
    );
    const registerModel = useCallback(
        async (model: string, itemId: string) => {
            if (!catalog || !originals.has(itemId))
                throw new Error("Choose a vanilla base item ID");
            const assets = new Assets(
                mergePacks(await loadBase(catalog), packs),
            );
            assets.model(model);
            const next = [
                ...registered.filter(
                    (item) =>
                        item.itemId !== itemId ||
                        item.appearance?.model !== model,
                ),
                {
                    itemId,
                    name: model,
                    appearance: { model },
                    url: "",
                    isCustom: true,
                },
            ];
            await storage("models", next);
            setRegistered(next);
        },
        [registered, catalog, originals, packs],
    );
    return (
        <Context.Provider
            value={{
                items,
                packs,
                revision,
                error,
                applyPacks,
                renderItem,
                registerModel,
            }}
        >
            {children}
        </Context.Provider>
    );
}
