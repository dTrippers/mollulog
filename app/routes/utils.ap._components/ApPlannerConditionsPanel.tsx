import type { ApPlannerState } from "~/domain/ap-planner";
import { cafeProduction, comfortMaximum, formatCafeApPerHour, maxApForAccountLevel } from "~/domain/ap-planner";
import { PanelActionRow, PanelBody } from "~/components/primitives";
import { calculateDailyApChargePyroxene } from "~/domain/pyroxene-sources";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { Link } from "react-router";

type Props = {
  state: ApPlannerState;
  options: PyroxenePlannerOptions;
  apPackageSummary: string;
};

export default function ApPlannerConditionsPanel({ state, options, apPackageSummary }: Props) {
  const tacticalApShopCount = state.tacticalApShopCount ?? 0;
  const cafeSummary =
    state.cafeRank === null
      ? "입력해주세요"
      : `랭크 ${state.cafeRank} · 보관 최대 ${cafeProduction(state.cafeRank, state.comfort).storageMax}`;
  const effectiveComfort = state.cafeRank === null ? null : (state.comfort ?? comfortMaximum(state.cafeRank));
  const comfortSummary =
    state.cafeRank === null || effectiveComfort === null
      ? "카페 랭크를 입력해주세요"
      : `${effectiveComfort.toLocaleString()} / ${comfortMaximum(state.cafeRank).toLocaleString()} · 시간당 약 ${formatCafeApPerHour(state.cafeRank, effectiveComfort)} AP`;

  return (
    <PanelBody>
      <div className="space-y-0.5">
        <PanelActionRow
          title="계정 레벨"
          description={
            state.accountLevel === null
              ? "입력해주세요"
              : `${state.accountLevel} · 최대 AP ${maxApForAccountLevel(state.accountLevel)}`
          }
          actions={null}
          className="rounded-md px-1.5"
        />
        <PanelActionRow title="카페 랭크" description={cafeSummary} actions={null} className="rounded-md px-1.5" />
        <PanelActionRow title="카페 쾌적도" description={comfortSummary} actions={null} className="rounded-md px-1.5" />
        <PanelActionRow
          title="전술 대회 AP 구매"
          description={
            tacticalApShopCount === 0
              ? "구매 안 함"
              : `하루 ${tacticalApShopCount}회 · ${tacticalApShopCount * 90} AP`
          }
          actions={null}
          className="rounded-md px-1.5"
        />
        <PanelActionRow
          title="2주 AP 패키지"
          description={apPackageSummary}
          actions={
            <Link
              className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              to="/utils/pyroxene"
            >
              청휘석 플래너
            </Link>
          }
          className="rounded-md px-1.5"
        />
        <PanelActionRow
          title="매일 AP 충전"
          description={`${options.consumption.apChargeCount}회 · 청휘석 하루 ${calculateDailyApChargePyroxene(options.consumption.apChargeCount).toLocaleString()}개${options.consumption.apChargeExceptions.length > 0 ? ` · 예외 ${options.consumption.apChargeExceptions.length}건` : ""}`}
          actions={null}
          className="rounded-md px-1.5"
        />
      </div>
    </PanelBody>
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
      <div role="status" aria-label="플레이 조건을 불러오고 있어요">
        <span className="sr-only">플레이 조건을 불러오고 있어요</span>
        <PanelBody>
          <div className="space-y-0.5">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div
                key={row}
                aria-hidden="true"
                className="flex min-h-8 items-center gap-2 rounded-md px-1.5 py-1.5 lg:min-h-7 lg:gap-1.5"
              >
                <div className="min-w-0 grow space-y-0.5">
                  <div className="h-5 w-24 rounded bg-muted" />
                  <div className="h-4 w-40 max-w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </PanelBody>
      </div>
    );
  }
  return (
    <p role="status" className="text-sm text-destructive">
      플레이 조건을 불러오지 못했어요.
    </p>
  );
}
