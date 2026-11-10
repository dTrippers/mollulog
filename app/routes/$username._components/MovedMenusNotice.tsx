import { InformationCircleIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";

export const MOVED_MENUS_NOTICE_STORAGE_KEY = "mollulog:user-moved-menus-notice-dismissed";
// The notice runs through the end of November 2026 (KST). Remove this component after that date.
export const MOVED_MENUS_NOTICE_ENDS_AT = Date.parse("2026-12-01T00:00:00+09:00");

const linkClassName = "font-medium text-v2-link underline underline-offset-2 hover:decoration-2";

// The owner's notice that the former 공략 타임라인 and 편성/공략 tabs moved. It appears only after the browser
// says it was not dismissed and the notice period has not ended, so a dismissed notice never flashes, and closing it is
// remembered in this browser only.
export function MovedMenusNotice({ now = Date.now }: { now?: () => number }) {
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

  if (!visible) {
    return null;
  }

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(MOVED_MENUS_NOTICE_STORAGE_KEY, "1");
    } catch {
      // Without storage the notice closes for this visit only.
    }
  };

  return (
    <StatusNotice
      tone="neutral"
      boxed
      Icon={InformationCircleIcon}
      className="mb-v2-group-gap"
      action={<IconButton icon={XMarkIcon} label="안내 닫기" onClick={dismiss} className="-my-1.5 -mr-1.5" />}
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
