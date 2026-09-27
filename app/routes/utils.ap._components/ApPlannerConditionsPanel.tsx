import { BoltIcon, Cog6ToothIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { BottomSheet, Button, Callout, NumberInput, PanelActionRow, PanelBody } from "~/components/primitives";
import type { ApPlannerState } from "~/domain/ap-planner";
import { cafeProduction, comfortMaximum, formatCafeApPerHour, maxApForAccountLevel } from "~/domain/ap-planner";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";

export type ApConditionField = "accountLevel" | "cafeRank" | "comfort" | "apChargeCount";

type Props = {
  state: ApPlannerState;
  options: PyroxenePlannerOptions;
  disabled?: boolean;
  onSave: (field: ApConditionField, value: number | null) => void;
};

export default function ApPlannerConditionsPanel({ state, options, disabled = false, onSave }: Props) {
  const [activeField, setActiveField] = useState<ApConditionField | null>(null);
  const [numberValue, setNumberValue] = useState<number | null>(null);

  useEffect(() => {
    if (activeField === "accountLevel") setNumberValue(state.accountLevel);
    if (activeField === "cafeRank") setNumberValue(state.cafeRank);
    if (activeField === "comfort") setNumberValue(state.comfort);
    if (activeField === "apChargeCount") setNumberValue(options.consumption.apChargeCount);
  }, [activeField, options.consumption.apChargeCount, state.accountLevel, state.cafeRank, state.comfort]);

  const rows: Array<{ field: ApConditionField; title: string; description: string }> = [
    {
      field: "accountLevel",
      title: "계정 레벨",
      description:
        state.accountLevel === null
          ? "입력해주세요"
          : `Lv.${state.accountLevel} · 최대 AP ${maxApForAccountLevel(state.accountLevel)}`,
    },
    {
      field: "cafeRank",
      title: "카페 랭크",
      description:
        state.cafeRank === null
          ? "입력해주세요"
          : `랭크 ${state.cafeRank} · 보관 최대 ${cafeProduction(state.cafeRank, state.comfort).storageMax}`,
    },
    {
      field: "comfort",
      title: "편의성",
      description:
        state.cafeRank === null || state.comfort === null
          ? "카페 랭크를 입력해주세요"
          : `${state.comfort.toLocaleString()}${state.comfort === comfortMaximum(state.cafeRank) ? " (랭크 최대)" : ` / 최대 ${comfortMaximum(state.cafeRank).toLocaleString()}`} · 시간당 약 ${formatCafeApPerHour(state.cafeRank, state.comfort)} AP`,
    },
    {
      field: "apChargeCount",
      title: "매일 AP 충전",
      description: `매일 ${options.consumption.apChargeCount}회 · 청휘석 플래너와 같은 설정${options.consumption.apChargeExceptions.length > 0 ? ` · 예외 ${options.consumption.apChargeExceptions.length}건` : ""}`,
    },
  ];

  const sheetTitle = activeField
    ? (rows.find((row) => row.field === activeField)?.title ?? "플레이 조건")
    : "플레이 조건";
  const maxValue =
    activeField === "accountLevel"
      ? 90
      : activeField === "cafeRank"
        ? 10
        : activeField === "comfort"
          ? state.cafeRank === null
            ? 0
            : comfortMaximum(state.cafeRank)
          : 20;

  return (
    <>
      <PanelBody>
        <div className="space-y-0.5">
          {rows.map(({ field, title, description }) => (
            <PanelActionRow
              key={field}
              title={title}
              description={description}
              className="rounded-md px-1.5 transition-colors hover:bg-muted/70"
              actions={
                <Button
                  size="xs"
                  variant="secondary"
                  className="size-7 px-0 py-0"
                  disabled={disabled || (field === "comfort" && state.cafeRank === null)}
                  onClick={() => setActiveField(field)}
                >
                  <span className="inline-flex items-center">
                    <Cog6ToothIcon aria-hidden="true" className="size-4" />
                    <span className="sr-only">{title} 설정</span>
                  </span>
                </Button>
              }
            />
          ))}
        </div>
      </PanelBody>
      {activeField ? (
        <BottomSheet
          Icon={activeField === "apChargeCount" ? BoltIcon : Cog6ToothIcon}
          title={sheetTitle}
          fitContent
          onClose={() => setActiveField(null)}
          footer={
            <Button
              text="저장"
              variant="primary"
              fullWidth
              disabled={disabled || numberValue === undefined}
              onClick={() => {
                onSave(activeField, numberValue);
                setActiveField(null);
              }}
            />
          }
        >
          <div className="space-y-3">
            {activeField === "apChargeCount" ? (
              <>
                <p className="text-sm text-muted-foreground">청휘석 플래너의 매일 AP 충전 횟수와 같은 값을 사용해요.</p>
                <NumberInput
                  label="매일 충전 횟수"
                  value={numberValue ?? options.consumption.apChargeCount}
                  minValue={0}
                  maxValue={20}
                  size="md"
                  onChange={setNumberValue}
                />
              </>
            ) : (
              <>
                {activeField === "accountLevel" ? (
                  <p className="text-sm text-muted-foreground">계정 레벨을 입력해주세요.</p>
                ) : null}
                {activeField === "cafeRank" ? (
                  <p className="text-sm text-muted-foreground">
                    카페 랭크를 입력해주세요. 처음 설정하면 편의성은 랭크 최대값으로 설정돼요.
                  </p>
                ) : null}
                {activeField === "comfort" ? (
                  <p className="text-sm text-muted-foreground">
                    카페 랭크 {state.cafeRank}의 최대 편의성은{" "}
                    {comfortMaximum(state.cafeRank as number).toLocaleString()}
                    이에요. 시간당 AP는 추정치예요.
                  </p>
                ) : null}
                <NumberInput
                  label={sheetTitle}
                  nullable
                  value={numberValue}
                  minValue={activeField === "comfort" ? 0 : 1}
                  maxValue={maxValue}
                  showMax={activeField === "comfort"}
                  size="md"
                  onChange={setNumberValue}
                />
                {activeField === "comfort" && state.cafeRank !== null ? (
                  <p className="text-sm text-muted-foreground">
                    시간당 약 {formatCafeApPerHour(state.cafeRank, numberValue ?? comfortMaximum(state.cafeRank))} AP
                  </p>
                ) : null}
              </>
            )}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

export function ApPlannerConditionsPanelContent({
  ready,
  loading,
  ...panelProps
}: Props & { ready: boolean; loading: boolean }) {
  if (ready) return <ApPlannerConditionsPanel {...panelProps} />;
  if (loading) {
    return (
      <div role="status" className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
        플레이 조건을 불러오고 있어요.
      </div>
    );
  }
  return <Callout tone="destructive" title="플레이 조건을 불러오지 못했어요." />;
}
