import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { Fragment, useEffect, useState } from "react";
import { cn } from "~/lib/utils";

type BottomSheetProps = {
  children: React.ReactNode | React.ReactNode[];

  Icon: React.ElementType;
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  onClose: () => void;
  open?: boolean;
  onExited?: () => void;
};

export default function BottomSheet({
  children,
  Icon,
  title,
  description,
  headerAction,
  onClose,
  open = true,
  onExited,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Transition show={open} as={Fragment} afterLeave={onExited}>
      <Dialog open={open} onClose={onClose} className="relative z-layer-modal">
        <TransitionChild
          as={Fragment}
          enter="transition-opacity duration-300 ease-out motion-reduce:transition-none"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-300 ease-in motion-reduce:transition-none"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-white/50 dark:bg-black/50" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-end justify-center">
          <TransitionChild
            as={Fragment}
            enter="transform transition duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none"
            enterFrom="translate-y-full"
            enterTo="translate-y-0"
            leave="transform transition duration-300 ease-in motion-reduce:transition-none motion-reduce:transform-none"
            leaveFrom="translate-y-0"
            leaveTo="translate-y-full"
          >
            <DialogPanel
              className={cn(`
              w-screen lg:max-w-3xl h-dvh max-h-120 md:max-h-144 px-4 pt-6 lg:px-8 lg:pt-8 pb-[var(--pb-safe-or-6)] flex flex-col
              rounded-t-lg bg-popover/90 shadow-t-xl backdrop-blur-sm
            `)}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex items-center justify-center rounded-lg bg-muted p-2 lg:p-3">
                    <Icon className="size-5 text-muted-foreground lg:size-6" strokeWidth={2} />
                  </div>
                  <div>
                    <DialogTitle className="font-bold text-lg">{title}</DialogTitle>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
                  <button
                    type="button"
                    className="rounded-md p-1 transition-colors hover:bg-muted"
                    onClick={onClose}
                    aria-label="바텀시트 닫기"
                  >
                    <XMarkIcon className="size-6 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar">{children}</div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
