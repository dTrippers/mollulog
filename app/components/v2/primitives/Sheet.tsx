import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { type ElementType, type ReactNode, useRef } from "react";
import { v2FocusRing } from "../layout/styles";

export type SheetProps = {
  open: boolean;
  title: string;
  Icon?: ElementType;
  description?: ReactNode;
  headerAction?: ReactNode;
  onClose: () => void;
  onExited?: () => void;
  // Fixed under the scrolling body, such as a composer. It does not scroll with the body.
  footer?: ReactNode;
  // Set by a panel sheet, so a focus request for the panel title finds the title on stacked.
  panelId?: string;
  children: ReactNode;
};

export function Sheet({
  open,
  title,
  Icon,
  description,
  headerAction,
  onClose,
  onExited,
  footer,
  panelId,
  children,
}: SheetProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Transition show={open} afterLeave={onExited}>
      <Dialog onClose={onClose} initialFocus={titleRef} className="relative z-layer-modal">
        <TransitionChild
          enter="transition-opacity duration-v2-slow ease-v2-enter"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-v2-base ease-v2-exit"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-v2-backdrop" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-end justify-center">
          <TransitionChild
            enter="transition-[translate,opacity] duration-v2-slow ease-v2-enter"
            enterFrom="motion-safe:translate-y-full motion-reduce:opacity-0"
            enterTo="motion-safe:translate-y-0 motion-reduce:opacity-100"
            leave="transition-[translate,opacity] duration-v2-base ease-v2-exit"
            leaveFrom="motion-safe:translate-y-0 motion-reduce:opacity-100"
            leaveTo="motion-safe:translate-y-full motion-reduce:opacity-0"
          >
            <DialogPanel className="flex min-h-[min(24rem,85dvh)] max-h-[85dvh] w-full max-w-3xl flex-col rounded-t-lg bg-v2-surface">
              <div className="flex shrink-0 items-center justify-between gap-3 pt-4 pb-3 pr-2 pl-v2-block-p">
                <div className={Icon ? "flex min-w-0 items-center gap-3 pl-1" : "min-w-0"}>
                  {Icon ? <Icon className="size-5 shrink-0 text-v2-fg-secondary" aria-hidden="true" /> : null}
                  <div className="min-w-0">
                    <DialogTitle
                      as="h2"
                      ref={titleRef}
                      data-panel-title={panelId}
                      tabIndex={-1}
                      className="text-base font-semibold text-v2-fg focus:outline-none"
                    >
                      {title}
                    </DialogTitle>
                    {description ? <div className="mt-0.5 text-xs text-v2-fg-tertiary">{description}</div> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className={`flex size-11 cursor-pointer items-center justify-center rounded-md text-v2-fg-secondary hover:bg-v2-hover ${v2FocusRing}`}
                  >
                    <XMarkIcon className="size-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-v2-block-p pt-1 pb-[max(env(safe-area-inset-bottom),1rem)]">
                {children}
              </div>
              {footer ? (
                <div className="shrink-0 px-v2-block-p pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">{footer}</div>
              ) : null}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
