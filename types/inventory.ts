export interface SlotPosition {
  x: number
  y: number
  width: number
  height: number
}

export interface Item {
  id: string
  name: string
  imageUrl: string
}

export interface InventorySlot {
  position: SlotPosition
  item?: Item
}

export interface DetectionSettings {
  threshold: number
  minSlotSize: number
} 