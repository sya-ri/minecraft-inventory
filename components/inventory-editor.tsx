"use client"

import type React from "react"

import { useState, useRef } from "react"
import Image from "next/image"
import { Download, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import ItemSlot from "@/components/item-slot"
import ItemSelector from "@/components/item-selector"

// Base crafting grid image
const CRAFTING_GRID_IMAGE = "/crafting-grid.png"

export default function InventoryEditor() {
  const [items, setItems] = useState<Array<{ id: string; image: string; position: number | null }>>([])
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add state to track which slot is being edited
  const [editingSlot, setEditingSlot] = useState<number | null>(null)

  // Add a new state for showing the item selector
  const [showItemSelector, setShowItemSelector] = useState(false)

  // Add state for showing upload dialog
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  // Modified to handle selecting an item for a specific slot
  const handleSelectMinecraftItem = (item: { name: string; path: string; url: string }) => {
    const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    if (editingSlot !== null) {
      // Remove any existing item in this slot
      setItems(items.filter((item) => item.position !== editingSlot))

      // Add the new item directly to the slot
      const newItem = {
        id,
        image: item.url,
        position: editingSlot,
      }

      setItems([...items, newItem])
    }

    setShowItemSelector(false)
    setEditingSlot(null)
  }

  const handleItemUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      if (editingSlot !== null) {
        // Remove any existing item in this slot
        setItems(items.filter((item) => item.position !== editingSlot))

        // Add the new item directly to the slot
        const newItem = {
          id,
          image: URL.createObjectURL(file),
          position: editingSlot,
        }

        setItems([...items, newItem])
        setEditingSlot(null)
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }

      setShowUploadDialog(false)
    }
  }

  // Handle clicking on a slot
  const handleSlotClick = (position: number) => {
    // Always set this slot as the one being edited and open the selector
    setEditingSlot(position)
    setShowItemSelector(true)
  }

  const handleDragStart = (id: string) => {
    setDraggedItem(id)
  }

  const handleDrop = (position: number) => {
    if (draggedItem) {
      // Get the item being dragged
      const draggedItemObj = items.find((item) => item.id === draggedItem)
      if (!draggedItemObj) return

      // Check if there's already an item in the target position
      const existingItem = items.find((item) => item.position === position)

      if (existingItem) {
        // Swap positions between the dragged item and the existing item
        setItems(
          items.map((item) => {
            if (item.id === draggedItem) {
              return { ...item, position }
            }
            if (item.id === existingItem.id) {
              return { ...item, position: draggedItemObj.position }
            }
            return item
          }),
        )
      } else {
        // Just move the dragged item to the new position
        setItems(
          items.map((item) => {
            if (item.id === draggedItem) {
              return { ...item, position }
            }
            return item
          }),
        )
      }

      setDraggedItem(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const clearGrid = () => {
    setItems([])
  }

  const downloadImage = async () => {
    try {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // Set canvas size to match the crafting grid
      canvas.width = 400
      canvas.height = 200

      // Draw the base crafting grid
      const gridImage = new Image()
      gridImage.crossOrigin = "anonymous"

      try {
        await new Promise((resolve, reject) => {
          gridImage.onload = () => resolve(null)
          gridImage.onerror = (err) => reject(err || new Error("Failed to load grid image"))
          gridImage.src = CRAFTING_GRID_IMAGE
        })

        ctx.drawImage(gridImage, 0, 0, canvas.width, canvas.height)

        // Draw each item in its position
        for (const item of items) {
          if (item.position !== null) {
            const itemImage = new Image()
            itemImage.crossOrigin = "anonymous"

            await new Promise((resolve, reject) => {
              itemImage.onload = () => resolve(null)
              itemImage.onerror = (err) => reject(err || new Error(`Failed to load item image: ${item.image}`))
              itemImage.src = item.image
            })

            // Calculate position based on grid layout
            let x,
              y,
              size = 40

            if (item.position < 9) {
              // Crafting grid (3x3)
              const col = item.position % 3
              const row = Math.floor(item.position / 3)
              x = 20 + col * 60
              y = 20 + row * 60
            } else {
              // Result slot
              x = 300
              y = 80
            }

            ctx.drawImage(itemImage, x, y, size, size)
          }
        }
      } catch (error) {
        console.error("Error loading images:", error)
        throw error
      }

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = "minecraft-crafting.png"
          a.click()
          URL.revokeObjectURL(url)
        }
      })
    } catch (error) {
      console.error("Error generating image:", error)
    }
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl">
      {/* Crafting Grid */}
      <div className="relative">
        <div className="relative w-[400px] h-[200px] mx-auto">
          <Image
            src={CRAFTING_GRID_IMAGE || "/placeholder.svg"}
            alt="Minecraft Crafting Grid"
            width={400}
            height={200}
            className="pixelated"
            priority
          />

          {/* Grid Slots */}
          <div className="absolute top-0 left-0 w-full h-full grid grid-cols-[repeat(5,1fr)] grid-rows-3 gap-2">
            {/* Crafting slots (3x3 grid) */}
            <div className="col-span-3 row-span-3 grid grid-cols-3 grid-rows-3 gap-[20px] p-[20px]">
              {[...Array(9)].map((_, index) => (
                <ItemSlot
                  key={`craft-${index}`}
                  position={index}
                  item={items.find((item) => item.position === index)}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={handleSlotClick}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>

            {/* Arrow space */}
            <div className="col-span-1 row-span-3"></div>

            {/* Result slot */}
            <div className="col-span-1 row-span-3 flex items-center justify-center">
              <ItemSlot
                position={9}
                item={items.find((item) => item.position === 9)}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={handleSlotClick}
                onDragStart={handleDragStart}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="sm" onClick={clearGrid}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Grid
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Remove all items from the grid</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="sm" onClick={downloadImage}>
                  <Download className="w-4 h-4 mr-2" />
                  Save Image
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download the crafting grid as an image</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-gray-400 text-center mt-4 text-sm">
          <p>Click on any slot to add or change an item</p>
          <p className="mt-1">Drag items between slots to move them</p>
        </div>
      </div>

      {/* Hidden file input for uploads */}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleItemUpload} />

      {/* Item Selector Modal */}
      {showItemSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-800">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Select Minecraft Item</h2>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowItemSelector(false)
                    setShowUploadDialog(true)
                    setTimeout(() => {
                      fileInputRef.current?.click()
                    }, 100)
                  }}
                >
                  Upload Custom Item
                </Button>
              </div>
            </div>

            <ItemSelector
              onSelectItem={handleSelectMinecraftItem}
              onClose={() => {
                setShowItemSelector(false)
                setEditingSlot(null)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

