import { DialogBackdrop, DialogPanel, DialogTitle, Dialog as HeadlessDialog } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { IconButton } from "./IconButton";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm";
};

// Modal dialog for a full-size image or a confirmation. The title is the accessible name of the panel.
// It sits on the shared modal layer, above the global navigation, and has its own close button for touch users.
export function Dialog({ open, onClose, title, children, size }: DialogProps) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-layer-modal">
      <DialogBackdrop className="fixed inset-0 bg-v2-backdrop" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className={cn(
            "flex max-h-full w-full flex-col gap-v2-block-gap overflow-hidden rounded-lg bg-v2-surface p-v2-block-p ring-1 ring-v2-divider shadow-xl",
            size === "sm" ? "max-w-md" : "max-w-4xl",
          )}
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <DialogTitle className="min-w-0 truncate text-base font-semibold text-v2-fg">{title}</DialogTitle>
            <IconButton icon={XMarkIcon} label="닫기" onClick={onClose} className="-mr-2" />
          </div>
          {children}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
