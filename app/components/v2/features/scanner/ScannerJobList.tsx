import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";

export type ScannerJobTone = "waiting" | "processing" | "review" | "done" | "failed";

export type ScannerJobListItem = {
  uid: string;
  kindLabel: string;
  detail: string;
  statusLabel: string;
  tone: ScannerJobTone;
  href: string;
  selected: boolean;
};

const toneIcon = {
  waiting: ClockIcon,
  processing: ArrowPathIcon,
  review: ExclamationTriangleIcon,
  done: CheckCircleIcon,
  failed: XCircleIcon,
} as const;

const toneClassName = {
  waiting: "text-v2-fg-secondary",
  processing: "text-v2-fg-secondary",
  review: "text-v2-warning",
  done: "text-v2-success",
  // The dark danger text falls under 4.5:1 on the selected or hovered row, so a failure keeps the danger icon
  // and writes its label in the secondary text color.
  failed: "text-v2-fg-secondary",
} as const;

const toneIconClassName = {
  waiting: undefined,
  processing: undefined,
  review: undefined,
  done: undefined,
  failed: "text-v2-danger",
} as const;

// Recent jobs in the Aside. The selected job is marked with aria-current, a full-row neutral background, and a semibold title.
// A processing job's icon turns while it is recognizing (a loading indicator; it stops under reduced motion).
export function ScannerJobList({ items }: { items: ScannerJobListItem[] }) {
  return (
    <ul className="flex flex-col gap-v2-list-gap">
      {items.map((item) => {
        const Icon = toneIcon[item.tone];
        return (
          <li key={item.uid}>
            <Link
              to={item.href}
              aria-current={item.selected ? "page" : undefined}
              className={cn(
                "flex min-h-v2-row-min items-center justify-between gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y hover:bg-v2-hover",
                item.selected && "bg-v2-hover",
                v2FocusRing,
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className={cn("truncate text-sm text-v2-fg", item.selected ? "font-semibold" : "font-medium")}>
                  {item.kindLabel}
                </span>
                <span className="truncate text-xs text-v2-fg-tertiary tabular-nums">{item.detail}</span>
              </span>
              <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", toneClassName[item.tone])}>
                <Icon
                  className={cn(
                    "size-3.5",
                    toneIconClassName[item.tone],
                    item.tone === "processing" && "motion-safe:animate-spin",
                  )}
                  aria-hidden="true"
                />
                {item.statusLabel}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
