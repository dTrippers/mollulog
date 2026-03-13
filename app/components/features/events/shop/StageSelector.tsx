import type Decimal from "decimal.js";
import { Toggle } from "~/components/atoms/form";
import { StageCard } from "./StageCard";
import type { Stage } from "./types";
import type { ShopState, ShopActions } from "./hooks";
import { Section } from "~/components/ui";

type StagesProps = {
  stages: Stage[];
  appliedBonusRatio: Record<string, Decimal>;
  stageRuns: Record<string, number>;
  state: ShopState;
  actions: ShopActions;
}

export function StageSelector({ stages, appliedBonusRatio, stageRuns, state, actions }: StagesProps) {
  return (
    <>
      <Section
        title="스테이지 소탕 계획"
        description="스테이지를 선택하고 최적화된 소탕 계획을 세워보세요"
        foldable border={false}
        foldStateKey="event-shop-section::stage-selector"
        defaultExpanded={true}
      >
        <Toggle label="스토리/퀘스트 1회 씩 클리어 (초회 보상 반영)" initialState={state.includeFirstClear} onChange={actions.setIncludeFirstClear} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {stages.filter(({ difficulty }) => difficulty === 1).map((stage) => (
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
    </>
  );
}
