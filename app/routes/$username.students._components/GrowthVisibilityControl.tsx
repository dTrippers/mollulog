import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Button, SectionCard } from "~/components/primitives";

type GrowthVisibilityControlProps = {
  enabled: boolean;
  saving: boolean;
  status: "idle" | "saving" | "saved" | "error";
  error?: string | null;
  onChange: (enabled: boolean) => void;
};

export default function GrowthVisibilityControl({
  enabled,
  saving,
  status,
  error,
  onChange,
}: GrowthVisibilityControlProps) {
  return (
    <SectionCard
      title="성장 상태 공개"
      description={
        enabled ? "공개 프로필을 방문한 사람이 현재 성장 상태를 볼 수 있어요." : "현재 성장 상태는 나만 볼 수 있어요."
      }
      action={
        <Button
          icon={enabled ? EyeSlashIcon : EyeIcon}
          text={enabled ? "공개 중지" : "공개 시작"}
          variant={enabled ? "secondary" : "primary"}
          size="sm"
          disabled={saving}
          onClick={() => onChange(!enabled)}
        />
      }
    >
      {status !== "idle" ? (
        <p
          className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {status === "saving"
            ? "저장 중이에요..."
            : status === "saved"
              ? "공개 설정을 저장했어요."
              : (error ?? "공개 설정을 저장하지 못했어요.")}
        </p>
      ) : null}
    </SectionCard>
  );
}

export type { GrowthVisibilityControlProps };
