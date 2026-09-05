import { PanelBody, PanelSwitchRow } from "~/components/primitives";

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
    <PanelBody>
      <PanelSwitchRow
        title="공개 여부"
        description={
          enabled ? "공개 프로필을 방문한 사람이 현재 성장 상태를 볼 수 있어요." : "현재 성장 상태는 나만 볼 수 있어요."
        }
        checked={enabled}
        disabled={saving}
        onChange={onChange}
      />
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
    </PanelBody>
  );
}

export type { GrowthVisibilityControlProps };
