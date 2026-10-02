"use client";
import { useEffect, useState } from "react";
import { useMinecraftAssets } from "@/components/minecraft-assets-provider";
import { MinecraftItemIcon } from "@/components/minecraft-item-icon";
import { Button } from "@/components/ui/button";
import { DEFAULT_GLINT } from "@/lib/minecraft/defaults";
import { type Appearance, DYE_COLORS } from "@/lib/minecraft/types";
import type { MinecraftItem } from "@/types/inventory";

export function ItemAppearanceEditor({
    item,
    onSelect,
    onBack,
}: {
    item: MinecraftItem;
    onSelect: (item: MinecraftItem) => void;
    onBack: () => void;
}) {
    const { renderItem } = useMinecraftAssets();
    const [appearance, setAppearance] = useState<Appearance>(
            item.appearance || {},
        ),
        [preview, setPreview] = useState(item),
        [error, setError] = useState<string | null>(null),
        [busy, setBusy] = useState(false);
    const [validation, setValidation] = useState<Record<string, string>>({});
    const validate = (field: string, message?: string) =>
        setValidation((old) => {
            const next = { ...old };
            if (message) next[field] = message;
            else delete next[field];
            return next;
        });
    const [patternText, setPatternText] = useState(
        JSON.stringify(item.appearance?.patterns || []),
    );
    useEffect(() => {
        let active = true;
        setBusy(true);
        setError(null);
        renderItem({ ...item, appearance })
            .then((value) => {
                if (active) setPreview(value);
            })
            .catch((e) => {
                if (active) setError(String(e));
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
    }, [appearance, item, renderItem]);
    const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
        setAppearance((old) => {
            const next = { ...old };
            if (value === undefined || value === "") delete next[key];
            else next[key] = value;
            return next;
        });
    const text = (label: string, key: "itemModel" | "trimMaterial") => (
        <label className="block text-sm">
            {label}
            <input
                className="block w-full bg-gray-800 p-2 rounded"
                value={appearance[key] || ""}
                onChange={(e) => set(key, e.target.value)}
            />
        </label>
    );
    const color = (label: string, key: "dye" | "potionColor") => (
        <label className="flex items-center gap-2 text-sm">
            {label}
            <input
                type="checkbox"
                checked={appearance[key] !== undefined}
                onChange={(e) =>
                    set(key, e.target.checked ? 0xffffff : undefined)
                }
            />
            <input
                type="color"
                disabled={appearance[key] === undefined}
                value={`#${(appearance[key] ?? 0xffffff).toString(16).padStart(6, "0")}`}
                onChange={(e) =>
                    set(key, Number.parseInt(e.target.value.slice(1), 16))
                }
            />
        </label>
    );
    const upload = async (file: File | undefined, key: "skin" | "map") => {
        if (!file) return;
        if (file.size > 16 * 1024 * 1024) {
            validate(key, "Image exceeds 16 MiB");
            return;
        }
        try {
            const bitmap = await createImageBitmap(file);
            try {
                if (bitmap.width * bitmap.height > 16 * 1024 * 1024)
                    throw new Error("Image exceeds pixel limit");
                if (
                    key === "skin" &&
                    (bitmap.width !== 64 || ![32, 64].includes(bitmap.height))
                )
                    throw new Error("Skin must be 64×64 or 64×32 PNG");
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = key === "skin" ? 64 : bitmap.height;
                canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
                set(key, canvas.toDataURL("image/png"));
                validate(key);
            } finally {
                bitmap.close();
            }
        } catch (error) {
            validate(key, String(error));
        }
    };
    return (
        <div className="p-4 overflow-y-auto space-y-4">
            <div className="flex gap-4 items-center">
                <div className="relative w-24 h-24 bg-gray-800 flex items-center justify-center">
                    <MinecraftItemIcon
                        item={{ ...item, appearance }}
                        className="w-20 h-20"
                    />
                </div>
                <div>
                    <h3>{item.name}</h3>
                    <p className="text-sm text-gray-400">
                        {item.itemId || "Custom image"}
                    </p>
                </div>
            </div>
            {item.itemId && (
                <div className="grid sm:grid-cols-2 gap-3">
                    {text("Item model ID", "itemModel")}
                    <label className="block text-sm">
                        CustomModelData
                        <input
                            className="block w-full bg-gray-800 p-2 rounded"
                            type="number"
                            value={appearance.customModelData ?? ""}
                            onChange={(e) =>
                                set(
                                    "customModelData",
                                    e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                )
                            }
                        />
                    </label>
                    {color("Dye color", "dye")}
                    {color("Potion color", "potionColor")}
                    {text(
                        "Trim material ID (e.g. minecraft:quartz)",
                        "trimMaterial",
                    )}
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={
                                appearance.enchanted ??
                                DEFAULT_GLINT.has(item.itemId || "")
                            }
                            onChange={(e) => set("enchanted", e.target.checked)}
                        />
                        Enchantment glint
                    </label>
                    <label className="block text-sm">
                        Banner / shield base color
                        <select
                            className="block w-full bg-gray-800 p-2 rounded"
                            value={appearance.baseColor || ""}
                            onChange={(e) =>
                                set("baseColor", e.target.value || undefined)
                            }
                        >
                            <option value="">Default</option>
                            {Object.keys(DYE_COLORS).map((color) => (
                                <option key={color}>{color}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm">
                        Patterns (JSON)
                        <textarea
                            className="block w-full bg-gray-800 p-2 rounded"
                            value={patternText}
                            placeholder={
                                '[{"pattern":"stripe_center","color":"red"}]'
                            }
                            onChange={(e) => {
                                setPatternText(e.target.value);
                                try {
                                    const value = JSON.parse(e.target.value);
                                    if (
                                        !Array.isArray(value) ||
                                        value.length > 16 ||
                                        value.some(
                                            (p) =>
                                                typeof p.pattern !== "string" ||
                                                !DYE_COLORS[p.color],
                                        )
                                    )
                                        throw new Error(
                                            "Use up to 16 pattern/color entries",
                                        );
                                    set(
                                        "patterns",
                                        value.length ? value : undefined,
                                    );
                                    validate("patterns");
                                } catch (error) {
                                    validate("patterns", String(error));
                                }
                            }}
                        />
                    </label>
                    <label className="block text-sm">
                        CustomModelData floats
                        <input
                            className="block w-full bg-gray-800 p-2 rounded"
                            placeholder="1, 2"
                            defaultValue={appearance.customModelFloats?.join(
                                ", ",
                            )}
                            onBlur={(e) => {
                                const values = e.target.value
                                    .split(",")
                                    .map((v) => Number(v.trim()));
                                if (values.some((v) => !Number.isFinite(v)))
                                    validate(
                                        "floats",
                                        "Floats must be numbers",
                                    );
                                else {
                                    validate("floats");
                                    set(
                                        "customModelFloats",
                                        e.target.value ? values : undefined,
                                    );
                                }
                            }}
                        />
                    </label>
                    <label className="block text-sm">
                        CustomModelData colors (hex)
                        <input
                            className="block w-full bg-gray-800 p-2 rounded"
                            placeholder="#ff0000, #00ff00"
                            defaultValue={appearance.customModelColors
                                ?.map(
                                    (color) =>
                                        `#${color.toString(16).padStart(6, "0")}`,
                                )
                                .join(", ")}
                            onBlur={(event) => {
                                const parts = event.target.value
                                    .split(",")
                                    .map((value) => value.trim());
                                if (
                                    event.target.value &&
                                    parts.some(
                                        (value) =>
                                            !/^#?[0-9a-f]{6}$/i.test(value),
                                    )
                                )
                                    validate(
                                        "colors",
                                        "Colors must be six-digit hex values",
                                    );
                                else {
                                    validate("colors");
                                    set(
                                        "customModelColors",
                                        event.target.value
                                            ? parts.map((value) =>
                                                  Number.parseInt(
                                                      value.replace(/^#/, ""),
                                                      16,
                                                  ),
                                              )
                                            : undefined,
                                    );
                                }
                            }}
                        />
                    </label>
                    <label className="block text-sm">
                        CustomModelData strings
                        <input
                            className="block w-full bg-gray-800 p-2 rounded"
                            placeholder="custom_variant"
                            defaultValue={appearance.customModelStrings?.join(
                                ", ",
                            )}
                            onBlur={(e) =>
                                set(
                                    "customModelStrings",
                                    e.target.value
                                        ? e.target.value
                                              .split(",")
                                              .map((v) => v.trim())
                                        : undefined,
                                )
                            }
                        />
                    </label>
                    <label className="block text-sm">
                        CustomModelData flags
                        <input
                            className="block w-full bg-gray-800 p-2 rounded"
                            placeholder="true, false"
                            defaultValue={appearance.customModelFlags?.join(
                                ", ",
                            )}
                            onBlur={(e) => {
                                const values = e.target.value
                                    .split(",")
                                    .map((v) => v.trim());
                                if (
                                    e.target.value &&
                                    values.some(
                                        (v) => v !== "true" && v !== "false",
                                    )
                                )
                                    validate(
                                        "flags",
                                        "Flags must be true or false",
                                    );
                                else {
                                    validate("flags");
                                    set(
                                        "customModelFlags",
                                        e.target.value
                                            ? values.map((v) => v === "true")
                                            : undefined,
                                    );
                                }
                            }}
                        />
                    </label>
                    <label className="block text-sm">
                        Pot decorations (back, left, right, front)
                        <input
                            className="block w-full bg-gray-800 p-2 rounded"
                            placeholder="angler_pottery_sherd, brick, brick, brick"
                            defaultValue={appearance.potDecorations?.join(", ")}
                            onBlur={(e) => {
                                const parts = e.target.value
                                    .split(",")
                                    .map((v) => v.trim());
                                if (parts.length > 4)
                                    validate(
                                        "pot",
                                        "Use up to four decorations",
                                    );
                                else {
                                    validate("pot");
                                    set(
                                        "potDecorations",
                                        e.target.value
                                            ? parts.map((p) =>
                                                  p === "brick"
                                                      ? "decorated_pot_side"
                                                      : p,
                                              )
                                            : undefined,
                                    );
                                }
                            }}
                        />
                    </label>
                    {item.itemId.endsWith("player_head") && (
                        <label className="block text-sm">
                            Player skin PNG
                            <input
                                type="file"
                                accept="image/png"
                                onChange={(e) =>
                                    void upload(e.target.files?.[0], "skin")
                                }
                            />
                        </label>
                    )}
                    {item.itemId.endsWith("filled_map") && (
                        <label className="block text-sm">
                            Map image
                            <input
                                type="file"
                                accept="image/png"
                                onChange={(e) =>
                                    void upload(e.target.files?.[0], "map")
                                }
                            />
                        </label>
                    )}
                </div>
            )}
            {error && (
                <p role="alert" className="text-red-400">
                    {error}
                </p>
            )}
            {Object.entries(validation).map(([field, message]) => (
                <p role="alert" key={field} className="text-red-400">
                    {message}
                </p>
            ))}
            <div className="flex gap-2">
                <Button
                    disabled={
                        busy || !!error || Object.keys(validation).length > 0
                    }
                    onClick={() => onSelect({ ...preview, appearance })}
                >
                    {busy ? "Rendering…" : "Use Item"}
                </Button>
                <Button variant="outline" onClick={onBack}>
                    Back
                </Button>
            </div>
        </div>
    );
}
