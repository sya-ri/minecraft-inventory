import Image from "next/image"
import { Button } from "@/components/ui/button"
import type { SlotPosition } from "@/types/inventory"

interface SlotDetectionSettingsProps {
  tempGridImage: string
  imageSize: { width: number; height: number }
  previewSlots: SlotPosition[]
  threshold: number
  minSlotSize: number
  onThresholdChange: (value: number) => void
  onMinSlotSizeChange: (value: number) => void
  onCancel: () => void
  onApply: () => void
}

export function SlotDetectionSettings({
  tempGridImage,
  imageSize,
  previewSlots,
  threshold,
  minSlotSize,
  onThresholdChange,
  onMinSlotSizeChange,
  onCancel,
  onApply,
}: SlotDetectionSettingsProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">Adjust Slot Detection</h2>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div className="relative mx-auto" style={{ maxWidth: '100%', width: 'fit-content' }}>
            <Image
              src={tempGridImage}
              alt="Grid Preview"
              width={imageSize.width}
              height={imageSize.height}
              className="pixelated"
            />
            
            <div className="absolute top-0 left-0 w-full h-full">
              {previewSlots.map((slot, index) => (
                <div
                  key={index}
                  className="absolute border-2 border-blue-500"
                  style={{
                    left: `${(slot.x / imageSize.width) * 100}%`,
                    top: `${(slot.y / imageSize.height) * 100}%`,
                    width: `${(slot.width / imageSize.width) * 100}%`,
                    height: `${(slot.height / imageSize.height) * 100}%`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">Color Tolerance ({threshold})</label>
              <input
                type="range"
                min="0"
                max="100"
                value={threshold}
                onChange={(e) => onThresholdChange(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400">Minimum Slot Size ({minSlotSize}px)</label>
              <input
                type="range"
                min="10"
                max="50"
                value={minSlotSize}
                onChange={(e) => onMinSlotSizeChange(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onApply}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
} 