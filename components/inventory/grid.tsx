import Image from "next/image"
import { ItemSlot } from "./item-slot"
import type { SlotPosition } from "@/types/inventory"
import { Button } from "@/components/ui/button"
import { Trash2, Upload, Download } from "lucide-react"

interface InventoryGridProps {
  gridImage: string
  imageSize: { width: number; height: number }
  slotPositions: SlotPosition[]
  items: Array<{ id: string; image: string; position: number | null }>
  onDrop: (position: number) => void
  onDragOver: (e: React.DragEvent) => void
  onSlotClick: (position: number) => void
  onDragStart: (id: string) => void
  onClear: () => void
  onChangeGrid: () => void
  onDownload: () => void
}

export function InventoryGrid({
  gridImage,
  imageSize,
  slotPositions,
  items,
  onDrop,
  onDragOver,
  onSlotClick,
  onDragStart,
  onClear,
  onChangeGrid,
  onDownload,
}: InventoryGridProps) {
  return (
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
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={onSlotClick}
                onDragStart={onDragStart}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={onClear}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Grid
          </Button>

          <Button variant="outline" size="sm" onClick={onChangeGrid}>
            <Upload className="w-4 h-4 mr-2" />
            Change Grid
          </Button>
        </div>

        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Download className="w-4 h-4 mr-2" />
          Save Image
        </Button>
      </div>

      <div className="text-gray-400 text-center mt-4 text-sm">
        <p>Click on any slot to add or change an item</p>
        <p className="mt-1">Drag items between slots to move them</p>
      </div>
    </div>
  )
} 