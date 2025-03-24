import { NextResponse } from 'next/server';
import minecraftAssets from 'minecraft-assets';
import {MinecraftItem} from "@/types/inventory";

export async function GET(_: Request, props: { params: Promise<{ version: string }> }) {
  const params = await props.params;
  try {
    const version = params.version;
    const assets = minecraftAssets(version);
    
    // アイテムデータを整形
    const items = assets.itemsArray.map(item => {
      return ({
        name: item.name,
        texture: item.texture.replace("minecraft:", "").replace("block/", "blocks/")
      });
    }).filter(item => item.texture !== "missingno")
        .map((item): MinecraftItem => ({
          name: item.name,
          url: `https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/${version}/${item.texture}.png`
        }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching Minecraft items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Minecraft items' },
      { status: 500 }
    );
  }
} 