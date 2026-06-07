import { ArchiveBoxIcon, BeakerIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { EmptyView, Input } from "~/components/primitives";
import { cn } from "~/lib/utils";
import {
  type FarmingDifficultyFilter,
  type FarmingRequirement,
  type FarmingStage,
  buildFarmingRecommendations,
} from "~/models/farming-recommendation";
import { EQUIPMENT_TYPE_LABELS, getEquipmentTierLabel, getEquipmentTypeKey } from "~/models/growth-resource";

type FarmingRecommendationPanelProps = {
  managedStudentCount: number;
  farmingNeeded: Record<string, number>;
  farmingRequirements: FarmingRequirement[];
  stages: FarmingStage[];
};

const difficultyOptions = [
  { value: "all", label: "전체" },
  { value: "normal", label: "노말" },
  { value: "hard", label: "하드" },
] as const satisfies { value: FarmingDifficultyFilter; label: string }[];

export default function FarmingRecommendationPanel({
  managedStudentCount,
  farmingNeeded,
  farmingRequirements,
  stages,
}: FarmingRecommendationPanelProps) {
  const [difficulty, setDifficulty] = useState<FarmingDifficultyFilter>("all");
  const [dropMultiplierInput, setDropMultiplierInput] = useState("1");
  const dropMultiplier = parseDropMultiplier(dropMultiplierInput);
  const recommendations = useMemo(
    () => buildFarmingRecommendations(farmingNeeded, stages, { difficulty, dropMultiplier }),
    [difficulty, dropMultiplier, farmingNeeded, stages],
  );

  if (managedStudentCount === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-8">
        <EmptyView
          Icon={ClipboardDocumentListIcon}
          text="관리 중인 학생이 없어요"
          description="성장 목표 탭에서 학생을 추가하면 필요한 장비 설계도를 기준으로 파밍 스테이지를 계산할 수 있어요."
        />
      </div>
    );
  }

  if (farmingRequirements.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-8">
        <EmptyView
          Icon={ArchiveBoxIcon}
          text="파밍이 필요한 장비 설계도가 없어요"
          description="관리 중인 학생들의 장비 설계도 필요량이 이미 보유량으로 충족되어 있어요."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-card p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">추천 조건</p>
            <p className="mt-1 text-sm text-muted-foreground">
              파밍 필요 설계도 {farmingRequirements.length.toLocaleString()}종을 기준으로 반복 장비 드랍을 계산합니다.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">난이도</p>
              <div className="inline-flex rounded-md border border-border bg-muted p-1">
                {difficultyOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      difficulty === option.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={difficulty === option.value}
                    onClick={() => setDifficulty(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.1"
              label="드랍 배율"
              value={dropMultiplierInput}
              onChange={setDropMultiplierInput}
              containerClassName="sm:w-36"
              className="max-w-none"
            />
          </div>
        </div>
      </div>

      {recommendations.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8">
          <EmptyView
            Icon={BeakerIcon}
            text="조건에 맞는 추천 스테이지가 없어요"
            description="난이도 필터를 바꾸거나 BAQL 스테이지 드랍 데이터가 있는지 확인해 주세요."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((recommendation) => (
            <StageRecommendationRow key={recommendation.stage.uid} recommendation={recommendation} />
          ))}
        </div>
      )}
    </div>
  );
}

function StageRecommendationRow({
  recommendation,
}: {
  recommendation: ReturnType<typeof buildFarmingRecommendations>[number];
}) {
  const { stage, score, matches } = recommendation;

  return (
    <article className="rounded-md border border-border bg-card p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{formatStageLabel(stage)}</h2>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {formatDifficulty(stage.difficulty)}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              AP {stage.apCost.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{stage.name}</p>
        </div>
        <div className="text-left lg:text-right">
          <p className="text-xs font-medium text-muted-foreground">점수</p>
          <p className="text-lg font-semibold text-foreground">{formatScore(score)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {matches.map((match) => (
          <div key={match.uid} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {formatEquipmentLabel(match.uid, match.name)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">필요 {match.needed.toLocaleString()}개</p>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {formatProbability(match.probability)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function parseDropMultiplier(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function formatStageLabel(stage: FarmingStage): string {
  return `${stage.area}-${stage.stageNumber}`;
}

function formatDifficulty(difficulty: number): string {
  if (difficulty === 0) return "노말";
  if (difficulty === 1) return "하드";
  return `난이도 ${difficulty}`;
}

function formatScore(score: number): string {
  return score.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatProbability(probability: number): string {
  const percent = probability <= 1 ? probability * 100 : probability;
  return `${percent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function formatEquipmentLabel(uid: string, name: string | undefined): string {
  const typeKey = getEquipmentTypeKey(uid);
  const tierLabel = getEquipmentTierLabel(uid);
  const fallback = typeKey && tierLabel ? `${EQUIPMENT_TYPE_LABELS[typeKey] ?? typeKey} ${tierLabel}` : uid;
  return name && name.length > 0 ? name : fallback;
}
