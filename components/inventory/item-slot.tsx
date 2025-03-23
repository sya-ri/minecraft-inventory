import Image from "next/image"

interface ItemSlotProps {
  position: number
  item?: { id: string; image: string; position: number | null }
  onDrop: (position: number) => void
  onDragOver: (e: React.DragEvent) => void
  onClick: (position: number) => void
  onDragStart: (id: string) => void
}

export function ItemSlot({
  position,
  item,
  onDrop,
  onDragOver,
  onClick,
  onDragStart,
}: ItemSlotProps) {
  return (
    <div
      className="w-full h-full bg-gray-800 bg-opacity-50 border border-gray-700 rounded cursor-pointer hover:bg-opacity-70 transition-colors"
      onClick={() => onClick(position)}
      onDrop={(e) => {
        e.preventDefault()
        onDrop(position)
      }}
      onDragOver={onDragOver}
    >
      {item && (
        <div
          className="w-full h-full relative"
          draggable
          onDragStart={() => onDragStart(item.id)}
        >
          <Image
            src={item.image}
            alt="Item"
            fill
            className="object-contain p-1 pixelated"
            draggable={false}
          />
        </div>
      )}
    </div>
  )
} 