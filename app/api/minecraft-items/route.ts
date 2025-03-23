import { NextResponse } from "next/server"

interface ListJsonResponse {
  directories: string[]
  files: string[]
}

export async function GET() {
  try {
    // Fetch the _list.json file from GitHub
    const listUrl =
      "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.4/assets/minecraft/textures/item/_list.json"

    const response = await fetch(listUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch item list: ${response.status}`)
    }

    const data = (await response.json()) as ListJsonResponse

    // Extract the files array from the response
    if (!data || !data.files || !Array.isArray(data.files)) {
      throw new Error("Invalid data format: missing files array")
    }

    // アニメーションテクスチャのグループを作成
    const animatedGroups = new Map<string, string[]>()
    data.files.forEach(file => {
      // _数字.png のパターンを持つファイルを検出
      const match = file.match(/^(.+?)_(\d+)\.png$/)
      if (match) {
        const baseName = match[1]
        if (!animatedGroups.has(baseName)) {
          animatedGroups.set(baseName, [])
        }
        animatedGroups.get(baseName)?.push(file)
      }
    })

    // アニメーションテクスチャを持つアイテムをフィルタリング
    const filteredFiles = data.files.filter(file => {
      const match = file.match(/^(.+?)_(\d+)\.png$/)
      if (!match) return true // 通常のアイテム

      const baseName = match[1]
      const frames = animatedGroups.get(baseName)
      if (!frames || frames.length === 1) return true // 単一フレームの場合は通常アイテムとして扱う

      // アニメーションアイテムの場合、代表フレームのみを許可
      // compass系は16（北）、それ以外は00を代表フレームとする
      const isCompass = baseName.includes('compass')
      const representativeFrame = isCompass ? `${baseName}_16.png` : `${baseName}_00.png`
      return file === representativeFrame
    })

    // Return the filtered files array
    return NextResponse.json({ items: filteredFiles })
  } catch (error) {
    console.error("Error fetching Minecraft items:", error)
    return NextResponse.json({ error: "Failed to fetch Minecraft items" }, { status: 500 })
  }
}

