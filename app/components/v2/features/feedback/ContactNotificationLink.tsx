import { BellIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { cn } from "~/lib/utils";

// Same visual form as the v2 secondary Button used for the scanner feedback action, rendered as a router link.
export function ContactNotificationLink() {
  return (
    <Link
      to="/notifications"
      {...getV2LinkTransitionProps("forward")}
      className={cn(
        "inline-flex min-h-v2-control-min cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium whitespace-nowrap bg-v2-inset text-v2-fg hover:bg-v2-filled-hover",
        v2FocusRing,
        "focus-visible:-outline-offset-2",
      )}
    >
      <BellIcon className="size-4" aria-hidden="true" />
      답변 알림 설정
    </Link>
  );
}
