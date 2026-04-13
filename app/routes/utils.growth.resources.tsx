import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useLoaderData, useOutletContext } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { EmptyView } from "~/components/primitives";
import { getGrowthResourceInventoryMap, upsertGrowthResourceInventory } from "~/models/growth-resource-inventory";
import { aggregateGrowthResourceRequirements } from "~/models/growth-resource";
import ResourceInventoryTable from "./utils.growth._components/ResourceInventoryTable";
import type { GrowthLayoutContext } from "./utils.growth._components/types";

type ResourceInventoryActionData = {
  itemUid?: unknown;
  quantity?: unknown;
};

function parseOwnedQuantity(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
    }
    return Number(trimmed);
  }

  throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  return {
    ownedQuantities: await getGrowthResourceInventoryMap(env, currentUser.id),
  };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return data({ error: "로그인이 필요해요" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return data({ error: "지원하지 않는 요청 방식이에요" }, { status: 405 });
  }

  try {
    const payload = await request.json<ResourceInventoryActionData>();
    if (typeof payload.itemUid !== "string" || payload.itemUid.length === 0) {
      return data({ error: "재화 정보가 필요해요" }, { status: 400 });
    }

    const quantity = parseOwnedQuantity(payload.quantity);
    await upsertGrowthResourceInventory(env, currentUser.id, payload.itemUid, quantity);

    return data({ success: true });
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "보유 재화를 저장하지 못했어요" }, { status: 400 });
  }
};

export default function GrowthResourcesPage() {
  const { ownedQuantities } = useLoaderData<typeof loader>();
  const { managedStudents } = useOutletContext<GrowthLayoutContext>();
  const aggregatedRequirements = aggregateGrowthResourceRequirements(
    managedStudents.map((student) => student.resourceRequirements),
  );

  if (managedStudents.length === 0) {
    return <EmptyView Icon={ArchiveBoxIcon} text="학생 성장 페이지에서 학생의 성장 목표를 추가해주세요" />;
  }

  if (aggregatedRequirements.items.length === 0) {
    return <EmptyView Icon={ArchiveBoxIcon} text="아직 추가로 필요한 재화가 없어요" />;
  }

  return (
    <div className="space-y-4">
      {aggregatedRequirements.skillUnavailable && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          일부 학생의 스킬 재화는 BAQL 응답을 불러오지 못해 합계에서 제외됐어요.
        </p>
      )}

      <ResourceInventoryTable items={aggregatedRequirements.items} ownedQuantities={ownedQuantities} />
    </div>
  );
}
