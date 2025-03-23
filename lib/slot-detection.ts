import type { SlotPosition } from "@/types/inventory"

// HTMLImageElementを使用するためのヘルパー関数
export const createImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = (error: string | Event) => reject(new Error('Failed to load image'))
    img.src = src
  })
}

export const detectSlots = async (
  imageUrl: string,
  minSlotSize: number
): Promise<SlotPosition[]> => {
  const img = await createImage(imageUrl)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return []

  canvas.width = img.width
  canvas.height = img.height
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Target color definition (RGB) - Minecraft's slot color
  const targetR = 139
  const targetG = 139
  const targetB = 139
  const scanStep = 2

  // Check if color exactly matches target color
  const isTargetColor = (x: number, y: number): boolean => {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false
    const i = (y * canvas.width + x) * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    return r === targetR && g === targetG && b === targetB
  }

  // Check if area has uniform color
  const isUniformColor = (x: number, y: number, size: number): boolean => {
    const targetColor = {
      r: targetR,
      g: targetG,
      b: targetB
    }

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const px = x + dx
        const py = y + dy
        if (px >= canvas.width || py >= canvas.height) return false

        const i = (py * canvas.width + px) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        if (r !== targetColor.r || g !== targetColor.g || b !== targetColor.b) {
          return false
        }
      }
    }
    return true
  }

  // Find slot boundaries (square only)
  const findSquareSlot = (startX: number, startY: number): SlotPosition | null => {
    if (!isTargetColor(startX, startY)) return null

    let size = minSlotSize
    let maxSize = Math.min(canvas.width - startX, canvas.height - startY)
    let validSize = null

    while (size <= maxSize) {
      if (isUniformColor(startX, startY, size)) {
        let hasBorder = false
        
        // Check top border
        if (startY > 0) {
          hasBorder = !isTargetColor(startX, startY - 1)
        }
        
        // Check bottom border
        if (startY + size < canvas.height) {
          hasBorder = hasBorder || !isTargetColor(startX, startY + size)
        }
        
        // Check left border
        if (startX > 0) {
          hasBorder = hasBorder || !isTargetColor(startX - 1, startY)
        }
        
        // Check right border
        if (startX + size < canvas.width) {
          hasBorder = hasBorder || !isTargetColor(startX + size, startY)
        }

        if (hasBorder) {
          validSize = size
        }
      } else {
        break
      }
      size++
    }

    if (validSize) {
      return {
        x: startX,
        y: startY,
        width: validSize,
        height: validSize
      }
    }

    return null
  }

  // スロット候補を検出
  const candidates: SlotPosition[] = []
  for (let y = 0; y < canvas.height - minSlotSize; y += scanStep) {
    for (let x = 0; x < canvas.width - minSlotSize; x += scanStep) {
      // Check for overlap with existing slots
      const isOverlapping = candidates.some(slot => {
        return x >= slot.x - 2 && x <= slot.x + slot.width + 2 &&
               y >= slot.y - 2 && y <= slot.y + slot.height + 2
      })

      if (!isOverlapping) {
        const slot = findSquareSlot(x, y)
        if (slot) {
          candidates.push(slot)
        }
      }
    }
  }

  if (candidates.length === 0) {
    return []
  }

  // スロットの平均サイズを計算
  const avgSize = candidates.reduce((sum, slot) => sum + slot.width, 0) / candidates.length

  // スロットをグループ化（行ごとに整理）
  const groupSlotsByRow = (slots: SlotPosition[]): SlotPosition[][] => {
    const rows: SlotPosition[][] = []
    const rowThreshold = avgSize * 0.5

    slots.forEach(slot => {
      let addedToRow = false
      for (const row of rows) {
        const rowY = row[0].y
        if (Math.abs(slot.y - rowY) < rowThreshold) {
          row.push(slot)
          addedToRow = true
          break
        }
      }
      if (!addedToRow) {
        rows.push([slot])
      }
    })

    // 各行内でx座標でソート
    return rows.map(row => row.sort((a, b) => a.x - b.x))
  }

  // スロットを行ごとにグループ化
  const rows = groupSlotsByRow(candidates)

  // 各行のスロットの位置を微調整（大きな移動は避ける）
  const normalizedSlots = rows.flatMap(row => {
    if (row.length <= 1) return row

    // 各スロットの位置を維持しながら、明らかなズレのみを修正
    return row.map((slot, index) => {
      // 隣接するスロットとの距離をチェック
      const prevSlot = index > 0 ? row[index - 1] : null
      const nextSlot = index < row.length - 1 ? row[index + 1] : null

      let adjustedX = slot.x
      
      // 前のスロットとの間隔が不自然に小さい場合は調整
      if (prevSlot && (slot.x - (prevSlot.x + prevSlot.width)) < 2) {
        adjustedX = prevSlot.x + prevSlot.width + 2
      }
      
      // 次のスロットとの間隔が不自然に小さい場合は調整
      if (nextSlot && (nextSlot.x - (slot.x + slot.width)) < 2) {
        if (!prevSlot) { // 最初のスロットの場合のみ位置を調整
          adjustedX = nextSlot.x - slot.width - 2
        }
      }

      return {
        x: adjustedX,
        y: slot.y,
        width: slot.width,
        height: slot.height
      }
    })
  })

  // 最終的なソート（上から下、左から右）
  return normalizedSlots.sort((a, b) => {
    if (Math.abs(a.y - b.y) < avgSize * 0.5) {
      return a.x - b.x
    }
    return a.y - b.y
  })
} 