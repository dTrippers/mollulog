import { Button, SegmentedControl } from "~/components/primitives";

export type RelationshipGiftCalculationModeValue = "manual" | "owned";

type RelationshipGiftCalculationModeProps = {
  mode: RelationshipGiftCalculationModeValue;
  ownedGiftCount: number;
  ownedGiftExp: number;
  canSaveOwnedGiftPlan: boolean;
  onModeChange: (mode: RelationshipGiftCalculationModeValue) => void;
  onSaveOwnedGiftPlan: () => void;
};

const options: Array<{
  value: RelationshipGiftCalculationModeValue;
  label: string;
}> = [
  { value: "manual", label: "선물 수량 입력" },
  { value: "owned", label: "보유한 모든 선물 주기" },
];

export default function RelationshipGiftCalculationMode({
  mode,
  ownedGiftCount,
  ownedGiftExp,
  canSaveOwnedGiftPlan,
  onModeChange,
  onSaveOwnedGiftPlan,
}: RelationshipGiftCalculationModeProps) {
  return (
    <section className="mb-3 md:mb-4">
      <SegmentedControl ariaLabel="선물 계산 방식" value={mode} options={options} onChange={onModeChange} />

      {mode === "owned" ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md bg-primary/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">보유 선물을 모두 주었을 때</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ownedGiftCount > 0
                ? `총 ${ownedGiftCount.toLocaleString()}개로 ${ownedGiftExp.toLocaleString()} EXP를 얻을 수 있어요.`
                : "재화 플래너에 등록된 보유 선물이 없어요."}
            </p>
          </div>
          <Button
            text="선물 계획으로 저장"
            variant="primary"
            size="sm"
            className="shrink-0"
            disabled={!canSaveOwnedGiftPlan}
            onClick={onSaveOwnedGiftPlan}
          />
        </div>
      ) : null}
    </section>
  );
}
