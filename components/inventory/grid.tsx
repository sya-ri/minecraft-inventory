import { ItemSlot } from "./item-slot"
import type { SlotPosition } from "@/types/inventory"
import React, { useRef, useEffect, useState } from "react"

interface InventoryGridProps {
  slotPositions: SlotPosition[]
  items: Array<{
    id: string
    image: string
    position: number | null
  }>
  onDragStart: (id: string) => void
  onDrop: (position: number) => void
  onSlotClick: (position: number) => void
  onRemoveItem: (position: number) => void
  onDragOver: (e: React.DragEvent) => void
  imageSize: {
    width: number
    height: number
  }
}

export function InventoryGrid({
  slotPositions,
  items,
  onDragStart,
  onDrop,
  onSlotClick,
  onRemoveItem,
  onDragOver,
  imageSize,
}: InventoryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    const updateDisplaySize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const aspectRatio = imageSize.width / imageSize.height
        const containerWidth = rect.width
        const containerHeight = rect.height
        const containerAspectRatio = containerWidth / containerHeight

        let width, height
        if (containerAspectRatio > aspectRatio) {
          // コンテナが横長の場合
          height = containerHeight
          width = height * aspectRatio
        } else {
          // コンテナが縦長の場合
          width = containerWidth
          height = width / aspectRatio
        }

        // 画像のセンタリングによるオフセットを計算
        const offsetX = (containerWidth - width) / 2
        const offsetY = (containerHeight - height) / 2

        setDisplaySize({ width, height, offsetX, offsetY })
      }
    }

    updateDisplaySize()
    window.addEventListener('resize', updateDisplaySize)
    return () => window.removeEventListener('resize', updateDisplaySize)
  }, [imageSize.width, imageSize.height])

  return (
    <div ref={containerRef} className="absolute inset-0">
      {slotPositions.map((slot, index) => {
        const x = (slot.x / imageSize.width) * displaySize.width + displaySize.offsetX
        const y = (slot.y / imageSize.height) * displaySize.height + displaySize.offsetY
        const width = (slot.width / imageSize.width) * displaySize.width
        const height = (slot.height / imageSize.height) * displaySize.height

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
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
        )
      })}
    </div>
  )
} 