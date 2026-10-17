import { ArrowPathIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from "@heroicons/react/16/solid";
import { cn } from "~/lib/utils";

export type ScannerFileStatus = "done" | "failed" | "processing" | "queued";

export type ScannerFileStatusItem = {
  key: string;
  name: string;
  status: ScannerFileStatus;
};

const statusLabel = {
  done: "완료",
  failed: "실패",
  processing: "인식 중",
  queued: "대기",
} as const;

const statusClassName = {
  done: "text-v2-success",
  failed: "text-v2-danger",
  processing: "text-v2-fg-secondary",
  queued: "text-v2-fg-tertiary",
} as const;

const StatusIcon = {
  done: CheckCircleIcon,
  failed: XCircleIcon,
  processing: ArrowPathIcon,
  queued: ClockIcon,
} as const;

// Each file's status is an icon, a name, and a text label. There are no dividers between rows.
export function ScannerFileStatusList({ items }: { items: ScannerFileStatusItem[] }) {
  return (
    <section
      aria-labelledby="scanner-file-status"
      className="flex flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p"
    >
      <h2 id="scanner-file-status" className="text-sm font-semibold text-v2-fg">
        파일별 상태
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = StatusIcon[item.status];
          return (
            <li key={item.key} className="flex min-h-6 items-center justify-between gap-v2-media-gap px-v2-row-x">
              <span className="flex min-w-0 items-center gap-2 text-sm text-v2-fg">
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    statusClassName[item.status],
                    item.status === "processing" && "motion-safe:animate-spin",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </span>
              <span className={cn("shrink-0 text-sm font-medium", statusClassName[item.status])}>
                {statusLabel[item.status]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
