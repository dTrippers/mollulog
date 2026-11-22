import { InformationCircleIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";

export const MOVED_MENUS_NOTICE_STORAGE_KEY = "mollulog:user-moved-menus-notice-dismissed";
// The notice runs through the end of November 2026 (KST). Remove this component after that date.
export const MOVED_MENUS_NOTICE_ENDS_AT = Date.parse("2026-12-01T00:00:00+09:00");

const linkClassName = "font-medium text-v2-link underline underline-offset-2 hover:decoration-2";

// Whether the owner's notice about the moved 공략 타임라인 and 편성/공략 tabs shows. It turns on only after the browser says
// it was not dismissed and the notice period has not ended, so a dismissed notice never flashes. Closing it is remembered
// in this browser only. The layout renders the notice in two places (the Aside, and above the screen while the Aside is
// hidden), so both share this one state.
export function useMovedMenusNotice(now: () => number = Date.now) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (now() >= MOVED_MENUS_NOTICE_ENDS_AT) {
      return;
    }
    try {
      setVisible(localStorage.getItem(MOVED_MENUS_NOTICE_STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, [now]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(MOVED_MENUS_NOTICE_STORAGE_KEY, "1");
    } catch {
      // Without storage the notice closes for this visit only.
    }
  }, []);

  return { visible, dismiss };
}

export function MovedMenusNotice({ onDismiss, className }: { onDismiss: () => void; className?: string }) {
  return (
    <StatusNotice
      tone="neutral"
      boxed
      Icon={InformationCircleIcon}
      className={className}
      action={<IconButton icon={XMarkIcon} label="안내 닫기" onClick={onDismiss} className="-my-1.5 -mr-1.5" />}
    >
      <p className="break-keep">공략 타임라인과 편성은 커뮤니티에서 확인해주세요.</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <Link to="/timelines?mine=1" className={linkClassName}>
          내 공략 타임라인
        </Link>
      </p>
    </StatusNotice>
  );
}
