import { EyeIcon, EyeSlashIcon } from "@heroicons/react/16/solid";
import { ChartBarIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { PanelActionRow, PanelBody, PanelOptionChip } from "~/components/primitives";
import { buildEquipmentFarmingNeeded, buildEquipmentFarmingRequirements } from "~/domain/farming-recommendation";
import { aggregateGrowthResourceRequirements } from "~/domain/growth-resource";
import { getCampaignFarmingStages } from "~/models/stage";
import { getUserResourceInventoryMap } from "~/models/user-resource-inventory";
import FarmingRecommendationPanel from "./utils.growth.farming._components/FarmingRecommendationPanel";
import type { ResourcePlannerOutletContext } from "./utils.resources";
import { getFarmingCalculatorPageLinks } from "./utils.resources._components/resource-page-links";

export const meta: MetaFunction = () => [{ title: "파밍 계산기 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const [ownedQuantities, stages] = await Promise.all([
    getUserResourceInventoryMap(env, currentUser.id),
    getCampaignFarmingStages(env),
  ]);

  return { ownedQuantities, stages };
};

export default function ResourceFarmingPage() {
  const { ownedQuantities, stages } = useLoaderData<typeof loader>();
  const { farmingStageFilter, managedStudents, setFarmingSettings } =
    useOutletContext<ResourcePlannerOutletContext>();
  const stageFilter = farmingStageFilter ?? {
    showNormal: true,
    showHard: false,
    prioritizeHighTier: false,
  };
  const aggregatedRequirements = aggregateGrowthResourceRequirements(
    managedStudents.flatMap((student) => (student.resourceRequirements ? [student.resourceRequirements] : [])),
  );
  const farmingNeeded = buildEquipmentFarmingNeeded(aggregatedRequirements, ownedQuantities);
  const farmingRequirements = buildEquipmentFarmingRequirements(aggregatedRequirements, ownedQuantities);

  return (
    <Page
      title="파밍 계산기"
      description="필요 장비를 얻기 위한 스테이지를 확인해요"
      contentWidth="full"
      panels={[
        {
          title: "계산 설정",
          Icon: ChartBarIcon,
          children: (
            <FarmingPlannerSettingsPanel
              showNormal={stageFilter.showNormal}
              showHard={stageFilter.showHard}
              prioritizeHighTier={stageFilter.prioritizeHighTier}
              onShowNormalChange={(showNormal) => setFarmingSettings((prev) => ({ ...prev, showNormal }))}
              onShowHardChange={(showHard) => setFarmingSettings((prev) => ({ ...prev, showHard }))}
              onPrioritizeHighTierChange={(prioritizeHighTier) =>
                setFarmingSettings((prev) => ({ ...prev, prioritizeHighTier }))
              }
            />
          ),
        },
      ]}
      links={getFarmingCalculatorPageLinks()}
    >
      <FarmingRecommendationPanel
        managedStudentCount={managedStudents.length}
        farmingNeeded={farmingNeeded}
        farmingRequirements={farmingRequirements}
        stages={stages}
        showNormal={stageFilter.showNormal}
        showHard={stageFilter.showHard}
        prioritizeHighTier={stageFilter.prioritizeHighTier}
      />
    </Page>
  );
}

function FarmingPlannerSettingsPanel({
  showNormal,
  showHard,
  prioritizeHighTier,
  onShowNormalChange,
  onShowHardChange,
  onPrioritizeHighTierChange,
}: {
  showNormal: boolean;
  showHard: boolean;
  prioritizeHighTier: boolean;
  onShowNormalChange: (value: boolean) => void;
  onShowHardChange: (value: boolean) => void;
  onPrioritizeHighTierChange: (value: boolean) => void;
}) {
  return (
    <PanelBody className="space-y-2">
      <PanelActionRow
        title="스테이지 난이도"
        actions={
          <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
            <PanelOptionChip
              label="노말"
              active={showNormal}
              Icon={showNormal ? EyeIcon : EyeSlashIcon}
              onClick={() => onShowNormalChange(!showNormal)}
            />
            <PanelOptionChip
              label="하드"
              active={showHard}
              Icon={showHard ? EyeIcon : EyeSlashIcon}
              onClick={() => onShowHardChange(!showHard)}
            />
          </div>
        }
      />

      <PanelActionRow
        title="상위티어 우선"
        description="설계도 단가를 반영하여 계산해요"
        actions={
          <PanelOptionChip
            label="적용"
            active={prioritizeHighTier}
            Icon={prioritizeHighTier ? EyeIcon : EyeSlashIcon}
            onClick={() => onPrioritizeHighTierChange(!prioritizeHighTier)}
          />
        }
      />
    </PanelBody>
  );
}
