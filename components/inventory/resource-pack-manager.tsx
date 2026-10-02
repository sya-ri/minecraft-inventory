"use client";
import { useEffect, useRef, useState } from "react";
import { useMinecraftAssets } from "@/components/minecraft-assets-provider";
import { Button } from "@/components/ui/button";
import { importPack } from "@/lib/minecraft/client";
import type { ResourcePack } from "@/lib/minecraft/types";

export function ResourcePackManager({ onClose }: { onClose: () => void }) {
    const { packs, applyPacks, registerModel } = useMinecraftAssets();
    const [busy, setBusy] = useState(false),
        [error, setError] = useState<string | null>(null),
        [model, setModel] = useState(""),
        [base, setBase] = useState("minecraft:paper");
    const zip = useRef<HTMLInputElement>(null),
        folder = useRef<HTMLInputElement>(null),
        cancel = useRef<AbortController | null>(null);
    useEffect(() => () => cancel.current?.abort(), []);
    const update = async (next: ResourcePack[]) => {
        setBusy(true);
        setError(null);
        try {
            await applyPacks(next);
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };
    const upload = async (files: File[]) => {
        setBusy(true);
        setError(null);
        cancel.current = new AbortController();
        try {
            const pack = await importPack(files, cancel.current.signal);
            if (!cancel.current.signal.aborted)
                await applyPacks([
                    pack,
                    ...packs.filter((p) => p.id !== pack.id),
                ]);
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
            cancel.current = null;
        }
    };
    const move = (index: number, delta: number) => {
        const next = [...packs];
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        void update(next);
    };
    return (
        <div className="p-4 space-y-4 overflow-y-auto">
            <p className="text-sm text-gray-400">
                Packs stay in this browser. The first enabled pack has highest
                priority. Importing or rendering does not upload your files.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => zip.current?.click()}>
                    Upload ZIP
                </Button>
                <Button disabled={busy} onClick={() => folder.current?.click()}>
                    Select Folder
                </Button>
                {busy && cancel.current && (
                    <Button
                        variant="outline"
                        onClick={() => cancel.current?.abort()}
                    >
                        Cancel import
                    </Button>
                )}
            </div>
            <input
                ref={zip}
                className="hidden"
                type="file"
                accept=".zip"
                onChange={(e) => {
                    void upload(Array.from(e.target.files || []));
                    e.target.value = "";
                }}
            />
            <input
                ref={folder}
                className="hidden"
                type="file"
                multiple
                {...{ webkitdirectory: "" }}
                onChange={(e) => {
                    void upload(Array.from(e.target.files || []));
                    e.target.value = "";
                }}
            />
            {busy && <output>Processing pack…</output>}
            {error && (
                <p role="alert" className="text-red-400">
                    {error}
                </p>
            )}
            {packs.map((pack, index) => (
                <div
                    key={pack.id}
                    className="rounded border border-gray-700 p-3 space-y-2"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex-1 flex gap-2">
                            <input
                                type="checkbox"
                                checked={pack.enabled}
                                disabled={busy}
                                onChange={(e) =>
                                    void update(
                                        packs.map((p) =>
                                            p.id === pack.id
                                                ? {
                                                      ...p,
                                                      enabled: e.target.checked,
                                                  }
                                                : p,
                                        ),
                                    )
                                }
                            />
                            {pack.name}
                        </label>
                        <Button
                            variant="outline"
                            disabled={busy || index === 0}
                            onClick={() => move(index, -1)}
                        >
                            Up
                        </Button>
                        <Button
                            variant="outline"
                            disabled={busy || index === packs.length - 1}
                            onClick={() => move(index, 1)}
                        >
                            Down
                        </Button>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                                void update(
                                    packs.filter((p) => p.id !== pack.id),
                                )
                            }
                        >
                            Delete
                        </Button>
                    </div>
                    {pack.warnings.map((warning) => (
                        <p key={warning} className="text-amber-300 text-sm">
                            {warning}
                        </p>
                    ))}
                </div>
            ))}
            <form
                className="space-y-2 border-t border-gray-700 pt-3"
                onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError(null);
                    try {
                        await registerModel(model, base);
                        setModel("");
                    } catch (error) {
                        setError(String(error));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <p className="text-sm">
                    Register a model without an item definition
                </p>
                <label className="block text-sm">
                    Model ID
                    <input
                        className="block w-full p-2 bg-gray-800 rounded"
                        placeholder="my_pack:item/example"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        required
                    />
                </label>
                <label className="block text-sm">
                    Base item ID
                    <input
                        className="block w-full p-2 bg-gray-800 rounded"
                        value={base}
                        onChange={(e) => setBase(e.target.value)}
                        required
                    />
                </label>
                <Button disabled={busy || !model}>Add Model</Button>
            </form>
            <Button variant="outline" disabled={busy} onClick={onClose}>
                Back to Items
            </Button>
        </div>
    );
}
