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
  onRemoveItem: (position: number) => void
  onClear: () => void
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
  onRemoveItem,
  onClear,
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
              style={{
                position: 'absolute',
                left: `${slot.x}px`,
                top: `${slot.y}px`,
              }}
            >
              <ItemSlot
                position={index}
                item={items.find((item) => item.position === index)}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={onSlotClick}
                onDragStart={onDragStart}
                onRemoveItem={onRemoveItem}
                width={slot.width}
                height={slot.height}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="destructive" size="sm" onClick={onClear}>
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Grid
        </Button>

        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Download className="w-4 h-4 mr-2" />
          Save Image
        </Button>
      </div>

      <div className="text-gray-400 text-center mt-4 text-sm">
        <p>Click on any slot to add or change an item</p>
        <p className="mt-1">Drag items between slots to move them</p>
        <p className="mt-1">Right-click to remove an item</p>
      </div>
    </div>
  )
} 