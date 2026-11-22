import { ExclamationTriangleIcon, ShareIcon } from "@heroicons/react/16/solid";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Popover } from "~/components/v2/primitives/Popover";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";

export type ShareStudentGrowthResult = "shared" | "copied" | "cancelled";

function isShareCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Use the same browser fallback as the existing share flows.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("clipboard unavailable");
  }
}

export async function shareStudentGrowthUrl(url: string): Promise<ShareStudentGrowthResult> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "학생 성장 상태", url });
      return "shared";
    } catch (error) {
      if (isShareCancelled(error)) {
        return "cancelled";
      }
    }
  }

  await copyTextToClipboard(url);
  return "copied";
}

export const SHARE_RESULT_MESSAGES = {
  shared: "공유했어요",
  copied: "링크를 복사했어요",
  cancelled: "공유를 취소했어요",
  error: "공유 링크를 복사하지 못했어요. 다시 시도해주세요.",
} as const;

// Why a link would not show the growth: a private profile cannot be opened, and a private growth view opens as the
// summary. Pressing the button then explains the setting instead of sharing.
export type ShareStudentGrowthBlock = "profile_private" | "growth_private";

const BLOCK_MESSAGES = {
  profile_private: {
    title: "프로필이 비공개라 성장 상태를 공유할 수 없어요.",
    description: "프로필 관리에서 공개로 바꾸면 공유 링크를 만들 수 있어요.",
  },
  growth_private: {
    title: "학생 성장도가 비공개라 성장 상태를 공유할 수 없어요.",
    description: "프로필 관리에서 학생 성장도를 공개로 바꾸면 공유 링크를 만들 수 있어요.",
  },
} as const satisfies Record<ShareStudentGrowthBlock, { title: string; description: string }>;

type ShareStudentGrowthButtonProps = {
  url: string;
  blockedBy: ShareStudentGrowthBlock | null;
  disabled?: boolean;
  onResult: (result: ShareStudentGrowthResult | "error") => void;
};

export default function ShareStudentGrowthButton({
  url,
  blockedBy,
  disabled = false,
  onResult,
}: ShareStudentGrowthButtonProps) {
  const [sharing, setSharing] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleShare = async () => {
    if (disabled || sharing) return;
    if (blockedBy) {
      setWarningOpen((open) => !open);
      return;
    }
    setSharing(true);
    try {
      const result = await shareStudentGrowthUrl(url);
      onResult(result);
      if (result === "shared") trackGoogleAnalyticsEvent("share", { content_type: "student_growth", method: "native" });
      if (result === "copied") trackGoogleAnalyticsEvent("share", { content_type: "student_growth", method: "copy" });
    } catch {
      onResult("error");
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        disabled={disabled || sharing}
        aria-haspopup={blockedBy ? "dialog" : undefined}
        aria-expanded={blockedBy ? warningOpen : undefined}
        onClick={handleShare}
      >
        <ShareIcon className="size-4" aria-hidden="true" />
        {sharing ? "공유 준비 중" : "성장 상태 공유"}
      </Button>
      <Popover
        open={warningOpen && blockedBy !== null}
        label={blockedBy ? BLOCK_MESSAGES[blockedBy].title : ""}
        onClose={() => setWarningOpen(false)}
        returnFocusRef={triggerRef}
        className="w-72"
      >
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-v2-warning" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-v2-fg">{blockedBy ? BLOCK_MESSAGES[blockedBy].title : null}</p>
              <p className="mt-0.5 text-v2-fg-secondary">{blockedBy ? BLOCK_MESSAGES[blockedBy].description : null}</p>
            </div>
          </div>
          <Link to="/edit" className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
            프로필 관리
          </Link>
        </div>
      </Popover>
    </>
  );
}

export type { ShareStudentGrowthButtonProps };
