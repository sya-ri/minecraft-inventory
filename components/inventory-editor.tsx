"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { InventoryGrid } from "@/components/inventory/grid"
import { ItemSelectorModal } from "@/components/inventory/item-selector-modal"
import { SlotDetectionSettings } from "@/components/inventory/slot-detection-settings"
import { detectSlots, createImage } from "@/lib/slot-detection"
import type { SlotPosition } from "@/types/inventory"
import { GuiSelectorModal } from "@/components/inventory/gui-selector-modal"
import { Upload } from "lucide-react"

// Base crafting grid image
const DEFAULT_GUI_IMAGES = [
  { name: "Crafting Table", path: "/gui/crafting_table.png", minSlotSize: 30 },
  { name: "Furnace", path: "/gui/furnace.png", minSlotSize: 30 },
  { name: "Brewing Stand", path: "/gui/brewing_stand.png", minSlotSize: 30 },
  { name: "Grindstone", path: "/gui/grindstone.png", minSlotSize: 30 },
  { name: "Chest (1x9)", path: "/gui/generic_1x9.png", minSlotSize: 30 },
  { name: "Chest (2x9)", path: "/gui/generic_2x9.png", minSlotSize: 30 },
  { name: "Chest (3x9)", path: "/gui/generic_3x9.png", minSlotSize: 30 },
  { name: "Chest (4x9)", path: "/gui/generic_4x9.png", minSlotSize: 30 },
  { name: "Chest (5x9)", path: "/gui/generic_5x9.png", minSlotSize: 30 },
  { name: "Chest (6x9)", path: "/gui/generic_6x9.png", minSlotSize: 30 },
  { name: "Chest (7x9)", path: "/gui/generic_7x9.png", minSlotSize: 30 },
  { name: "Chest (8x9)", path: "/gui/generic_8x9.png", minSlotSize: 30 },
  { name: "Chest (9x9)", path: "/gui/generic_9x9.png", minSlotSize: 30 },
  { name: "Inventory (3x3)", path: "/gui/generic_3x3.png", minSlotSize: 30 },
]

export default function InventoryEditor() {
  const [items, setItems] = useState<Array<{ id: string; image: string; position: number | null }>>([])
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridFileInputRef = useRef<HTMLInputElement>(null)
  const [selectedGui, setSelectedGui] = useState(DEFAULT_GUI_IMAGES[0])
  const [gridImage, setGridImage] = useState<string>(selectedGui.path)
  const [slotPositions, setSlotPositions] = useState<SlotPosition[]>([])

  // Add state for recent items
  const [recentItems, setRecentItems] = useState<Array<{ name: string; path: string; url: string; isCustom?: boolean }>>([])

  // Add state to track which slot is being edited
  const [editingSlot, setEditingSlot] = useState<number | null>(null)

  // Add a new state for showing the item selector
  const [showItemSelector, setShowItemSelector] = useState(false)

  // Add state for slot detection settings
  const [showSlotDetectionSettings, setShowSlotDetectionSettings] = useState(false)
  const [minSlotSize, setMinSlotSize] = useState(selectedGui.minSlotSize)
  const [tempGridImage, setTempGridImage] = useState<string | null>(null)
  const [previewSlots, setPreviewSlots] = useState<SlotPosition[]>([])

  // Add state for image size
  const [imageSize, setImageSize] = useState({ width: 512, height: 264 })

  // Add state for GUI selector
  const [showGuiSelector, setShowGuiSelector] = useState(false)

  useEffect(() => {
    // Initialize slots with default GUI settings
    const initializeSlots = async () => {
      const slots = await detectSlots(selectedGui.path, selectedGui.minSlotSize)
      setSlotPositions(slots)
    }
    initializeSlots()
  }, [])

  useEffect(() => {
    updateImageSize(gridImage)
  }, [])

  const handleSelectMinecraftItem = (item: { name: string; path: string; url: string }) => {
    const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    if (editingSlot !== null) {
      setItems(prevItems => {
        const newItems = prevItems.filter(item => item.position !== editingSlot)
        return [...newItems, {
          id,
          image: item.url,
          position: editingSlot,
        }]
      })

      setRecentItems(prevItems => {
        const existingIndex = prevItems.findIndex(i => i.url === item.url)
        if (existingIndex !== -1) {
          const newItems = [...prevItems]
          newItems.splice(existingIndex, 1)
          return [item, ...newItems]
        }
        return [item, ...prevItems]
      })
    }

    setShowItemSelector(false)
    setEditingSlot(null)
  }

  const handleItemUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const imageUrl = URL.createObjectURL(file)

      if (editingSlot !== null) {
        setItems(prevItems => {
          const newItems = prevItems.filter(item => item.position !== editingSlot)
          return [...newItems, {
            id,
            image: imageUrl,
            position: editingSlot,
          }]
        })

        const customItem = {
          name: file.name.replace(/\.[^/.]+$/, ""),
          path: file.name,
          url: imageUrl,
          isCustom: true
        }
        setRecentItems(prevItems => {
          const existingIndex = prevItems.findIndex(i => i.url === imageUrl)
          if (existingIndex !== -1) {
            const newItems = [...prevItems]
            newItems.splice(existingIndex, 1)
            return [customItem, ...newItems]
          }
          return [customItem, ...prevItems]
        })

        setEditingSlot(null)
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleGridImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const imageUrl = URL.createObjectURL(file)
      setTempGridImage(imageUrl)

      await updateImageSize(imageUrl)
      const slots = await detectSlots(imageUrl, minSlotSize)
      setPreviewSlots(slots)
      setShowSlotDetectionSettings(true)

      if (gridFileInputRef.current) {
        gridFileInputRef.current.value = ""
      }
    }
  }

  const handleApplySlotDetection = async () => {
    if (tempGridImage) {
      setGridImage(tempGridImage)
      setSelectedGui({
        name: "Custom GUI",
        path: tempGridImage,
        minSlotSize: minSlotSize
      })
      const slots = await detectSlots(tempGridImage, minSlotSize)
      setSlotPositions(slots)
      setShowSlotDetectionSettings(false)
      setTempGridImage(null)
      setPreviewSlots([])
    }
  }

  const handleSlotClick = (position: number) => {
    setEditingSlot(position)
    setShowItemSelector(true)
  }

  const handleDragStart = (id: string) => {
    setDraggedItem(id)
  }

  const handleRemoveItem = (position: number) => {
    setItems(prevItems => prevItems.filter(item => item.position !== position))
  }

  const handleDrop = (position: number) => {
    if (draggedItem) {
      const draggedItemObj = items.find((item) => item.id === draggedItem)
      if (!draggedItemObj) return

      const existingItem = items.find((item) => item.position === position)

      setItems(items.map((item) => {
        if (item.id === draggedItem) {
          return { ...item, position }
        }
        if (existingItem && item.id === existingItem.id) {
          return { ...item, position: draggedItemObj.position }
        }
        return item
      }))

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

      canvas.width = imageSize.width
      canvas.height = imageSize.height

      // ピクセルアートをクリアに保つ
      ctx.imageSmoothingEnabled = false

      try {
        const baseImage = await createImage(gridImage)
        ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height)

        for (const item of items) {
          if (item.position !== null && slotPositions[item.position]) {
            const itemImage = await createImage(item.image)
            const slot = slotPositions[item.position]
            
            // アイテムのサイズをスロットの80%に設定
            const itemSize = Math.floor(Math.min(slot.width, slot.height) * 0.8)
            const padding = Math.floor((Math.min(slot.width, slot.height) - itemSize) / 2)
            
            ctx.drawImage(
              itemImage,
              slot.x + padding,
              slot.y + padding,
              itemSize,
              itemSize
            )
          }
        }
      } catch (error) {
        console.error("Error loading images:", error)
        throw error
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = "minecraft-crafting.png"
          a.click()
          URL.revokeObjectURL(url)
        }
      }, 'image/png')
    } catch (error) {
      console.error("Error generating image:", error)
    }
  }

  const updateImageSize = async (imageUrl: string) => {
    const img = await createImage(imageUrl)
    setImageSize({ width: img.width, height: img.height })
  }

  const handleSelectGui = async (gui: typeof DEFAULT_GUI_IMAGES[0]) => {
    setSelectedGui(gui)
    setGridImage(gui.path)
    setMinSlotSize(gui.minSlotSize)
    await updateImageSize(gui.path)
    const slots = await detectSlots(gui.path, gui.minSlotSize)
    setSlotPositions(slots)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* GUI List Sidebar - Desktop Only */}
      <div className="hidden lg:block bg-gray-900 rounded-lg p-4 w-64 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-200">Select GUI</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => gridFileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
        </div>
        <div className="overflow-y-auto h-[600px] -mx-4 px-4">
          <div className="space-y-2">
            {DEFAULT_GUI_IMAGES.map((gui) => (
              <button
                key={gui.path}
                className={`w-full p-2 rounded transition-colors flex flex-col items-center ${
                  gridImage === gui.path ? 'bg-gray-700' : 'hover:bg-gray-800'
                }`}
                onClick={() => handleSelectGui(gui)}
              >
                <div className="relative w-full aspect-video mb-1">
                  <Image
                    src={gui.path}
                    alt={gui.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <p className="text-sm text-center text-gray-200">{gui.name}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="bg-gray-900 rounded-lg p-4 w-full lg:w-[600px] flex flex-col items-center">
        <div className="flex flex-wrap justify-between items-center w-full mb-4 gap-2">
          <h1 className="text-2xl font-bold text-gray-200">Minecraft Inventory Editor</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadImage}
            >
              Download
            </Button>
            {/* Mobile GUI Selector Button */}
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setShowGuiSelector(true)}
            >
              Select GUI
            </Button>
          </div>
        </div>
        <div className="text-gray-400 text-center mb-4 text-sm space-y-1">
          <p>Click on any slot to add or change an item</p>
          <p>Drag items between slots to move them</p>
          <p>Right-click to remove an item</p>
        </div>
        <div className="relative w-full aspect-[512/264] rounded-lg overflow-hidden">
          <Image
            src={selectedGui.path}
            alt="Inventory Grid"
            fill
            className="object-contain"
            priority
          />
          <InventoryGrid
            slotPositions={slotPositions}
            items={items}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onSlotClick={handleSlotClick}
            onRemoveItem={handleRemoveItem}
            imageSize={imageSize}
          />
        </div>
        <div className="mt-4 text-center text-gray-400 text-sm">
          <a
            href="https://github.com/sya-ri/minecraft-inventory"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
          >
            © 2025 sya-ri
          </a>
        </div>
      </div>

      {/* Recent Items Sidebar */}
      <div className="hidden lg:block bg-gray-900 rounded-lg p-4 w-64">
        <h2 className="text-lg font-bold mb-4 text-gray-200">Recent Items</h2>
        <div className="overflow-y-auto h-[600px]">
          <div className="grid grid-cols-3 gap-2">
            {recentItems.map((item, index) => (
              <button
                key={`${item.path}-${index}`}
                className="relative aspect-square bg-gray-800 rounded-lg p-0.5 sm:p-1 hover:bg-gray-700 transition-colors"
              >
                <Image
                  src={item.url || item.path}
                  alt={item.name}
                  fill
                  className="object-contain p-0.5 !duration-0"
                  style={{ imageRendering: 'pixelated' }}
                  onDragStart={(e) => {
                    const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    setItems(prevItems => [...prevItems, {
                      id,
                      image: item.url || item.path,
                      position: null
                    }])
                    handleDragStart(id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  sizes="(max-width: 640px) 4vw, (max-width: 768px) 12vw, 48px"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleItemUpload}
      />
      <input
        type="file"
        ref={gridFileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleGridImageUpload}
      />

      {/* GUI Selector Modal - Mobile Only */}
      <GuiSelectorModal
        isOpen={showGuiSelector}
        onClose={() => setShowGuiSelector(false)}
        guis={DEFAULT_GUI_IMAGES}
        selectedGui={selectedGui}
        onSelectGui={handleSelectGui}
        onUpload={() => {
          setShowGuiSelector(false)
          gridFileInputRef.current?.click()
        }}
      />

      {/* Item Selector Modal */}
      {showItemSelector && (
        <ItemSelectorModal
          onSelectItem={handleSelectMinecraftItem}
          onClose={() => {
            setShowItemSelector(false)
            setEditingSlot(null)
          }}
          onUpload={() => {
            setShowItemSelector(false)
            setTimeout(() => {
              fileInputRef.current?.click()
            }, 100)
          }}
          recentItems={recentItems}
        />
      )}

      {/* Slot Detection Settings Modal */}
      {showSlotDetectionSettings && tempGridImage && (
        <SlotDetectionSettings
          tempGridImage={tempGridImage}
          imageSize={imageSize}
          previewSlots={previewSlots}
          minSlotSize={minSlotSize}
          onMinSlotSizeChange={async (value) => {
            setMinSlotSize(value)
            if (tempGridImage) {
              const slots = await detectSlots(tempGridImage, value)
              setPreviewSlots(slots)
            }
          }}
          onCancel={() => {
            setShowSlotDetectionSettings(false)
            setTempGridImage(null)
            setPreviewSlots([])
          }}
          onApply={handleApplySlotDetection}
        />
      )}
    </div>
  )
}

