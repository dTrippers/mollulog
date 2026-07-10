import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Field, FilterButtons, Input, NumberInput } from "~/components/primitives";
import {
  PYROXENE_AP_PACKAGE_CONFIG,
  PYROXENE_MONTHLY_PACKAGE_CONFIG,
  type PyroxeneMonthlyPackageType,
  calculatePackageStartDateFromRemainingDays,
} from "~/domain/pyroxene-sources";
import dayjs from "~/lib/dayjs";

type PackageInputProps = {
  onSavePackage: (startDate: Date, packageType: PyroxeneMonthlyPackageType, autoRepurchase: boolean) => void;
  disabled?: boolean;
};

type ApPackageInputProps = {
  onSavePackage: (startDate: Date, autoRepurchase: boolean) => void;
  disabled?: boolean;
};

type PackageStartDateInputProps = {
  packageDurationDays: number;
  startDate: Date;
  onStartDateChange: (startDate: Date) => void;
};

type PackageStartDateInputMode = "date" | "remainingDays";

function clampRemainingDays(remainingDays: number, packageDurationDays: number) {
  return Math.max(0, Math.min(packageDurationDays - 1, Math.floor(remainingDays)));
}

function PackageStartDateInput({ packageDurationDays, startDate, onStartDateChange }: PackageStartDateInputProps) {
  const [inputMode, setInputMode] = useState<PackageStartDateInputMode>("date");
  const [remainingDays, setRemainingDays] = useState(packageDurationDays - 1);
  const calculatedStartDate = useMemo(
    () => calculatePackageStartDateFromRemainingDays(remainingDays, packageDurationDays),
    [remainingDays, packageDurationDays],
  );

  useEffect(() => {
    if (inputMode === "remainingDays") {
      onStartDateChange(calculatedStartDate);
    }
  }, [calculatedStartDate, inputMode, onStartDateChange]);

  return (
    <div className="space-y-3">
      <Field label="패키지 시작 날짜">
        <FilterButtons
          size="sm"
          exclusive
          atLeastOne
          buttonProps={[
            {
              text: "직접 입력",
              active: inputMode === "date",
              onToggle: (activated) => {
                if (activated) {
                  setInputMode("date");
                }
              },
            },
            {
              text: "남은 날짜 입력",
              active: inputMode === "remainingDays",
              onToggle: (activated) => {
                if (activated) {
                  setInputMode("remainingDays");
                  onStartDateChange(calculatedStartDate);
                }
              },
            },
          ]}
        />
      </Field>
      {inputMode === "date" ? (
        <Input
          type="date"
          size="sm"
          value={dayjs(startDate).tz("Asia/Seoul").format("YYYY-MM-DD")}
          onChange={(value) => onStartDateChange(new Date(value))}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            패키지 구매 화면의 적용 효과 종료까지 남은 날짜를 입력해주세요.
          </p>
          <NumberInput
            size="sm"
            minValue={0}
            maxValue={packageDurationDays - 1}
            value={remainingDays}
            showDecrease={false}
            showIncrease={false}
            onChange={(value) => {
              setRemainingDays(clampRemainingDays(value, packageDurationDays));
            }}
          />
          <p className="text-xs text-muted-foreground">
            {dayjs(calculatedStartDate).tz("Asia/Seoul").format("YYYY-MM-DD")} 패키지 시작
          </p>
        </div>
      )}
    </div>
  );
}

export default function PackageInput({ onSavePackage, disabled = false }: PackageInputProps) {
  const [packageType, setPackageType] = useState<PyroxeneMonthlyPackageType>("full");
  const [startDate, setStartDate] = useState(new Date());
  const [autoRepurchase, setAutoRepurchase] = useState(false);
  const packageDurationDays = PYROXENE_MONTHLY_PACKAGE_CONFIG[packageType].repurchaseIntervalDays;

  return (
    <>
      <p className="mb-2 text-sm text-neutral-500">청휘석 패키지의 구매 정보를 입력해주세요</p>
      <div className="space-y-4">
        <Field label="패키지 종류">
          <FilterButtons
            size="sm"
            exclusive
            atLeastOne
            buttonProps={[
              {
                text: "월간",
                active: packageType === "full",
                onToggle: (activated) => {
                  if (activated) {
                    setPackageType("full");
                  }
                },
              },
              {
                text: "하프",
                active: packageType === "half",
                onToggle: (activated) => {
                  if (activated) {
                    setPackageType("half");
                  }
                },
              },
            ]}
          />
        </Field>
        <PackageStartDateInput
          packageDurationDays={packageDurationDays}
          startDate={startDate}
          onStartDateChange={setStartDate}
        />
        <Checkbox checked={autoRepurchase} onChange={setAutoRepurchase} label="만료 후 자동 재구매 처리" />
        <Button
          text="저장"
          variant="primary"
          fullWidth
          className="mt-2"
          disabled={disabled}
          onClick={() => onSavePackage(startDate, packageType, autoRepurchase)}
        />
      </div>
    </>
  );
}

export function ApPackageInput({ onSavePackage, disabled = false }: ApPackageInputProps) {
  const [startDate, setStartDate] = useState(new Date());
  const [autoRepurchase, setAutoRepurchase] = useState(false);
  const packageDurationDays = PYROXENE_AP_PACKAGE_CONFIG.repurchaseIntervalDays;

  return (
    <>
      <p className="mb-2 text-sm text-neutral-500">AP 패키지의 구매 정보를 입력해주세요</p>
      <div className="space-y-4">
        <PackageStartDateInput
          packageDurationDays={packageDurationDays}
          startDate={startDate}
          onStartDateChange={setStartDate}
        />
        <Checkbox checked={autoRepurchase} onChange={setAutoRepurchase} label="만료 후 자동 재구매 처리" />
        <Button
          text="저장"
          variant="primary"
          fullWidth
          className="mt-2"
          disabled={disabled}
          onClick={() => onSavePackage(startDate, autoRepurchase)}
        />
      </div>
    </>
  );
}
