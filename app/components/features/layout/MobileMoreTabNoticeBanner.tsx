import { useEffect, useState } from "react";
import { TimelineItemBanner } from "~/components/features/contents";
import { cn } from "~/lib/utils";

type MobileMoreTabNoticeBannerProps = {
  message: string;
  dismissStorageKey: string;
  className?: string;
};

export default function MobileMoreTabNoticeBanner({
  message,
  dismissStorageKey,
  className,
}: MobileMoreTabNoticeBannerProps) {
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(dismissStorageKey) === "true");
    setLoaded(true);
  }, [dismissStorageKey]);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(dismissStorageKey, "true");
  };

  if (!loaded || dismissed) {
    return null;
  }

  return (
    <div className={cn("lg:hidden", className)}>
      <TimelineItemBanner
        icon="menu"
        color="neutral"
        link="/more"
        linkText="보러 가기"
        onDismiss={dismiss}
        dismissLabel="다시 보지 않기"
        message={message}
      />
    </div>
  );
}
