import { Button } from "@/components/ui/button"
import ItemSelector from "@/components/item-selector"
import {MinecraftItem} from "@/types/inventory";

interface ItemSelectorModalProps {
  onSelectItem: (item: MinecraftItem) => void
  onClose: () => void
  onUpload: () => void
  recentItems: MinecraftItem[]
}

export function ItemSelectorModal({
  onSelectItem,
  onClose,
  onUpload,
  recentItems,
}: ItemSelectorModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-800">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Select Minecraft Item</h2>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onUpload}
            >
              Upload Custom Item
            </Button>
          </div>
        </div>

        <ItemSelector
          onSelectItem={onSelectItem}
          onClose={onClose}
          recentItems={recentItems}
        />
      </div>
    </div>
  )
} 