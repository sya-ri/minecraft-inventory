import Image from "next/image"
import React from "react";
import {PlacedMinecraftItem} from "@/types/inventory";

interface ItemSlotProps {
  position: number
  item?: PlacedMinecraftItem | null
  onDrop: (position: number) => void
  onDragOver: (e: React.DragEvent) => void
  onClick: (position: number) => void
  onDragStart: (id: string) => void
  onRemoveItem?: (position: number) => void
  width: number
  height: number
}

export function ItemSlot({
  position,
  item,
  onDrop,
  onDragOver,
  onClick,
  onDragStart,
  onRemoveItem
}: ItemSlotProps) {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (item && onRemoveItem) {
      onRemoveItem(position)
    }
  }

  return (
    <div
      className="relative w-full h-full"
      onDrop={(e) => {
        e.preventDefault()
        onDrop(position)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(e)
      }}
      onClick={() => onClick(position)}
      onContextMenu={handleContextMenu}
    >
      {item ? (
        <div
          className="w-full h-full"
          draggable
          onDragStart={(e) => {
            onDragStart(item.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
        >
          <div className="relative w-full h-full p-[20%]">
            <Image
              src={item.url}
              alt="Item"
              fill
              className="object-contain pixelated"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        </div>
      ) : (
        <div className="w-full h-full bg-black/20" />
      )}
    </div>
  )
} 