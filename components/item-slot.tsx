"use client"

import type React from "react"

import { cn } from "@/lib/utils"
import Image from "next/image"

interface ItemSlotProps {
  position: number
  item?: { id: string; image: string; position: number | null }
  onDrop: (position: number) => void
  onDragOver: (e: React.DragEvent) => void
  onClick: (position: number) => void
  onDragStart?: (id: string) => void
}

export default function ItemSlot({ position, item, onDrop, onDragOver, onClick, onDragStart }: ItemSlotProps) {
  return (
    <div
      className={cn(
        "w-10 h-10 bg-gray-500/50 border border-gray-300 flex items-center justify-center",
        "transition-all duration-100 cursor-pointer hover:bg-gray-400/30",
      )}
      onClick={() => onClick(position)}
      onDrop={() => onDrop(position)}
      onDragOver={onDragOver}
    >
      {item && (
        <div
          className="w-full h-full flex items-center justify-center"
          draggable={!!onDragStart}
          onDragStart={() => onDragStart && onDragStart(item.id)}
        >
          <Image
            src={item.image || "/placeholder.svg"}
            alt="Item"
            width={32}
            height={32}
            className="pixelated object-contain"
            draggable={false}
          />
        </div>
      )}
    </div>
  )
}

