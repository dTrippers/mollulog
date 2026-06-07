import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { routeError } from "~/lib/http-errors";
import {
  applyUserResourceInventoryDraft,
  discardUserResourceInventoryDraft,
  getUserResourceInventoryDraft,
  getUserResourceInventoryMapByItemUids,
} from "~/models/user-resource-inventory";
import { getItemCatalogResourceMap } from "~/repositories/item-catalog";
import ResourceInventoryDraftReview from "./utils.resources._components/ResourceInventoryDraftReview";

type ActionData = {
  error?: string;
};

export const meta: MetaFunction = () => [{ title: "보유 재화 변경 확인 | 몰루로그" }];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const draftUid = params.draftUid;
  if (!draftUid) {
    throw routeError(404, "resource_inventory_draft.not_found", "변경안을 찾을 수 없어요");
  }

  const draft = await getUserResourceInventoryDraft(env, currentUser.id, draftUid);
  if (!draft) {
    throw routeError(404, "resource_inventory_draft.not_found", "변경안을 찾을 수 없어요");
  }

  const itemUids = draft.items.map((item) => item.itemUid);
  const [resourcesByUid, currentQuantities] = await Promise.all([
    getItemCatalogResourceMap(env),
    getUserResourceInventoryMapByItemUids(env, currentUser.id, itemUids),
  ]);

  return {
    draft,
    resourcesByUid,
    currentQuantities,
  };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data<ActionData>({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const draftUid = params.draftUid;
  if (!draftUid) {
    return data<ActionData>({ error: "변경안을 찾을 수 없어요" }, { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "apply") {
      await applyUserResourceInventoryDraft(env, currentUser.id, draftUid);
      return redirect("/utils/resources/inventory");
    }
    if (intent === "discard") {
      await discardUserResourceInventoryDraft(env, currentUser.id, draftUid);
      return redirect("/utils/resources/inventory");
    }

    return data<ActionData>({ error: "지원하지 않는 요청이에요" }, { status: 400 });
  } catch (error) {
    return data<ActionData>(
      { error: error instanceof Error ? error.message : "변경안을 처리하지 못했어요" },
      { status: 400 },
    );
  }
};

export default function ResourceDraftPage() {
  const { draft, resourcesByUid, currentQuantities } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <ResourceInventoryDraftReview
      draft={draft}
      resourcesByUid={resourcesByUid}
      currentQuantities={currentQuantities}
      error={actionData?.error}
    />
  );
}
