import { Cog6ToothIcon } from "@heroicons/react/16/solid";
import { useEffect, useId, useRef, useState } from "react";
import { BottomSheet, Button, NumberInput } from "~/components/primitives";
import type { ApPlannerState } from "~/domain/ap-planner";
import { cafeProduction, comfortMaximum, formatCafeApPerHour, maxApForAccountLevel } from "~/domain/ap-planner";
import { calculateDailyApChargePyroxene } from "~/domain/pyroxene-sources";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";

export type ApPlannerConditionValues = {
  accountLevel: number | null;
  cafeRank: number | null;
  comfort: number | null;
  tacticalApShopCount: number;
  apChargeCount: number;
};

type ApPlannerConditionDraftValues = Omit<ApPlannerConditionValues, "apChargeCount" | "tacticalApShopCount"> & {
  tacticalApShopCount: number | null;
  apChargeCount: number | null;
};

type Props = {
  open: boolean;
  state: ApPlannerState;
  options: PyroxenePlannerOptions;
  disabled?: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: ApPlannerConditionValues) => Promise<boolean> | boolean;
};

function getValues(state: ApPlannerState, options: PyroxenePlannerOptions): ApPlannerConditionValues {
  return {
    accountLevel: state.accountLevel,
    cafeRank: state.cafeRank,
    comfort: state.comfort,
    tacticalApShopCount: state.tacticalApShopCount ?? 0,
    apChargeCount: options.consumption.apChargeCount,
  };
}

export default function ApPlannerConditionsSheet({
  open,
  state,
  options,
  disabled = false,
  saving = false,
  error,
  onClose,
  onSave,
}: Props) {
  const [values, setValues] = useState<ApPlannerConditionDraftValues>(() => getValues(state, options));
  const [saveError, setSaveError] = useState<string | null>(null);
  const previousOpen = useRef(false);
  const helperId = useId();

  useEffect(() => {
    if (open && !previousOpen.current) {
      setValues(getValues(state, options));
      setSaveError(null);
    }
    previousOpen.current = open;
  }, [open, options, state]);

  const updateCafeRank = (cafeRank: number | null) => {
    setValues((current) => ({
      ...current,
      cafeRank,
      comfort:
        cafeRank === null
          ? null
          : current.cafeRank === null || current.comfort === null
            ? comfortMaximum(cafeRank)
            : Math.min(current.comfort, comfortMaximum(cafeRank)),
    }));
  };

  const helperText = {
    accountLevel: values.accountLevel === null ? null : `최대 AP ${maxApForAccountLevel(values.accountLevel)}`,
    cafeRank:
      values.cafeRank === null ? null : `보관 최대 ${cafeProduction(values.cafeRank, values.comfort).storageMax}`,
    comfort:
      values.cafeRank === null || values.comfort === null
        ? null
        : `시간당 약 ${formatCafeApPerHour(values.cafeRank, values.comfort)} AP`,
    tacticalApShopCount: "상점 1회에 30 AP + 60 AP · 하루 최대 4회",
    apChargeCount:
      values.apChargeCount === null
        ? null
        : `청휘석 하루 ${calculateDailyApChargePyroxene(values.apChargeCount).toLocaleString()}개${options.consumption.apChargeExceptions.length > 0 ? ` · 기간별 예외 ${options.consumption.apChargeExceptions.length}건은 청휘석 플래너에서 관리해요` : ""}`,
  };

  const handleSave = async () => {
    if (saving || disabled) return;
    setSaveError(null);
    try {
      if (await onSave({
        ...values,
        tacticalApShopCount: values.tacticalApShopCount ?? 0,
        apChargeCount: values.apChargeCount ?? 0,
      })) {
        onClose();
      }
    } catch {
      setSaveError("플레이 조건을 저장하지 못했어요. 입력값은 유지돼요. 다시 시도해주세요.");
    }
  };

  if (!open) return null;
  return (
    <BottomSheet
      Icon={Cog6ToothIcon}
      title="플레이 조건"
      fitContent
      onClose={onClose}
      footer={
        <Button text="저장" size="sm" variant="primary" fullWidth disabled={disabled || saving} onClick={handleSave} />
      }
    >
      <div className="min-w-0 space-y-4 pb-8 break-keep">
        {error || saveError ? (
          <p role="alert" className="text-sm text-destructive">
            {error || saveError}
          </p>
        ) : null}
        <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
          <div className="min-w-0">
            <NumberInput
              label="계정 레벨"
              aria-describedby={`${helperId}-account-level`}
              nullable
              fullWidth
              value={values.accountLevel}
              minValue={1}
              maxValue={90}
              showMax
              size="md"
              disabled={disabled || saving}
              onChange={(accountLevel) => setValues((current) => ({ ...current, accountLevel }))}
            />
            {helperText.accountLevel ? (
              <p id={`${helperId}-account-level`} className="mt-1 text-xs text-muted-foreground">
                {helperText.accountLevel}
              </p>
            ) : null}
          </div>
          <div className="min-w-0">
            <NumberInput
              label="카페 랭크"
              aria-describedby={`${helperId}-cafe-rank`}
              nullable
              fullWidth
              value={values.cafeRank}
              minValue={1}
              maxValue={10}
              showMax
              size="md"
              disabled={disabled || saving}
              onChange={updateCafeRank}
            />
            {helperText.cafeRank ? (
              <p id={`${helperId}-cafe-rank`} className="mt-1 text-xs text-muted-foreground">
                {helperText.cafeRank}
              </p>
            ) : null}
          </div>
          <div className="min-w-0">
            <NumberInput
              label="카페 쾌적도"
              aria-describedby={helperText.comfort ? `${helperId}-comfort` : undefined}
              nullable
              fullWidth
              value={values.comfort}
              minValue={0}
              maxValue={values.cafeRank === null ? 0 : comfortMaximum(values.cafeRank)}
              showMax
              size="md"
              disabled={disabled || saving || values.cafeRank === null}
              onChange={(comfort) => setValues((current) => ({ ...current, comfort }))}
            />
            {helperText.comfort ? (
              <p id={`${helperId}-comfort`} className="mt-1 text-xs text-muted-foreground">
                {helperText.comfort}
              </p>
            ) : null}
          </div>
          <div className="min-w-0">
            <NumberInput
              label="전술 대회 AP 구매"
              aria-describedby={`${helperId}-tactical-ap-shop-count`}
              nullable
              fullWidth
              value={values.tacticalApShopCount}
              minValue={0}
              maxValue={4}
              showMax
              size="md"
              disabled={disabled || saving}
              onChange={(tacticalApShopCount) => setValues((current) => ({ ...current, tacticalApShopCount }))}
            />
            <p id={`${helperId}-tactical-ap-shop-count`} className="mt-1 text-xs text-muted-foreground">
              {helperText.tacticalApShopCount}
            </p>
          </div>
          <div className="min-w-0">
            <NumberInput
              label="매일 AP 충전"
              aria-describedby={helperText.apChargeCount ? `${helperId}-ap-charge-count` : undefined}
              nullable
              fullWidth
              value={values.apChargeCount}
              minValue={0}
              maxValue={20}
              size="md"
              disabled={disabled || saving}
              onChange={(apChargeCount) => setValues((current) => ({ ...current, apChargeCount }))}
            />
            {helperText.apChargeCount ? (
              <p id={`${helperId}-ap-charge-count`} className="mt-1 text-xs text-muted-foreground">
                {helperText.apChargeCount}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
