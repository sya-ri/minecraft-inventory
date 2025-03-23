"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { Download, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import ItemSlot from "@/components/item-slot"
import ItemSelector from "@/components/item-selector"

// Base crafting grid image
const CRAFTING_GRID_IMAGE = "/crafting-grid.png"

interface SlotPosition {
  x: number
  y: number
  width: number
  height: number
}

// HTMLImageElementを使用するためのヘルパー関数
const createImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = (error: string | Event) => reject(new Error('Failed to load image'))
    img.src = src
  })
}

export default function InventoryEditor() {
  const [items, setItems] = useState<Array<{ id: string; image: string; position: number | null }>>([])
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridFileInputRef = useRef<HTMLInputElement>(null)
  const [gridImage, setGridImage] = useState<string>(CRAFTING_GRID_IMAGE)
  const [slotPositions, setSlotPositions] = useState<SlotPosition[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Modified to handle selecting an item for a specific slot
  const handleSelectMinecraftItem = (item: { name: string; path: string; url: string }) => {
    const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    if (editingSlot !== null) {
      // Remove any existing item in this slot
      setItems(prevItems => prevItems.filter(item => item.position !== editingSlot))

      // Add the new item directly to the slot
      const newItem = {
        id,
        image: item.url,
        position: editingSlot,
      }

      setItems(prevItems => [...prevItems, newItem])

      // Add to recent items
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
        // Remove any existing item in this slot
        setItems(prevItems => prevItems.filter(item => item.position !== editingSlot))

        // Add the new item directly to the slot
        const newItem = {
          id,
          image: imageUrl,
          position: editingSlot,
        }

        setItems(prevItems => [...prevItems, newItem])

        // Add to recent items
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

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }

      setShowUploadDialog(false)
    }
  }

  const detectSlots = async (imageUrl: string, threshold: number, minSlotSize: number) => {
    return new Promise<SlotPosition[]>((resolve) => {
      createImage(imageUrl).then(img => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve([])

        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        // スロットの色の定義（RGB）
        const targetR = 128
        const targetG = 128
        const targetB = 128
        const colorThreshold = threshold // 色の許容範囲
        const scanStep = 5 // スキャン間隔

        // 色が目的の色と一致するかチェック
        const isTargetColor = (x: number, y: number): boolean => {
          if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false
          const i = (y * canvas.width + x) * 4
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const colorDiff = Math.sqrt(
            Math.pow(r - targetR, 2) +
            Math.pow(g - targetG, 2) +
            Math.pow(b - targetB, 2)
          )
          return colorDiff <= colorThreshold
        }

        // 指定された領域が同じ色で構成されているかチェック
        const isUniformColor = (x: number, y: number, size: number): boolean => {
          const centerColor = {
            r: data[(y * canvas.width + x) * 4],
            g: data[(y * canvas.width + x) * 4 + 1],
            b: data[(y * canvas.width + x) * 4 + 2]
          }

          for (let cy = y; cy < y + size; cy++) {
            for (let cx = x; cx < x + size; cx++) {
              if (cx >= canvas.width || cy >= canvas.height) return false
              
              const i = (cy * canvas.width + cx) * 4
              const r = data[i]
              const g = data[i + 1]
              const b = data[i + 2]
              
              const colorDiff = Math.sqrt(
                Math.pow(r - centerColor.r, 2) +
                Math.pow(g - centerColor.g, 2) +
                Math.pow(b - centerColor.b, 2)
              )
              
              if (colorDiff > threshold * 0.5) return false
            }
          }
          return true
        }

        // スロットの境界を探索（正方形のみ）
        const findSquareSlot = (startX: number, startY: number): SlotPosition | null => {
          if (!isTargetColor(startX, startY)) return null

          let size = minSlotSize
          let maxSize = Math.min(canvas.width - startX, canvas.height - startY)
          let validSize = null

          // 正方形のサイズを徐々に大きくしていく
          while (size <= maxSize) {
            // 内部が均一な色かチェック
            if (isUniformColor(startX, startY, size)) {
              // ボーダーをチェック（上下左右の線）
              let hasBorder = false
              
              // 上端
              if (startY > 0) {
                const topBorderY = startY - 1
                hasBorder = !isTargetColor(startX, topBorderY)
              }
              
              // 下端
              if (startY + size < canvas.height) {
                hasBorder = hasBorder || !isTargetColor(startX, startY + size)
              }
              
              // 左端
              if (startX > 0) {
                const leftBorderX = startX - 1
                hasBorder = hasBorder || !isTargetColor(leftBorderX, startY)
              }
              
              // 右端
              if (startX + size < canvas.width) {
                hasBorder = hasBorder || !isTargetColor(startX + size, startY)
              }

              if (hasBorder) {
                validSize = size
              }
            } else {
              break
            }
            size++
          }

          if (validSize) {
            return {
              x: startX,
              y: startY,
              width: validSize,
              height: validSize
            }
          }

          return null
        }

        // スロット候補を検出
        const candidates: SlotPosition[] = []
        for (let y = 0; y < canvas.height - minSlotSize; y += scanStep) {
          for (let x = 0; x < canvas.width - minSlotSize; x += scanStep) {
            // 既存のスロットと重複していないかチェック
            const isOverlapping = candidates.some(slot => {
              return x >= slot.x - 5 && x <= slot.x + slot.width + 5 &&
                     y >= slot.y - 5 && y <= slot.y + slot.height + 5
            })

            if (!isOverlapping) {
              const slot = findSquareSlot(x, y)
              if (slot) {
                candidates.push(slot)
              }
            }
          }
        }

        if (candidates.length === 0) {
          resolve([])
          return
        }

        // スロットの平均サイズを計算
        const avgSize = candidates.reduce((sum, slot) => sum + slot.width, 0) / candidates.length

        // スロットをグループ化（行ごとに整理）
        const groupSlotsByRow = (slots: SlotPosition[]): SlotPosition[][] => {
          const rows: SlotPosition[][] = []
          const rowThreshold = avgSize * 0.5

          slots.forEach(slot => {
            let addedToRow = false
            for (const row of rows) {
              const rowY = row[0].y
              if (Math.abs(slot.y - rowY) < rowThreshold) {
                row.push(slot)
                addedToRow = true
                break
              }
            }
            if (!addedToRow) {
              rows.push([slot])
            }
          })

          // 各行内でx座標でソート
          return rows.map(row => row.sort((a, b) => a.x - b.x))
        }

        // スロットを行ごとにグループ化
        const rows = groupSlotsByRow(candidates)

        // 各行内のスロットの間隔を均一化
        const normalizedSlots = rows.flatMap(row => {
          if (row.length <= 1) return row

          return row.map(slot => ({
            x: slot.x,
            y: slot.y,
            width: avgSize,
            height: avgSize
          }))
        })

        // 最終的なソート（上から下、左から右）
        const sortedSlots = normalizedSlots.sort((a, b) => {
          if (Math.abs(a.y - b.y) < avgSize * 0.5) {
            return a.x - b.x
          }
          return a.y - b.y
        })

        resolve(sortedSlots)
      }).catch(() => resolve([]))
    })
  }

  const updateImageSize = async (imageUrl: string) => {
    const img = await createImage(imageUrl)
    setImageSize({ width: img.width, height: img.height })
    return { width: img.width, height: img.height }
  }

  const handleGridImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const imageUrl = URL.createObjectURL(file)
      setTempGridImage(imageUrl)
      
      // Update image size
      const size = await updateImageSize(imageUrl)
      
      // Show slot detection settings and preview
      const slots = await detectSlots(imageUrl, threshold, minSlotSize)
      setPreviewSlots(slots)
      setShowSlotDetectionSettings(true)

      // Reset file input
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

  useEffect(() => {
    // 初期画像のサイズを設定
    updateImageSize(gridImage)
  }, [])

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

      // キャンバスサイズを実際の画像サイズに設定
      canvas.width = imageSize.width
      canvas.height = imageSize.height

      try {
        // Draw the base crafting grid
        const baseImage = await createImage(gridImage)
        ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height)

        // Draw each item in its position
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
        <div className="relative mx-auto" style={{ maxWidth: '100%', width: 'fit-content' }}>
          <Image
            src={gridImage || "/placeholder.svg"}
            alt="Minecraft Crafting Grid"
            width={imageSize.width}
            height={imageSize.height}
            className="pixelated"
            priority
          />

          {/* Grid Slots */}
          <div className="absolute top-0 left-0 w-full h-full">
            {slotPositions.map((slot, index) => (
              <div
                key={index}
                className="absolute"
                style={{
                  left: `${(slot.x / imageSize.width) * 100}%`,
                  top: `${(slot.y / imageSize.height) * 100}%`,
                  width: `${(slot.width / imageSize.width) * 100}%`,
                  height: `${(slot.height / imageSize.height) * 100}%`,
                }}
              >
                <ItemSlot
                  position={index}
                  item={items.find((item) => item.position === index)}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={handleSlotClick}
                  onDragStart={handleDragStart}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <div className="flex gap-2">
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => gridFileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Change Grid
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload custom inventory grid image</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

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
              recentItems={recentItems}
            />
          </div>
        </div>
      )}

      {/* Slot Detection Settings Modal */}
      {showSlotDetectionSettings && tempGridImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-xl font-bold text-white">Adjust Slot Detection</h2>
            </div>

            <div className="p-4 flex flex-col gap-4">
              <div className="relative mx-auto" style={{ maxWidth: '100%', width: 'fit-content' }}>
                <Image
                  src={tempGridImage}
                  alt="Grid Preview"
                  width={imageSize.width}
                  height={imageSize.height}
                  className="pixelated"
                />
                
                {/* Preview Slots */}
                <div className="absolute top-0 left-0 w-full h-full">
                  {previewSlots.map((slot, index) => (
                    <div
                      key={index}
                      className="absolute border-2 border-blue-500"
                      style={{
                        left: `${(slot.x / imageSize.width) * 100}%`,
                        top: `${(slot.y / imageSize.height) * 100}%`,
                        width: `${(slot.width / imageSize.width) * 100}%`,
                        height: `${(slot.height / imageSize.height) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Color Tolerance ({threshold})</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={threshold}
                    onChange={async (e) => {
                      const newThreshold = parseInt(e.target.value)
                      setThreshold(newThreshold)
                      if (tempGridImage) {
                        const slots = await detectSlots(tempGridImage, newThreshold, minSlotSize)
                        setPreviewSlots(slots)
                      }
                    }}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400">Minimum Slot Size ({minSlotSize}px)</label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    value={minSlotSize}
                    onChange={async (e) => {
                      const newSize = parseInt(e.target.value)
                      setMinSlotSize(newSize)
                      if (tempGridImage) {
                        const slots = await detectSlots(tempGridImage, threshold, newSize)
                        setPreviewSlots(slots)
                      }
                    }}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSlotDetectionSettings(false)
                    setTempGridImage(null)
                    setPreviewSlots([])
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleApplySlotDetection}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

