import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { isStudentStateMaintenanceResult } from "~/components/features/student-state/StudentStateMaintenanceToast";
import {
  aggregateGrowthResourceRequirements,
  buildRelationshipGiftResourceRequirements,
  getEquipmentTypeKey,
} from "~/domain/growth-resource";
import { buildOcrInventoryCatalogResources, parseOcrInventoryResourceUid } from "~/domain/ocr-resource-identity";
import { studentStateMaintenanceActionResult } from "~/lib/student-state-cutover.server";
import { getGrowthPlannerCatalogResources, getItemCatalogResources } from "~/models/item-catalog";
import { getRelationshipLevels } from "~/models/relationship-level";
import {
  getUserResourceInventoryMap,
  parseUserResourceInventoryQuantity,
  upsertUserResourceInventories,
} from "~/models/user-resource-inventory";
import type { GrowthLayoutContext } from "./utils.growth._components/types";
import ResourceInventoryEditor from "./utils.resources._components/ResourceInventoryEditor";

type ResourceInventorySavePayload = {
  items?: unknown;
};

type ActionData = {
  error?: string;
  saved?: boolean;
  savedAt?: number;
};

export const meta: MetaFunction = () => [{ title: "보유 재화 관리 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const [catalogResources, ownedQuantities, relationshipLevels] = await Promise.all([
    getItemCatalogResources(env),
    getUserResourceInventoryMap(env, currentUser.id),
    getRelationshipLevels(env, currentUser.id),
  ]);
  const inventoryCatalogResources = buildOcrInventoryCatalogResources(catalogResources);

  return {
    resources: getGrowthPlannerCatalogResources(inventoryCatalogResources),
    ownedQuantities,
    relationshipGiftRequirements: buildRelationshipGiftResourceRequirements(relationshipLevels, catalogResources),
  };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data<ActionData>({ error: "로그인이 필요해요" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return data<ActionData>({ error: "지원하지 않는 요청 방식이에요" }, { status: 405 });
  }

  const maintenance = await studentStateMaintenanceActionResult(env, {
    ctx,
    operation: "utils.resources.inventory.action",
  });
  if (maintenance) return maintenance;

  try {
    const payload = await request.json<ResourceInventorySavePayload>();
    if (!Array.isArray(payload.items)) {
      return data<ActionData>({ error: "저장할 재화가 필요해요" }, { status: 400 });
    }

    const resourceUidSet = new Set(
      buildOcrInventoryCatalogResources(await getItemCatalogResources(env)).map((resource) => resource.inventoryUid),
    );
    const ownedQuantities = await getUserResourceInventoryMap(env, currentUser.id);
    const parsedItems = payload.items.map((item) => parseDraftItem(item));

    const items = parsedItems
      .filter((item) => isKnownResourceUid(resourceUidSet, item.itemUid))
      .filter((item) => item.quantity !== (ownedQuantities[item.itemUid] ?? 0));

    if (items.length === 0) {
      return data<ActionData>({ error: "변경된 보유 재화가 없어요" }, { status: 400 });
    }

    await upsertUserResourceInventories(env, currentUser.id, items);

    return data<ActionData>({ saved: true, savedAt: Date.now() });
  } catch (error) {
    return data<ActionData>(
      { error: error instanceof Error ? error.message : "보유 재화를 저장하지 못했어요" },
      { status: 400 },
    );
  }
};

export default function ResourceInventoryPage() {
  const { resources, ownedQuantities, relationshipGiftRequirements } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const formActionData = isStudentStateMaintenanceResult(actionData) ? undefined : actionData;
  const { managedStudents } = useOutletContext<GrowthLayoutContext>();
  const requiredResources = aggregateGrowthResourceRequirements([
    ...managedStudents.flatMap((student) => (student.resourceRequirements ? [student.resourceRequirements] : [])),
    relationshipGiftRequirements,
  ]);

  return (
    <ResourceInventoryEditor
      resources={resources}
      requiredResources={requiredResources}
      ownedQuantities={ownedQuantities}
      error={formActionData?.error}
    />
  );
}

function parseDraftItem(item: unknown): { itemUid: string; quantity: number } {
  if (typeof item !== "object" || item === null || !("itemUid" in item) || !("quantity" in item)) {
    throw new Error("저장할 재화 형식이 올바르지 않아요");
  }

  const itemUid = item.itemUid;
  if (typeof itemUid !== "string" || itemUid.trim().length === 0) {
    throw new Error("재화 정보가 필요해요");
  }

  return {
    itemUid: itemUid.trim(),
    quantity: parseUserResourceInventoryQuantity(item.quantity),
  };
}

function isKnownResourceUid(resourceUidSet: Set<string>, itemUid: string): boolean {
  if (resourceUidSet.has(itemUid)) {
    return true;
  }

  const { resourceType, sourceUid } = parseOcrInventoryResourceUid(itemUid);
  return (resourceType === null || resourceType === "equipment") && getEquipmentTypeKey(sourceUid) !== null;
}
