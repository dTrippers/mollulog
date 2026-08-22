import { cn } from "~/lib/utils";

export type ScannerUploadQuota = {
  limit: number;
  used: number;
  remaining: number;
  nextAvailableAt: string | null;
};

export function UploadQuotaMeter({
  quota,
  unit,
  subject,
}: {
  quota: ScannerUploadQuota;
  unit: string;
  subject: string;
}) {
  const isExhausted = quota.remaining === 0;
  const lowQuotaThreshold = Math.max(1, Math.floor(quota.limit / 6));
  const isLow = quota.remaining > 0 && quota.remaining <= lowQuotaThreshold;
  const percentage = (quota.remaining / quota.limit) * 100;

  return (
    <div
      className={cn(
        "w-28 sm:w-36",
        isExhausted ? "text-destructive" : isLow ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
      title={
        isExhausted && quota.nextAvailableAt
          ? `${formatQuotaAvailability(quota.nextAvailableAt)}부터 다시 업로드할 수 있어요`
          : undefined
      }
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs leading-none">
        <span>{subject}</span>
        <span className="font-mono font-medium text-foreground">
          {quota.remaining}/{quota.limit}
        </span>
      </div>
      <progress
        aria-label={`최근 7일 업로드 가능 ${subject} ${quota.remaining}${unit}`}
        max={quota.limit}
        value={quota.remaining}
        className="sr-only"
      />
      <div
        aria-hidden="true"
        className={cn("h-1.5 overflow-hidden rounded-full", isExhausted ? "bg-destructive/20" : "bg-muted")}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", isLow ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function formatQuotaAvailability(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
