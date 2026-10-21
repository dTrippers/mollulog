import { BellIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";

// Same visual form as the v2 secondary Button used for the scanner feedback action, rendered as a router link.
export function ContactNotificationLink() {
  return (
    <Link
      to="/notifications"
      {...getV2LinkTransitionProps("forward")}
      className={v2ButtonClassName({ variant: "secondary", className: "text-xs focus-visible:-outline-offset-2" })}
    >
      <BellIcon className="size-4" aria-hidden="true" />
      답변 알림 설정
    </Link>
  );
}
