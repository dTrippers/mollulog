import { CheckCircleIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";

export type CopyStatus = "idle" | "copied" | "failed";

type CopyTextButtonProps = {
  value: string;
  label?: string;
  accessibleContext?: string;
  variant?: "icon" | "text";
  buttonVariant?: "primary" | "secondary" | "text";
  className?: string;
  onStatusChange: (status: CopyStatus) => void;
};

export function CopyTextButton({
  value,
  label = "복사하기",
  accessibleContext,
  variant = "text",
  buttonVariant = "text",
  className = "",
  onStatusChange,
}: CopyTextButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateStatus = (next: CopyStatus) => {
    setStatus(next);
    onStatusChange(next);
  };

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      updateStatus("copied");
      resetTimer.current = setTimeout(() => updateStatus("idle"), 1800);
    } catch {
      updateStatus("failed");
    }
  }

  const contextLabel = accessibleContext ? `${accessibleContext} ` : "";

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      {variant === "icon" ? (
        <IconButton
          icon={status === "copied" ? CheckCircleIcon : ClipboardDocumentIcon}
          label={`${contextLabel}${status === "copied" ? "복사됐어요" : label}`}
          onClick={copy}
        />
      ) : (
        <Button type="button" variant={buttonVariant} onClick={copy}>
          {accessibleContext ? <span className="sr-only">{accessibleContext} </span> : null}
          {status === "copied" ? (
            <>
              <CheckCircleIcon className="size-4" aria-hidden="true" /> 복사됨
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="size-4" aria-hidden="true" /> {label}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function CopyStatusMessage({ status }: { status: CopyStatus }) {
  return status === "failed" ? (
    <p aria-live="polite" className="mt-1 break-keep text-xs text-v2-fg-secondary">
      복사하지 못했어요. 텍스트를 직접 선택해 복사해주세요.
    </p>
  ) : (
    <span aria-live="polite" className="sr-only">
      {status === "copied" ? "복사됐어요" : ""}
    </span>
  );
}
