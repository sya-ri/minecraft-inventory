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

    // Return just the files array
    return NextResponse.json({ items: data.files })
  } catch (error) {
    console.error("Error fetching Minecraft items:", error)
    return NextResponse.json({ error: "Failed to fetch Minecraft items" }, { status: 500 })
  }
}

