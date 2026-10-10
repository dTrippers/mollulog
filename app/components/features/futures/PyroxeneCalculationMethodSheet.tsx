import { CheckIcon } from "@heroicons/react/24/solid";
import { BottomSheet, Button } from "~/components/primitives";
import {
  getPyroxeneRuleLabel,
  PYROXENE_PICKUP_CHANCE_OPTIONS,
  type PyroxeneCalculationAssumptions,
  RECRUITMENT_PERK_TEN_PULL_THRESHOLDS,
} from "~/domain/pyroxene-assumptions";

const legacyRuleDescription = "개편 전 규칙에서는 200회마다 픽업 학생과 교환할 수 있다고 보고 계산해요.";
const reworkRuleDescription =
  "개편 후 규칙에서는 픽업 학생이 나오기 전까지 100회째 모집에서 50% 확률로, 200회째 모집에서 반드시 픽업 학생을 얻어요.";

type PyroxeneCalculationMethodContentProps = {
  assumptions: PyroxeneCalculationAssumptions;
  showRange: boolean;
  onChangePickupChance?: () => void;
  changePickupChanceTo?: string;
};

type PyroxeneCalculationMethodSheetProps = PyroxeneCalculationMethodContentProps & {
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  description: string;
};

function RuleDescriptions({ rule }: { rule: PyroxeneCalculationAssumptions["recruitmentRule"] }) {
  if (rule.kind === "none") return <p>계산할 픽업 모집이 아직 없어요.</p>;
  if (rule.kind === "legacy") return <p>{legacyRuleDescription}</p>;
  if (rule.kind === "rework") return <p>{reworkRuleDescription}</p>;
  return (
    <>
      <p>{rule.firstReworkEventName}부터 개편 후 규칙으로 계산해요.</p>
      <p>{legacyRuleDescription}</p>
      <p>{reworkRuleDescription}</p>
    </>
  );
}

export function PyroxeneCalculationMethodContent({
  assumptions,
  showRange,
  onChangePickupChance,
  changePickupChanceTo,
}: PyroxeneCalculationMethodContentProps) {
  const ruleLabel = getPyroxeneRuleLabel(assumptions.recruitmentRule);

  return (
    <div className="space-y-5 break-keep pb-4 text-sm">
      <section className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <h3 className="font-semibold">모집 규칙</h3>
          {ruleLabel ? <span className="whitespace-nowrap text-xs font-medium text-primary">{ruleLabel}</span> : null}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <RuleDescriptions rule={assumptions.recruitmentRule} />
        </div>
      </section>

      <section className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">★3 학생 모집 목표</h3>
          {changePickupChanceTo ? (
            <Button
              text="청휘석 플래너에서 변경"
              to={changePickupChanceTo}
              size="xs"
              variant="default"
              className="shrink-0"
            />
          ) : (
            <Button text="변경" onClick={onChangePickupChance} size="xs" variant="default" className="shrink-0" />
          )}
        </div>
        <ul className="space-y-2 text-muted-foreground">
          {PYROXENE_PICKUP_CHANCE_OPTIONS.map(({ label, value, description: optionDescription }) => {
            const selected = value === assumptions.pickupChance;
            return (
              <li key={value} aria-current={selected ? "true" : undefined} className="flex items-start gap-2">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  {selected ? <CheckIcon className="size-4 text-primary" aria-hidden="true" /> : null}
                </span>
                <span className="min-w-0 space-y-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-foreground">{label}</span>
                    {selected ? <span className="text-xs text-primary">사용 중</span> : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">{optionDescription}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground">이벤트에 예상 모집 횟수를 직접 입력했다면 그 횟수로 계산해요.</p>
      </section>

      {showRange ? (
        <section className="space-y-1">
          <h3 className="font-semibold">예상 범위</h3>
          <p className="text-muted-foreground">
            {assumptions.showsRange
              ? "그래프의 음영은 모집 운이 좋은 경우(상위 10%)부터 나쁜 경우(하위 10%)까지예요. 실제 결과가 이 범위를 벗어날 확률은 약 20%예요."
              : "천장 모드는 천장까지 모집하는 경우만 계산하므로 범위를 표시하지 않아요."}
          </p>
        </section>
      ) : null}

      <section className="space-y-1">
        <h3 className="font-semibold">모집 특전과 무료 모집</h3>
        <div className="space-y-1 text-muted-foreground">
          {assumptions.recruitmentPerks ? (
            <p>
              개편 후 규칙 모집에서는 누적 {RECRUITMENT_PERK_TEN_PULL_THRESHOLDS.join(", ")}회째에 받는 10회 모집권을
              바로 쓴다고 보고 계산해요.
            </p>
          ) : null}
          {assumptions.freeRecruitment ? (
            <p>무료 모집 100회가 있는 이벤트는 그만큼 청휘석을 덜 쓰는 것으로 계산해요.</p>
          ) : null}
          {!assumptions.recruitmentPerks && !assumptions.freeRecruitment ? (
            <p>지금 일정에는 모집 특전이나 무료 모집이 없어요.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function PyroxeneCalculationMethodSheet({
  open,
  onClose,
  onExited,
  assumptions,
  showRange,
  description,
  onChangePickupChance,
  changePickupChanceTo,
}: PyroxeneCalculationMethodSheetProps) {
  return (
    <BottomSheet
      title="계산 방식"
      description={description}
      fitContent
      open={open}
      onClose={onClose}
      onExited={onExited}
    >
      <PyroxeneCalculationMethodContent
        assumptions={assumptions}
        showRange={showRange}
        onChangePickupChance={onChangePickupChance}
        changePickupChanceTo={changePickupChanceTo}
      />
    </BottomSheet>
  );
}
