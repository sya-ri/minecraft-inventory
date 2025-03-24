import { NextResponse } from "next/server"

interface ListJsonResponse {
  directories: string[]
  files: string[]
}

interface ItemResponse {
  items: string[]
  baseUrl: string
}

const DEFAULT_VERSION = "1.21.4"

function getTexturePath(version: string): string {
  const [major, minor] = version.split('.').map(Number)
  return major === 1 && minor < 13 ? 'textures/items' : 'textures/item'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const version = searchParams.get('version') || DEFAULT_VERSION
    const texturePath = getTexturePath(version)
    const baseUrl = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${version}/assets/minecraft/${texturePath}`
    const assetsUrl = `${baseUrl}/_list.json`

    const response = await fetch(assetsUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch item list: ${response.status}`)
    }

    const data: ListJsonResponse = await response.json()
    if (!data?.files?.length) {
      throw new Error("Invalid data format: missing files array")
    }

    const result: string[] = []

    data.files.forEach(file => {
      const match = file.match(/^(.+?)_(\d+)\.png$/)
      if (!match) {
        result.push(file)
        return
      }

      const baseName = match[1]
      const frameNumber = match[2]
      const isCompass = baseName.includes('compass')
      const targetFrame = isCompass ? '16' : '00'

      if (frameNumber === targetFrame) {
        result.push(file)
      }
    })

    return NextResponse.json<ItemResponse>({
      items: result,
      baseUrl
    })
  } catch (error) {
    console.error("Error fetching Minecraft items:", error)
    return NextResponse.json(
      { error: "Failed to fetch Minecraft items" },
      { status: 500 }
    )
  }
}

