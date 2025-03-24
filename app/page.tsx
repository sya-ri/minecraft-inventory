import InventoryEditor from "@/components/inventory-editor"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-2 sm:p-4 bg-zinc-800">
      <div className="w-full max-w-7xl mx-auto">
        <InventoryEditor />
      </div>
    </main>
  )
}

