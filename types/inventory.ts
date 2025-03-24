export interface SlotPosition {
  x: number
  y: number
  width: number
  height: number
}

export interface MinecraftItem {
  name: string
  url: string
  isCustom?: boolean
}

export interface PlacedMinecraftItem extends MinecraftItem {
  id: string
  position: number | null
}
