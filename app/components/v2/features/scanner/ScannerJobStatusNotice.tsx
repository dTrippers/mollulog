import { Button } from "../../primitives/Button";
import { StatusNotice } from "../../primitives/StatusNotice";

export type ScannerJobStatusNoticeProps = {
  title: string;
  action: "retry" | "startNew";
  onRetry: () => void;
  onStartNew: () => void;
  // The button label for a new upload, passed by the screen so the copy stays in one place.
  startNewLabel: string;
};

// A failed job status read. A transient failure offers a retry for the same job. A missing job offers only a new upload.
export function ScannerJobStatusNotice({
  title,
  action,
  onRetry,
  onStartNew,
  startNewLabel,
}: ScannerJobStatusNoticeProps) {
  return (
    <StatusNotice
      tone="danger"
      action={
        action === "retry" ? (
          <Button variant="text" onClick={onRetry}>
            다시 시도
          </Button>
        ) : (
          <Button variant="secondary" onClick={onStartNew}>
            {startNewLabel}
          </Button>
        )
      }
    >
      {title}
    </StatusNotice>
  );
}
