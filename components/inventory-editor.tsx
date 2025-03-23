"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { Download, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import ItemSlot from "@/components/item-slot"
import { InventoryGrid } from "@/components/inventory/grid"
import { ItemSelectorModal } from "@/components/inventory/item-selector-modal"
import { SlotDetectionSettings } from "@/components/inventory/slot-detection-settings"
import { detectSlots, createImage } from "@/lib/slot-detection"
import type { SlotPosition } from "@/types/inventory"

// Base crafting grid image
const CRAFTING_GRID_IMAGE = "/crafting-grid.png"

export default function InventoryEditor() {
  const [items, setItems] = useState<Array<{ id: string; image: string; position: number | null }>>([])
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridFileInputRef = useRef<HTMLInputElement>(null)
  const [gridImage, setGridImage] = useState<string>(CRAFTING_GRID_IMAGE)
  const [slotPositions, setSlotPositions] = useState<SlotPosition[]>([])

  // Add state for recent items
  const [recentItems, setRecentItems] = useState<Array<{ name: string; path: string; url: string; isCustom?: boolean }>>([])
  const MAX_RECENT_ITEMS = 8

  // Add state to track which slot is being edited
  const [editingSlot, setEditingSlot] = useState<number | null>(null)

  // Add a new state for showing the item selector
  const [showItemSelector, setShowItemSelector] = useState(false)

  // Add state for showing upload dialog
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  // Add state for slot detection settings
  const [showSlotDetectionSettings, setShowSlotDetectionSettings] = useState(false)
  const [threshold, setThreshold] = useState(100)
  const [minSlotSize, setMinSlotSize] = useState(20)
  const [tempGridImage, setTempGridImage] = useState<string | null>(null)
  const [previewSlots, setPreviewSlots] = useState<SlotPosition[]>([])

  // Add state for image size
  const [imageSize, setImageSize] = useState({ width: 400, height: 200 })

  // Add state for loading
  const [isLoading, setIsLoading] = useState(false)

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
        const newRecentItems = prevItems.filter(recentItem => recentItem.url !== item.url)
        return [item, ...newRecentItems].slice(0, MAX_RECENT_ITEMS)
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
          const newRecentItems = prevItems.filter(item => item.url !== imageUrl)
          return [customItem, ...newRecentItems].slice(0, MAX_RECENT_ITEMS)
        })

        setEditingSlot(null)
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }

      setShowUploadDialog(false)
    }
  }

  const handleGridImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const imageUrl = URL.createObjectURL(file)
      setTempGridImage(imageUrl)
      
      const size = await updateImageSize(imageUrl)
      const slots = await detectSlots(imageUrl, threshold, minSlotSize)
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
      const size = await updateImageSize(tempGridImage)
      const slots = await detectSlots(tempGridImage, threshold, minSlotSize)
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

      try {
        const baseImage = await createImage(gridImage)
        ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height)

        for (const item of items) {
          if (item.position !== null && slotPositions[item.position]) {
            const itemImage = await createImage(item.image)
            const slot = slotPositions[item.position]
            ctx.drawImage(itemImage, slot.x, slot.y, slot.width, slot.height)
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
      })
    } catch (error) {
      console.error("Error generating image:", error)
    }
  }

  const updateImageSize = async (imageUrl: string) => {
    const img = await createImage(imageUrl)
    setImageSize({ width: img.width, height: img.height })
    return { width: img.width, height: img.height }
  }

  useEffect(() => {
    updateImageSize(gridImage)
  }, [])

  return (
    <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl">
      <InventoryGrid
        gridImage={gridImage}
        imageSize={imageSize}
        slotPositions={slotPositions}
        items={items}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onSlotClick={handleSlotClick}
        onDragStart={handleDragStart}
        onClear={clearGrid}
        onChangeGrid={() => gridFileInputRef.current?.click()}
        onDownload={downloadImage}
      />

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
            setShowUploadDialog(true)
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
          threshold={threshold}
          minSlotSize={minSlotSize}
          onThresholdChange={async (value) => {
            setThreshold(value)
            if (tempGridImage) {
              const slots = await detectSlots(tempGridImage, value, minSlotSize)
              setPreviewSlots(slots)
            }
          }}
          onMinSlotSizeChange={async (value) => {
            setMinSlotSize(value)
            if (tempGridImage) {
              const slots = await detectSlots(tempGridImage, threshold, value)
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

