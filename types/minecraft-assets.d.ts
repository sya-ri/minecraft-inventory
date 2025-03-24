declare module 'minecraft-assets' {
  interface MinecraftItem {
    name: string;
    model: string
    texture: string
  }

  interface MinecraftAssets {
    itemsArray: MinecraftItem[]
  }

  function minecraftAssets(version: string): MinecraftAssets;

  export = minecraftAssets;
}
