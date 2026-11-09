import { InformationCircleIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useId } from "react";
import {
  getOfferedPickupChanceOptions,
  getPyroxeneRuleLabel,
  type PyroxeneCalculationAssumptions,
  RECRUITMENT_PERK_TEN_PULL_THRESHOLDS,
} from "~/domain/pyroxene-assumptions";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import { cn } from "~/lib/utils";
import { Button } from "../../primitives/Button";
import { PlannerDialog } from "./pyroxene-ui";

export const PICKUP_BASIS_SHORT_LABELS: Record<PyroxenePickupChance, string> = {
  average: "평균",
  average_pity: "평균+천장",
  ceil: "천장",
};

/** Single choice built on native radios, so arrow keys and form semantics come from the browser. */
export function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "segmented",
}: {
  label: string;
  options: { value: T; label: ReactNode; className?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  variant?: "segmented" | "tiles";
}) {
  const name = useId();
  return (
    <fieldset
      className={cn(variant === "segmented" ? "flex gap-0.5 rounded-md bg-v2-inset p-0.5" : "grid grid-cols-4 gap-1.5")}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex flex-1 cursor-pointer items-center justify-center gap-0.5 rounded font-medium whitespace-nowrap has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-v2-focus",
              variant === "segmented" ? "min-h-7 px-2 text-xs" : "min-h-9 rounded-md text-sm font-semibold",
              variant === "segmented"
                ? selected
                  ? "bg-v2-surface text-v2-fg shadow-sm"
                  : "text-v2-fg-secondary hover:text-v2-fg"
                : selected
                  ? "bg-v2-selected text-v2-on-selected"
                  : "bg-v2-inset text-v2-fg hover:bg-v2-filled-hover",
              option.className,
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}

export function PickupBasisPanel({
  value,
  initialValue,
  onChange,
}: {
  value: PyroxenePickupChance;
  // The basis the page loaded with. A deprecated basis in use then stays offered for the visit,
  // so switching away by mistake can be undone.
  initialValue: PyroxenePickupChance;
  onChange: (value: PyroxenePickupChance) => void;
}) {
  const basisOptions = getOfferedPickupChanceOptions([value, initialValue]).map((option) => ({
    value: option.value,
    label: PICKUP_BASIS_SHORT_LABELS[option.value],
  }));
  // Each basis is explained in the calculation method dialog, opened from the panel header.
  return <SegmentedChoice label="계산 기준" options={basisOptions} value={value} onChange={onChange} />;
}

/** Opens the calculation method dialog from the basis panel header. */
export function CalculationMethodButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick}>
      <InformationCircleIcon className="size-3.5" aria-hidden="true" />
      계산 방식
    </Button>
  );
}

const legacyRuleDescription = "개편 전 규칙에서는 200회마다 픽업 학생과 교환할 수 있다고 보고 계산해요.";
const reworkRuleDescription =
  "개편 후 규칙에서는 픽업 학생이 나오기 전까지 100회째 모집에서 50% 확률로, 200회째 모집에서 반드시 픽업 학생을 얻어요. 픽업 학생을 얻지 못한 스택은 같은 종류의 다음 모집으로 이어져요.";

export function CalculationMethodDialog({
  open,
  onClose,
  assumptions,
}: {
  open: boolean;
  onClose: () => void;
  assumptions: PyroxeneCalculationAssumptions;
}) {
  const rule = assumptions.recruitmentRule;
  const ruleLabel = getPyroxeneRuleLabel(rule);
  return (
    <PlannerDialog open={open} title="계산 방식" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm break-keep">
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-v2-fg">
            모집 규칙{ruleLabel ? <span className="ml-1.5 text-xs font-medium text-v2-accent">{ruleLabel}</span> : null}
          </h3>
          <div className="flex flex-col gap-1 text-v2-fg-secondary">
            {rule.kind === "none" ? <p>계산할 픽업 모집이 아직 없어요.</p> : null}
            {rule.kind === "mixed" ? <p>{rule.firstReworkEventName}부터 개편 후 규칙으로 계산해요.</p> : null}
            {rule.kind === "legacy" || rule.kind === "mixed" ? <p>{legacyRuleDescription}</p> : null}
            {rule.kind === "rework" || rule.kind === "mixed" ? <p>{reworkRuleDescription}</p> : null}
          </div>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-v2-fg">계산 기준</h3>
          <ul className="flex flex-col gap-1.5 text-v2-fg-secondary">
            {getOfferedPickupChanceOptions([assumptions.pickupChance]).map(({ value, label, description }) => (
              <li key={value}>
                <span className="font-medium text-v2-fg">{label}</span>
                {value === assumptions.pickupChance ? (
                  <span className="ml-1.5 text-xs text-v2-accent">사용 중</span>
                ) : null}
                <span className="block text-xs">{description}</span>
              </li>
            ))}
          </ul>
          <p className="text-v2-fg-secondary">
            목표 학생은 목표 성급까지 필요한 횟수로 계산해요. 이벤트에서 직접 입력한 횟수가 있으면 그 횟수를 써요.
          </p>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-v2-fg">예상 범위</h3>
          <p className="text-v2-fg-secondary">
            {assumptions.showsRange
              ? "상하위 10% 이내는 모집 운이 좋은 경우(상위 10%)부터 나쁜 경우(하위 10%)까지의 범위예요. 실제 결과가 이 범위를 벗어날 확률은 약 20%예요."
              : "천장 기준은 천장까지 모집하는 경우만 계산하므로 범위를 표시하지 않아요."}
          </p>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-v2-fg">모집 특전과 무료 모집</h3>
          <div className="flex flex-col gap-1 text-v2-fg-secondary">
            {assumptions.recruitmentPerks ? (
              <p>
                개편 후 규칙 모집에서는 누적 {RECRUITMENT_PERK_TEN_PULL_THRESHOLDS.join(", ")}회째에 받는 10회 모집권을
                바로 쓴다고 보고 계산해요.
              </p>
            ) : null}
            {assumptions.freeRecruitment ? (
              <p>무료 모집이 있는 이벤트는 무료 모집 횟수만큼 청휘석을 덜 쓰는 것으로 계산해요.</p>
            ) : null}
            {!assumptions.recruitmentPerks && !assumptions.freeRecruitment ? (
              <p>지금 일정에는 모집 특전이나 무료 모집이 없어요.</p>
            ) : null}
          </div>
        </section>
      </div>
    </PlannerDialog>
  );
}
