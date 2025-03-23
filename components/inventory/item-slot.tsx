import Image from "next/image"

interface ItemSlotProps {
  position: number
  item?: { id: string; image: string } | null
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
  onRemoveItem,
  width,
  height,
}: ItemSlotProps) {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (item && onRemoveItem) {
      onRemoveItem(position)
    }
  }

  return (
    <div
      className="relative"
      style={{ width: `${width}px`, height: `${height}px` }}
      onDrop={() => onDrop(position)}
      onDragOver={onDragOver}
      onClick={() => onClick(position)}
      onContextMenu={handleContextMenu}
    >
      {item ? (
        <div
          className="w-full h-full"
          draggable
          onDragStart={() => onDragStart(item.id)}
        >
          <div className="relative w-full h-full p-[20%]">
            <Image
              src={item.image}
              alt="Item"
              fill
              className="object-contain pixelated"
            />
          </div>
        </div>
      ) : (
        <div className="w-full h-full bg-black bg-opacity-20" />
      )}
    </div>
  )
} 