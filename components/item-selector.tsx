"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

interface MinecraftItem {
  name: string
  path: string
  url: string
}

interface ItemSelectorProps {
  onSelectItem: (item: MinecraftItem) => void
  onClose: () => void
}

export default function ItemSelector({ onSelectItem, onClose }: ItemSelectorProps) {
  const [items, setItems] = useState<MinecraftItem[]>([])
  const [filteredItems, setFilteredItems] = useState<MinecraftItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true)
        setError(null)

        // Use a proxy API route to fetch the _list.json file
        // This avoids CORS issues
        const response = await fetch("/api/minecraft-items")

        if (!response.ok) {
          throw new Error(`Failed to fetch item list: ${response.status}`)
        }

        const data = await response.json()

        if (!data || !data.items || !Array.isArray(data.items)) {
          throw new Error("Invalid data format received from API")
        }

        const baseUrl =
          "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.4/assets/minecraft/textures/item/"

        const fetchedItems = data.items.map((itemPath: string) => {
          // Remove the file extension to get the item name
          const itemName = itemPath.replace(".png", "")

          return {
            name: itemName.replace(/_/g, " "), // Replace underscores with spaces for display
            path: itemPath,
            url: `${baseUrl}${itemPath}`,
          }
        })

        setItems(fetchedItems)
        setFilteredItems(fetchedItems)
        setLoading(false)
      } catch (error) {
        console.error("Error fetching Minecraft items:", error)
        setError("Failed to load items. Please try again.")
        setLoading(false)

        // Fallback to a few basic items if the fetch fails
        const baseUrl =
          "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.4/assets/minecraft/textures/item/"
        const fallbackItems = [
          "diamond.png",
          "iron_ingot.png",
          "gold_ingot.png",
          "emerald.png",
          "apple.png",
          "bread.png",
          "diamond_sword.png",
          "bow.png",
        ].map((itemPath) => ({
          name: itemPath.replace(".png", "").replace(/_/g, " "),
          path: itemPath,
          url: `${baseUrl}${itemPath}`,
        }))

        setItems(fallbackItems)
        setFilteredItems(fallbackItems)
      }
    }

    fetchItems()
  }, [])

  useEffect(() => {
    if (searchQuery) {
      const filtered = items.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
      setFilteredItems(filtered)
    } else {
      setFilteredItems(items)
    }
  }, [searchQuery, items])

  return (
    <>
      <div className="p-4 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search items..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 h-[400px] overflow-y-auto">
        <div className="p-4">
          {loading ? (
            <div className="grid grid-cols-4 gap-2">
              {[...Array(16)].map((_, i) => (
                <Skeleton key={i} className="w-16 h-16 bg-gray-800" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-400">{error}</div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <button
                    key={item.path}
                    className="w-16 h-16 bg-gray-800 rounded border border-gray-700 hover:border-primary transition-colors p-1 flex items-center justify-center"
                    onClick={() => onSelectItem(item)}
                    title={item.name}
                  >
                    <div className="relative w-12 h-12">
                      <Image
                        src={item.url || "/placeholder.svg"}
                        alt={item.name}
                        width={48}
                        height={48}
                        className="pixelated object-contain"
                        onError={(e) => {
                          // Fallback for images that fail to load
                          e.currentTarget.src = "/placeholder.svg"
                        }}
                      />
                    </div>
                  </button>
                ))
              ) : (
                <div className="col-span-4 text-center py-8 text-gray-400">No items found matching "{searchQuery}"</div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-gray-800 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </>
  )
}

