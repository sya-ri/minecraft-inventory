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
  threshold: number,
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

  // スロットの色の定義（RGB）
  const targetR = 128
  const targetG = 128
  const targetB = 128
  const colorThreshold = threshold // 色の許容範囲
  const scanStep = 5 // スキャン間隔

  // 色が目的の色と一致するかチェック
  const isTargetColor = (x: number, y: number): boolean => {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false
    const i = (y * canvas.width + x) * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const colorDiff = Math.sqrt(
      Math.pow(r - targetR, 2) +
      Math.pow(g - targetG, 2) +
      Math.pow(b - targetB, 2)
    )
    return colorDiff <= colorThreshold
  }

  // 指定された領域が同じ色で構成されているかチェック
  const isUniformColor = (x: number, y: number, size: number): boolean => {
    const centerColor = {
      r: data[(y * canvas.width + x) * 4],
      g: data[(y * canvas.width + x) * 4 + 1],
      b: data[(y * canvas.width + x) * 4 + 2]
    }

    for (let cy = y; cy < y + size; cy++) {
      for (let cx = x; cx < x + size; cx++) {
        if (cx >= canvas.width || cy >= canvas.height) return false
        
        const i = (cy * canvas.width + cx) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        
        const colorDiff = Math.sqrt(
          Math.pow(r - centerColor.r, 2) +
          Math.pow(g - centerColor.g, 2) +
          Math.pow(b - centerColor.b, 2)
        )
        
        if (colorDiff > threshold * 0.5) return false
      }
    }
    return true
  }

  // スロットの境界を探索（正方形のみ）
  const findSquareSlot = (startX: number, startY: number): SlotPosition | null => {
    if (!isTargetColor(startX, startY)) return null

    let size = minSlotSize
    let maxSize = Math.min(canvas.width - startX, canvas.height - startY)
    let validSize = null

    // 正方形のサイズを徐々に大きくしていく
    while (size <= maxSize) {
      // 内部が均一な色かチェック
      if (isUniformColor(startX, startY, size)) {
        // ボーダーをチェック（上下左右の線）
        let hasBorder = false
        
        // 上端
        if (startY > 0) {
          const topBorderY = startY - 1
          hasBorder = !isTargetColor(startX, topBorderY)
        }
        
        // 下端
        if (startY + size < canvas.height) {
          hasBorder = hasBorder || !isTargetColor(startX, startY + size)
        }
        
        // 左端
        if (startX > 0) {
          const leftBorderX = startX - 1
          hasBorder = hasBorder || !isTargetColor(leftBorderX, startY)
        }
        
        // 右端
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
      // 既存のスロットと重複していないかチェック
      const isOverlapping = candidates.some(slot => {
        return x >= slot.x - 5 && x <= slot.x + slot.width + 5 &&
               y >= slot.y - 5 && y <= slot.y + slot.height + 5
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

  // 各行内のスロットの間隔を均一化
  const normalizedSlots = rows.flatMap(row => {
    if (row.length <= 1) return row

    return row.map(slot => ({
      x: slot.x,
      y: slot.y,
      width: avgSize,
      height: avgSize
    }))
  })

  // 最終的なソート（上から下、左から右）
  return normalizedSlots.sort((a, b) => {
    if (Math.abs(a.y - b.y) < avgSize * 0.5) {
      return a.x - b.x
    }
    return a.y - b.y
  })
} 