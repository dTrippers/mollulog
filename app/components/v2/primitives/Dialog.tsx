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
  // "fit" sizes the panel to its content, for an image whose shape varies: the content sets its own maximum size.
  size?: "sm" | "fit";
  // For an image that needs no caption: the title stays the panel's accessible name, and the close button floats over the content's corner.
  titleHidden?: boolean;
};

// Modal dialog for a full-size image or a confirmation. The title is the accessible name of the panel.
// It sits on the shared modal layer, above the global navigation, and has its own close button for touch users.
export function Dialog({ open, onClose, title, children, size, titleHidden = false }: DialogProps) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-layer-modal">
      <DialogBackdrop className="fixed inset-0 bg-v2-backdrop" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className={cn(
            "relative flex max-h-full flex-col gap-v2-block-gap overflow-hidden rounded-lg bg-v2-surface p-v2-block-p ring-1 ring-v2-divider shadow-xl",
            size === "fit" ? "w-fit max-w-full" : size === "sm" ? "w-full max-w-md" : "w-full max-w-4xl",
          )}
        >
          {titleHidden ? (
            <>
              <DialogTitle className="sr-only">{title}</DialogTitle>
              <IconButton
                icon={XMarkIcon}
                label="닫기"
                onClick={onClose}
                className="absolute top-[calc(var(--spacing-v2-block-p)+0.5rem)] right-[calc(var(--spacing-v2-block-p)+0.5rem)] z-10 bg-v2-surface/40 text-v2-fg-secondary backdrop-blur-sm hover:bg-v2-surface/70 hover:text-v2-fg"
              />
            </>
          ) : (
            <div className="flex min-w-0 items-center justify-between gap-3">
              <DialogTitle className="min-w-0 truncate text-base font-semibold text-v2-fg">{title}</DialogTitle>
              <IconButton icon={XMarkIcon} label="닫기" onClick={onClose} className="-mr-2" />
            </div>
          )}
          {children}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
