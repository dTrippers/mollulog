import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useLoaderData } from "react-router";
import { Title } from "~/components/primitives";
import { getCacheRefreshStatus, startCacheRefresh } from "~/jobs/cache-refresh-control.server";
import { getLogger } from "~/lib/observability.server";
import { requireAdmin } from "~/lib/require-admin.server";
import { CacheRefreshPanel } from "./[__manage]._components/CacheRefreshPanel";

const SAFE_STATUS_ERROR = "잠시 후 다시 시도해주세요. 문제가 계속되면 서버 로그를 확인해주세요.";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const guard = await requireAdmin(env, request, ctx);
  if (guard instanceof Response) {
    return guard;
  }

  const jobUid = new URL(request.url).searchParams.get("jobId");
  try {
    return data({ job: await getCacheRefreshStatus(env, ctx, jobUid), error: null });
  } catch (error) {
    getLogger(env, ctx, { route: "/__manage", operation: "cache-refresh-status", jobUid }).error(
      "Failed to load cache refresh status",
      error,
    );
    return data({ job: null, error: SAFE_STATUS_ERROR }, { status: 503 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const guard = await requireAdmin(env, request, ctx);
  if (guard instanceof Response) {
    return guard;
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent !== "cache.refresh") {
    return data({ intent: "unknown" as const, error: `Unsupported intent: ${intent}` }, { status: 400 });
  }

  try {
    const result = await startCacheRefresh(env, ctx, guard.id);
    return data({ intent, ...result }, { status: result.created ? 202 : 200 });
  } catch (error) {
    getLogger(env, ctx, { route: "/__manage", operation: "cache-refresh-start", requestedBy: guard.id }).error(
      "Failed to start cache refresh",
      error,
    );
    return data({ intent, error: SAFE_STATUS_ERROR }, { status: 503 });
  }
}

export const meta: MetaFunction = () => [{ title: "관리 | 몰루로그" }, { name: "robots", content: "noindex,nofollow" }];

export default function ManagePage() {
  const loaderData = useLoaderData<typeof loader>();

  return (
    <div className="max-w-3xl">
      <Title text="관리" description="캐시 및 데이터 이관 작업" />
      <CacheRefreshPanel initialJob={loaderData.job} initialError={loaderData.error} />
    </div>
  );
}
