import { WrenchScrewdriverIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  COMMUNITY_WRITE_MAINTENANCE_DESCRIPTION,
  COMMUNITY_WRITE_MAINTENANCE_TITLE,
} from "~/domain/community-write-freeze";

type CommunityWriteMaintenanceToastProps = {
  trigger: unknown;
};

export default function CommunityWriteMaintenanceToast({ trigger }: CommunityWriteMaintenanceToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timeoutId = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [trigger]);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-white shadow-xl dark:bg-neutral-100 dark:text-neutral-900 md:right-8 md:max-w-sm lg:bottom-4"
    >
      <WrenchScrewdriverIcon className="mt-0.5 size-5 shrink-0 text-amber-300 dark:text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{COMMUNITY_WRITE_MAINTENANCE_TITLE}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-300 dark:text-neutral-600">
          {COMMUNITY_WRITE_MAINTENANCE_DESCRIPTION}
        </p>
      </div>
      <button
        type="button"
        aria-label="알림 닫기"
        className="-mr-1 -mt-1 rounded p-1 text-neutral-400 transition hover:bg-white/10 hover:text-white dark:text-neutral-500 dark:hover:bg-black/10 dark:hover:text-neutral-900"
        onClick={() => setVisible(false)}
      >
        <XMarkIcon className="size-4" />
      </button>
    </div>,
    document.body,
  );
}
