import { EyeSlashIcon } from "@heroicons/react/16/solid";
import type { RefObject } from "react";
import { FeatureHint } from "../feature-hint";

// Explains the opinion-hiding setting once per visit. 설정 보기 opens the filter panel, and the close control dismisses it.
// The notice is the feature hint at full sheet width.
export function OpinionTutorial({
  onOpenSettings,
  onDismiss,
  dismissRef,
}: {
  onOpenSettings: () => void;
  onDismiss: () => void;
  dismissRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <FeatureHint
      Icon={EyeSlashIcon}
      message="모집 결과글을 숨길 수 있어요"
      actionLabel="설정 보기"
      onAction={onOpenSettings}
      closeLabel="모집 결과글 숨김 기능 안내 닫기"
      onClose={onDismiss}
      closeRef={dismissRef}
      fullWidth
    />
  );
}
