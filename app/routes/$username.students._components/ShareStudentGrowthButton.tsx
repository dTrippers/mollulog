import { ShareIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "~/components/primitives";

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

type ShareStudentGrowthButtonProps = {
  url: string;
  disabled?: boolean;
};

export default function ShareStudentGrowthButton({ url, disabled = false }: ShareStudentGrowthButtonProps) {
  const [status, setStatus] = useState<"idle" | "sharing" | ShareStudentGrowthResult | "error">("idle");

  const handleShare = async () => {
    if (disabled || status === "sharing") return;
    setStatus("sharing");
    try {
      setStatus(await shareStudentGrowthUrl(url));
    } catch {
      setStatus("error");
    }
  };

  const statusMessage =
    status === "shared"
      ? "공유했어요"
      : status === "copied"
        ? "링크를 복사했어요"
        : status === "cancelled"
          ? "공유를 취소했어요"
          : status === "error"
            ? "공유 링크를 복사하지 못했어요. 다시 시도해 주세요."
            : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        text={status === "sharing" ? "공유 준비 중" : "성장 상태 공유"}
        icon={ShareIcon}
        variant="primary"
        size="sm"
        disabled={disabled || status === "sharing"}
        onClick={handleShare}
      />
      {statusMessage ? (
        <span
          className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role={status === "error" ? "alert" : undefined}
          aria-live="polite"
        >
          {statusMessage}
        </span>
      ) : null}
    </div>
  );
}

export type { ShareStudentGrowthButtonProps };
