import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { aggregateGrowthResourceRequirements } from "~/models/growth-resource";
import {
  getUserResourceInventoryMap,
  parseUserResourceInventoryQuantity,
  upsertUserResourceInventory,
} from "~/models/user-resource-inventory";
import { getGrowthPlannerCatalogResources, getItemCatalogResources } from "~/repositories/item-catalog";
import ResourceInventoryEditor from "./utils.growth.resources._components/ResourceInventoryEditor";
import type { GrowthLayoutContext } from "./utils.growth._components/types";

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

  const [catalogResources, ownedQuantities] = await Promise.all([
    getItemCatalogResources(env),
    getUserResourceInventoryMap(env, currentUser.id),
  ]);

  return {
    resources: getGrowthPlannerCatalogResources(catalogResources),
    ownedQuantities,
  };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data<ActionData>({ error: "로그인이 필요해요" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return data<ActionData>({ error: "지원하지 않는 요청 방식이에요" }, { status: 405 });
  }

  try {
    const payload = await request.json<ResourceInventorySavePayload>();
    if (!Array.isArray(payload.items)) {
      return data<ActionData>({ error: "저장할 재화가 필요해요" }, { status: 400 });
    }

    const resourceUidSet = new Set((await getItemCatalogResources(env)).map((resource) => resource.uid));
    const ownedQuantities = await getUserResourceInventoryMap(env, currentUser.id);
    const items = payload.items
      .map((item) => parseDraftItem(item))
      .filter((item) => resourceUidSet.has(item.itemUid))
      .filter((item) => item.quantity !== (ownedQuantities[item.itemUid] ?? 0));

    if (items.length === 0) {
      return data<ActionData>({ error: "변경된 보유 재화가 없어요" }, { status: 400 });
    }

    for (const item of items) {
      await upsertUserResourceInventory(env, currentUser.id, item.itemUid, item.quantity);
    }

    return data<ActionData>({ saved: true, savedAt: Date.now() });
  } catch (error) {
    return data<ActionData>(
      { error: error instanceof Error ? error.message : "보유 재화를 저장하지 못했어요" },
      { status: 400 },
    );
  }
};

export default function GrowthResourcesPage() {
  const { resources, ownedQuantities } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { managedStudents } = useOutletContext<GrowthLayoutContext>();
  const requiredResources = aggregateGrowthResourceRequirements(
    managedStudents.map((student) => student.resourceRequirements),
  );

  return (
    <ResourceInventoryEditor
      resources={resources}
      requiredResources={requiredResources}
      ownedQuantities={ownedQuantities}
      error={actionData?.error}
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
