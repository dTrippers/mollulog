import { ArrowPathIcon } from "@heroicons/react/16/solid";
import type Decimal from "decimal.js";
import { Button, Section, Toggle } from "~/components/primitives";
import type { Stage } from "~/domain/event-shop";
import { treasureHuntLocale } from "~/locales/ko";
import type { ShopActions, ShopState } from "./hooks";
import { StageCard } from "./StageCard";

type StagesProps = {
  stages: Stage[];
  appliedBonusRatio: Record<string, Decimal>;
  stageRuns: Record<string, number>;
  state: ShopState;
  actions: ShopActions;
  treasureHuntStatus?: "pending" | "provisional" | "failed" | "round-limit";
  onRetryTreasureHunt?: () => void;
};

export function StageSelector({
  stages,
  appliedBonusRatio,
  stageRuns,
  state,
  actions,
  treasureHuntStatus,
  onRetryTreasureHunt,
}: StagesProps) {
  const sweepStages = stages.filter(({ difficulty }) => difficulty === 1);
  if (sweepStages.length === 0) {
    return null;
  }

  return (
    <Section
      title="스테이지 소탕 계획"
      description="스테이지를 선택하고 최적화된 소탕 계획을 세워보세요"
      collapsible
      persistenceKey="event-shop-section::stage-selector"
      defaultExpanded={true}
    >
      <Toggle
        label="스토리/퀘스트 1회 씩 클리어 (초회 보상 반영)"
        initialState={state.includeFirstClear}
        onChange={actions.setIncludeFirstClear}
      />

      {treasureHuntStatus && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {treasureHuntStatus === "provisional" ? (
            <>
              <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>{treasureHuntLocale.provisionalResult}</span>
            </>
          ) : treasureHuntStatus === "pending" ? (
            <>
              <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>{treasureHuntLocale.calculating}</span>
            </>
          ) : treasureHuntStatus === "round-limit" ? (
            <span role="alert">{treasureHuntLocale.roundLimitResult}</span>
          ) : (
            <>
              <span role="alert">{treasureHuntLocale.failedResult}</span>
              <Button text={treasureHuntLocale.retry} size="sm" variant="secondary" onClick={onRetryTreasureHunt} />
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {sweepStages.map((stage) => (
          <StageCard
            key={stage.uid}
            stage={stage}
            isEnabled={!!state.enabledStages[stage.uid]}
            calculatedRuns={stageRuns[stage.uid] || 0}
            extraRuns={state.extraStageRuns[stage.uid] || 0}
            appliedBonusRatio={appliedBonusRatio}
            onToggleStage={actions.toggleStage}
            onChangeExtraRuns={actions.updateExtraRuns}
          />
        ))}
      </div>
    </Section>
  );
}
