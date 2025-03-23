import InventoryEditor from "@/components/inventory-editor"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-zinc-800">
      <h1 className="text-3xl font-bold text-white mb-8">Minecraft Inventory Editor</h1>
      <InventoryEditor />
    </main>
  )
}

