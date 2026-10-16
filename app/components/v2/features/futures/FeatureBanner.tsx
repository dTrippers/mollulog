import { InformationCircleIcon } from "@heroicons/react/16/solid";
import { FeatureHint } from "../feature-hint";

// Timeline feature hint. Dismissal is saved by the route.
export function FeatureBanner({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <FeatureHint
      Icon={InformationCircleIcon}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
      closeLabel="닫기"
      onClose={onDismiss}
    />
  );
}
