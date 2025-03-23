import Image from "next/image"

interface ItemSlotProps {
  position: number
  item?: { id: string; image: string; position: number | null }
  onDrop: (position: number) => void
  onDragOver: (e: React.DragEvent) => void
  onClick: (position: number) => void
  onDragStart: (id: string) => void
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
  width,
  height,
}: ItemSlotProps) {
  // アイテムのサイズをスロットの80%に設定
  const itemSize = Math.floor(Math.min(width, height) * 0.8)
  const padding = Math.floor((Math.min(width, height) - itemSize) / 2)

  return (
    <div
      className="absolute bg-gray-800 bg-opacity-50 border border-gray-700 rounded cursor-pointer hover:bg-opacity-70 transition-colors"
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
      onClick={() => onClick(position)}
      onDrop={(e) => {
        e.preventDefault()
        onDrop(position)
      }}
      onDragOver={onDragOver}
    >
      {item && (
        <div
          className="absolute"
          style={{
            top: `${padding}px`,
            left: `${padding}px`,
            width: `${itemSize}px`,
            height: `${itemSize}px`,
          }}
          draggable
          onDragStart={() => onDragStart(item.id)}
        >
          <Image
            src={item.image}
            alt="Item"
            width={itemSize}
            height={itemSize}
            className="pixelated"
            draggable={false}
          />
        </div>
      )}
    </div>
  )
} 