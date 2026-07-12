import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { cn } from "~/lib/utils";

type BottomSheetProps = {
  children: React.ReactNode | React.ReactNode[];

  Icon: React.ElementType;
  title: string;
  description?: string;
  onClose: () => void;
};

export default function BottomSheet({ children, Icon, title, description, onClose }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        className="fixed top-0 left-0 z-layer-backdrop h-dvh w-screen bg-white/50 dark:bg-black/50"
        onClick={onClose}
        aria-label="바텀시트 닫기"
      />
      <div
        className={cn(`
        w-screen lg:max-w-3xl h-dvh max-h-120 md:max-h-144 fixed bottom-0 left-0 right-0 mx-auto px-4 pt-6 lg:px-8 lg:pt-8 pb-[var(--pb-safe-or-6)] flex flex-col
        z-layer-modal rounded-t-lg bg-popover/90 shadow-t-xl backdrop-blur-sm
      `)}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-lg bg-muted p-2 lg:p-3">
              <Icon className="size-5 text-muted-foreground lg:size-6" strokeWidth={2} />
            </div>
            <div>
              <p className="font-bold text-lg">{title}</p>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 transition-colors hover:bg-muted"
            onClick={onClose}
            aria-label="바텀시트 닫기"
          >
            <XMarkIcon className="size-6 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">{children}</div>
      </div>
    </>,
    document.body,
  );
}
