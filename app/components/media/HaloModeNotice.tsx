import { HaloModeIcon } from "./HaloModeIcon";
import { cn } from "~/lib/utils";

const noticeText = "헤일로 모드가 켜져있어요";

export default function HaloModeNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "halo-mode-notice-container pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-1",
        className,
      )}
    >
      <span
        title={noticeText}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-v2-scrim px-2 py-1 text-xs font-medium text-v2-on-media"
      >
        <HaloModeIcon solid className="size-4 shrink-0" />
        <span className="sr-only">{noticeText}</span>
        <span aria-hidden="true" className="halo-mode-notice-label whitespace-nowrap">
          {noticeText}
        </span>
      </span>
    </div>
  );
}
