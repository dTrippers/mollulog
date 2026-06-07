import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { buildEquipmentFarmingNeeded, buildEquipmentFarmingRequirements } from "~/models/farming-recommendation";
import { aggregateGrowthResourceRequirements } from "~/models/growth-resource";
import { getUserResourceInventoryMap } from "~/models/user-resource-inventory";
import { getCampaignFarmingStages } from "~/repositories/stage";
import type { GrowthLayoutContext } from "./utils.growth._components/types";
import FarmingRecommendationPanel from "./utils.growth.farming._components/FarmingRecommendationPanel";

export const meta: MetaFunction = () => [{ title: "장비 파밍 계산기 | 몰루로그" }];

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
  const { farmingStageFilter, managedStudents } = useOutletContext<GrowthLayoutContext>();
  const stageFilter = farmingStageFilter ?? {
    showNormal: true,
    showHard: false,
    prioritizeHighTier: false,
  };
  const aggregatedRequirements = aggregateGrowthResourceRequirements(
    managedStudents.map((student) => student.resourceRequirements),
  );
  const farmingNeeded = buildEquipmentFarmingNeeded(aggregatedRequirements, ownedQuantities);
  const farmingRequirements = buildEquipmentFarmingRequirements(aggregatedRequirements, ownedQuantities);

  return (
    <FarmingRecommendationPanel
      managedStudentCount={managedStudents.length}
      farmingNeeded={farmingNeeded}
      farmingRequirements={farmingRequirements}
      stages={stages}
      showNormal={stageFilter.showNormal}
      showHard={stageFilter.showHard}
      prioritizeHighTier={stageFilter.prioritizeHighTier}
    />
  );
}
