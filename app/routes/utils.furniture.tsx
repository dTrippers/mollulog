import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getFurnitureCatalogSource } from "~/models/furniture-catalog";
import {
  parseUserFurnitureInventoryQuantity,
  saveUserFurnitureInventory,
  USER_FURNITURE_INVENTORY_QUANTITY_ERROR,
} from "~/models/user-furniture-inventory";
import { getFurnitureCatalogView } from "~/views/furniture-catalog";
import type { FurnitureInventoryActionResult } from "./utils.furniture._components/action-data";
import FurnitureCatalogScreen from "./utils.furniture._components/FurnitureCatalogScreen";

export const meta: MetaFunction = () => [
  { title: "가구 도감 | 몰루로그" },
  { name: "description", content: "테마별 가구 구성과 보유 현황을 확인해보세요." },
  { name: "og:title", content: "가구 도감 | 몰루로그" },
  { name: "og:description", content: "테마별 가구 구성과 보유 현황을 확인해보세요." },
];

export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formAction,
  formMethod,
  formData,
  json,
  defaultShouldRevalidate,
}) => {
  if (
    currentUrl.pathname !== nextUrl.pathname ||
    currentUrl.search !== nextUrl.search ||
    currentUrl.hash !== nextUrl.hash ||
    formMethod?.toUpperCase() !== "POST" ||
    !formAction
  ) {
    return defaultShouldRevalidate;
  }

  const actionUrl = new URL(formAction, currentUrl);
  const submittedOperation = (isRecord(json) ? json.operation : undefined) ?? formData?.get("operation");
  const actionTargetsCurrentRoute =
    actionUrl.pathname === currentUrl.pathname || actionUrl.pathname === `${currentUrl.pathname}.data`;
  const isFurnitureInventorySave =
    actionUrl.origin === currentUrl.origin && actionTargetsCurrentRoute && submittedOperation === "set";

  return isFurnitureInventorySave ? false : defaultShouldRevalidate;
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "utils.furniture.loader" });
  const currentUser = await getActiveSensei(env, request, ctx);

  try {
    const view = await getFurnitureCatalogView(env, currentUser?.id ?? null);
    return { view, signedIn: currentUser !== null, loadError: null };
  } catch (error) {
    logger.error("Furniture catalog load failed", error);
    return {
      view: null,
      signedIn: currentUser !== null,
      loadError: "가구 도감을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function action({ context, request }: ActionFunctionArgs): Promise<Response> {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "utils.furniture.action" });
  const submitted = await request.json<unknown>().catch(() => null);
  if (!isRecord(submitted)) return actionResponse({ ok: false, requestId: "", error: "요청을 확인할 수 없어요." }, 400);

  const requestId = typeof submitted.requestId === "string" ? submitted.requestId : "";
  if (!requestId) return actionResponse({ ok: false, requestId, error: "요청을 확인할 수 없어요." }, 400);

  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return actionResponse({ ok: false, requestId, error: "보유 수량을 저장하려면 로그인해 주세요." }, 401);
  }

  if (submitted.operation !== "set") {
    return actionResponse({ ok: false, requestId, error: "저장 요청을 확인할 수 없어요." }, 400);
  }

  try {
    const catalog = await getFurnitureCatalogSource(env);
    const validUids = new Set(catalog.furnitures.map(({ uid }) => uid));

    const furnitureUid = typeof submitted.furnitureUid === "string" ? submitted.furnitureUid.trim() : "";
    if (!furnitureUid || !validUids.has(furnitureUid)) {
      return actionResponse({ ok: false, requestId, error: "도감에서 가구를 찾을 수 없어요." }, 400);
    }

    let quantity: number;
    try {
      quantity = parseUserFurnitureInventoryQuantity(submitted.quantity);
    } catch {
      return actionResponse({ ok: false, requestId, error: USER_FURNITURE_INVENTORY_QUANTITY_ERROR }, 400);
    }

    await saveUserFurnitureInventory(env, currentUser.id, { furnitureUid, quantity });
    return actionResponse({ ok: true, requestId, quantities: { [furnitureUid]: quantity } });
  } catch (error) {
    logger.error("Furniture inventory save failed", error);
    return actionResponse(
      { ok: false, requestId, error: "가구 보유량을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." },
      500,
    );
  }
}

function actionResponse(result: FurnitureInventoryActionResult, status = 200): Response {
  return new Response(JSON.stringify(result), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function FurnitureCatalogRoute() {
  const { view, signedIn, loadError } = useLoaderData<typeof loader>();
  return <FurnitureCatalogScreen view={view} signedIn={signedIn} loadError={loadError} />;
}
