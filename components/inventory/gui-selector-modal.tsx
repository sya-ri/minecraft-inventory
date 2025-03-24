import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Upload } from "lucide-react"

interface Gui {
  name: string
  path: string
  minSlotSize: number
}

interface GuiSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  guis: Gui[]
  selectedGui: Gui
  onSelectGui: (gui: Gui) => void
  onUpload: () => void
}

export function GuiSelectorModal({
  isOpen,
  onClose,
  guis,
  selectedGui,
  onSelectGui,
  onUpload,
}: GuiSelectorModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-200">Select GUI</DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose a GUI template or upload your own
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[calc(100vh-12rem)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {guis.map((gui) => (
              <button
                key={gui.path}
                className={`p-4 rounded-lg transition-colors flex flex-col items-center ${
                  selectedGui.path === gui.path ? 'bg-gray-700' : 'hover:bg-gray-800'
                }`}
                onClick={() => {
                  onSelectGui(gui)
                  onClose()
                }}
              >
                <div className="relative w-full aspect-video mb-2">
                  <Image
                    src={gui.path}
                    alt={gui.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <p className="text-sm text-center text-gray-200">{gui.name}</p>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-700 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onUpload}
            className="border-gray-700 hover:bg-gray-800"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Custom GUI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 