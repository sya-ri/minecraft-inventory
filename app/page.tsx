import InventoryEditor from "@/components/inventory-editor";
import { MinecraftAssetsProvider } from "@/components/minecraft-assets-provider";

export default function Home() {
    return (
        <main className="flex h-screen flex-col bg-zinc-800 p-2 sm:p-4 overflow-hidden">
            <div className="w-full h-full max-w-[1400px] mx-auto">
                <MinecraftAssetsProvider>
                    <InventoryEditor />
                </MinecraftAssetsProvider>
            </div>
        </main>
    );
}
