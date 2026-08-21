import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export default function ScannerImageDialog({
  open,
  src,
  title,
  alt,
  onClose,
}: {
  open: boolean;
  src: string;
  title: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-layer-modal">
      <DialogBackdrop className="fixed inset-0 bg-black/85 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
        <DialogPanel className="relative flex max-h-full w-full max-w-[min(96rem,96vw)] flex-col overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-white">
            <DialogTitle className="truncate text-sm font-medium">{title}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="확대 이미지 닫기"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <XMarkIcon className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-4">
            <img src={src} alt={alt} className="max-h-[calc(100vh-7rem)] max-w-full object-contain" />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
