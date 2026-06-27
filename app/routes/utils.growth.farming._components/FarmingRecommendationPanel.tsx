import { BoltIcon } from "@heroicons/react/16/solid";
import { ArchiveBoxIcon, BeakerIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { useMemo } from "react";
import { EmptyView, ResourceCard, SubTitle } from "~/components/primitives";
import { ResourceTypeEnum } from "~/graphql/graphql";
import {
  type FarmingRequirement,
  type FarmingStage,
  type FarmingStageRecommendation,
  buildFarmingRecommendations,
} from "~/domain/farming-recommendation";
import {
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_ORDER,
  getEquipmentTierLabel,
  getEquipmentTypeKey,
} from "~/models/growth-resource";

type FarmingRecommendationPanelProps = {
  managedStudentCount: number;
  farmingNeeded: Record<string, number>;
  farmingRequirements: FarmingRequirement[];
  stages: FarmingStage[];
  showNormal: boolean;
  showHard: boolean;
  prioritizeHighTier: boolean;
};

export default function FarmingRecommendationPanel({
  managedStudentCount,
  farmingNeeded,
  farmingRequirements,
  stages,
  showNormal,
  showHard,
  prioritizeHighTier,
}: FarmingRecommendationPanelProps) {
  const filteredStages = useMemo(
    () => stages.filter((stage) => (showNormal && stage.difficulty === 0) || (showHard && stage.difficulty === 1)),
    [showHard, showNormal, stages],
  );
  const recommendations = useMemo(
    () => buildFarmingRecommendations(farmingNeeded, filteredStages, { prioritizeHighTier }),
    [farmingNeeded, filteredStages, prioritizeHighTier],
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
    <div className="space-y-3">
      <div>
        <SubTitle
          text="추천 파밍 임무"
          description="필요한 장비를 모으기 위해 소탕 우선순위를 추천해요. 우선순위는 판단 기준에 따라 다를 수 있으니 참고로만 사용해주세요."
        />
      </div>

      {recommendations.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8">
          <EmptyView Icon={BeakerIcon} text="'학생 성장 플래너'에서 목표를 입력하거나 난이도를 선택해주세요" />
        </div>
      ) : (
        <div className="space-y-2">
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
  recommendation: FarmingStageRecommendation;
}) {
  const { stage, drops } = recommendation;
  const dropGroups = groupDropsByEquipmentType(drops);

  return (
    <article className="flex flex-col gap-3 rounded-md border border-border bg-card px-4 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 lg:w-52">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{formatStageLabel(stage)}</h2>
          <span className="flex items-center gap-0.5 rounded border border-green-600 px-1 text-xs font-medium text-green-600">
            <BoltIcon className="size-2.5" />
            <span>{stage.apCost.toLocaleString()}</span>
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{stage.name}</p>
      </div>

      <div className="flex flex-1 flex-wrap gap-2">
        {dropGroups.map((group) => (
          <section key={group.typeKey} className="grid min-w-0 gap-1 rounded-md bg-background px-2 py-1.5">
            <h3 className="text-xs font-semibold leading-none text-foreground">{group.label}</h3>
            <div className="flex flex-wrap gap-1">
              {group.drops.map((drop) => (
                <ResourceCard
                  key={drop.uid}
                  itemUid={drop.uid}
                  resourceType={ResourceTypeEnum.Equipment}
                  name={formatEquipmentLabel(drop.uid, drop.name)}
                  label={formatEquipmentTierBadge(drop.uid)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

type EquipmentDropGroup = {
  typeKey: string;
  label: string;
  drops: FarmingStageRecommendation["drops"];
};

function groupDropsByEquipmentType(drops: FarmingStageRecommendation["drops"]): EquipmentDropGroup[] {
  const groups = new Map<string, EquipmentDropGroup>();

  for (const drop of drops) {
    const typeKey = getEquipmentTypeKey(drop.uid);
    if (!typeKey) {
      continue;
    }

    const group = groups.get(typeKey) ?? {
      typeKey,
      label: EQUIPMENT_TYPE_LABELS[typeKey] ?? typeKey,
      drops: [],
    };
    group.drops.push(drop);
    groups.set(typeKey, group);
  }

  return Array.from(groups.values()).sort((a, b) => {
    const typeDelta = getEquipmentTypeSortOrder(a.typeKey) - getEquipmentTypeSortOrder(b.typeKey);
    if (typeDelta !== 0) return typeDelta;

    return a.label.localeCompare(b.label);
  });
}

function getEquipmentTypeSortOrder(typeKey: string): number {
  const index = EQUIPMENT_TYPE_ORDER.indexOf(typeKey);
  return index === -1 ? EQUIPMENT_TYPE_ORDER.length : index;
}

function formatStageLabel(stage: FarmingStage): string {
  return `${formatDifficulty(stage.difficulty)} ${stage.area}-${stage.stageNumber}`;
}

function formatDifficulty(difficulty: number): string {
  if (difficulty === 0) return "노말";
  if (difficulty === 1) return "하드";
  return `난이도 ${difficulty}`;
}

function formatEquipmentTierBadge(uid: string): string | undefined {
  return getEquipmentTierLabel(uid) ?? undefined;
}

function formatEquipmentLabel(uid: string, name: string | undefined): string {
  const typeKey = getEquipmentTypeKey(uid);
  const tierLabel = getEquipmentTierLabel(uid);
  const fallback = typeKey && tierLabel ? `${EQUIPMENT_TYPE_LABELS[typeKey] ?? typeKey} ${tierLabel}` : uid;
  return name && name.length > 0 ? name : fallback;
}
