import {
  type GuestPlannerImportPlan,
  type GuestPlannerImportResult,
  markPostgresGuestImportReceipt,
  runPostgresGuestPlannerImport,
} from "~/db/postgres/guest-pyroxene-import";
import type { PostgresPyroxeneOptions } from "~/db/postgres/pyroxene-planner";

export type { GuestPlannerImportPlan, GuestPlannerImportResult } from "~/db/postgres/guest-pyroxene-import";

export async function importGuestPlannerState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  plan: GuestPlannerImportPlan,
  options: PostgresPyroxeneOptions = {},
): Promise<GuestPlannerImportResult> {
  const plannerResult = await runPostgresGuestPlannerImport(env, userId, plan, options);
  const verified = [...plannerResult.verified];
  const failed = [...plannerResult.failed];
  for (const favorite of plan.favorites) {
    const item = {
      sourceId: favorite.sourceId,
      datasetId: favorite.datasetId,
      type: "favorite" as const,
      key: favorite.itemKey,
    };
    try {
      await favorite.run();
      await markPostgresGuestImportReceipt(env, userId, item.datasetId, item.type, item.key, options);
      verified.push(item);
    } catch {
      failed.push(item);
    }
  }
  return { verified, failed, revisionConflict: plannerResult.revisionConflict };
}
