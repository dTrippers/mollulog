import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, Callout, Title } from "~/components/primitives";
import { flushCacheAll } from "~/models/base";
import { getFutureContents, getNavigationBarContentsRaw } from "~/models/content";
import { getMainStories } from "~/models/main-story";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import type { Sensei } from "~/models/sensei";
import { syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { RaidRepository, RecruitmentRepository } from "~/repositories";

type RefreshTaskName =
  | "syncYoutubeCommunityPosts"
  | "syncRawStudents"
  | "RecruitmentRepository.refresh"
  | "RaidRepository.refresh"
  | "getMainStories"
  | "getAllStudentsFavoriteItems"
  | "syncAllTimelineContentsMeta"
  | "getFutureContents"
  | "getNavigationBarContentsRaw";

type RefreshTaskResult = {
  name: RefreshTaskName;
  duration: number;
  error: unknown | null;
};

type RefreshResult = {
  ok: boolean;
  ranAt: string;
  durations: Partial<Record<RefreshTaskName, number>>;
  errors?: Partial<Record<RefreshTaskName, string>>;
};

type FlushResult = {
  ok: true;
  ranAt: string;
};

type ManageActionData =
  | { intent: "cache.refresh"; result: RefreshResult }
  | { intent: "cache.flush"; result: FlushResult }
  | { intent: "unknown"; error: string };

async function requireAdmin(env: Env, request: Request, ctx: ExecutionContext): Promise<Sensei | Response> {
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }
  if (currentUser.role !== "admin") {
    return new Response(null, { status: 403 });
  }
  return currentUser;
}

async function runRefreshTask(name: RefreshTaskName, fn: () => Promise<unknown>): Promise<RefreshTaskResult> {
  const startedAt = Date.now();
  try {
    await fn();
    return { name, duration: Date.now() - startedAt, error: null };
  } catch (error) {
    return { name, duration: Date.now() - startedAt, error };
  }
}

async function refreshCache(env: Env): Promise<RefreshResult> {
  const recruitmentRepository = new RecruitmentRepository(env);
  const raidRepository = new RaidRepository(env);
  const leafTasks: Array<[RefreshTaskName, () => Promise<unknown>]> = [
    ["syncYoutubeCommunityPosts", () => syncYoutubeCommunityPosts(env)],
    ["syncRawStudents", () => syncRawStudents(env)],
    ["RecruitmentRepository.refresh", () => recruitmentRepository.refresh()],
    ["RaidRepository.refresh", () => raidRepository.refresh()],
    ["getMainStories", () => getMainStories(env, true)],
    ["getAllStudentsFavoriteItems", () => getAllStudentsFavoriteItems(env, true)],
    ["syncAllTimelineContentsMeta", () => syncAllTimelineContentsMeta(env)],
  ];
  const compositeTasks: Array<[RefreshTaskName, () => Promise<unknown>]> = [
    ["getFutureContents", () => getFutureContents(env, true)],
    ["getNavigationBarContentsRaw", () => getNavigationBarContentsRaw(env, true)],
  ];

  const leafResults = await Promise.all(leafTasks.map(([name, fn]) => runRefreshTask(name, fn)));
  const compositeResults = leafResults.some((result) => result.error)
    ? []
    : await Promise.all(compositeTasks.map(([name, fn]) => runRefreshTask(name, fn)));
  const results = [...leafResults, ...compositeResults];
  const durations: Partial<Record<RefreshTaskName, number>> = {};
  const errors: Partial<Record<RefreshTaskName, string>> = {};
  for (const result of results) {
    durations[result.name] = result.duration;
    if (result.error) {
      errors[result.name] = result.error instanceof Error ? result.error.message : String(result.error);
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    ranAt: new Date().toISOString(),
    durations,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const guard = await requireAdmin(env, request, ctx);
  if (guard instanceof Response) {
    return guard;
  }

  return data({});
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const guard = await requireAdmin(env, request, ctx);
  if (guard instanceof Response) {
    return guard;
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "cache.refresh") {
    return data<ManageActionData>({ intent, result: await refreshCache(env) });
  }
  if (intent === "cache.flush") {
    await flushCacheAll(env);
    return data<ManageActionData>({ intent, result: { ok: true, ranAt: new Date().toISOString() } });
  }

  return data<ManageActionData>({ intent: "unknown", error: `Unsupported intent: ${intent}` }, { status: 400 });
}

export const meta: MetaFunction = () => [{ title: "관리 | 몰루로그" }, { name: "robots", content: "noindex,nofollow" }];

export default function ManagePage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get("intent");
  const isRefreshing = navigation.state === "submitting" && submittingIntent === "cache.refresh";
  const isFlushing = navigation.state === "submitting" && submittingIntent === "cache.flush";

  return (
    <div className="max-w-3xl">
      <Title text="관리" description="캐시 작업" />

      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Cache refresh</h2>
              <p className="mt-1 text-sm text-muted-foreground">BAQL 기반 캐시를 다시 생성합니다.</p>
            </div>
            <Form method="post">
              <Button
                type="submit"
                name="intent"
                value="cache.refresh"
                variant="tint-blue"
                icon={ArrowPathIcon}
                text={isRefreshing ? "Refreshing..." : "Refresh cache"}
                disabled={isRefreshing || isFlushing}
              />
            </Form>
          </div>
        </section>

        <section className="rounded-lg border border-destructive/20 bg-destructive/5 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-destructive">Cache flush</h2>
              <p className="mt-1 text-sm text-muted-foreground">모든 KV cache entry를 삭제합니다.</p>
            </div>
            <Form method="post">
              <Button
                type="submit"
                name="intent"
                value="cache.flush"
                variant="danger"
                icon={TrashIcon}
                text={isFlushing ? "Flushing..." : "Flush all cache"}
                disabled={isRefreshing || isFlushing}
              />
            </Form>
          </div>
        </section>

        {actionData && <ActionResult data={actionData} />}
      </div>
    </div>
  );
}

function ActionResult({ data }: { data: ManageActionData }) {
  if (data.intent === "unknown") {
    return (
      <Callout
        Icon={ExclamationTriangleIcon}
        tone="destructive"
        title="요청을 처리하지 못했어요."
        description={data.error}
      />
    );
  }

  if (data.intent === "cache.flush") {
    return (
      <Callout
        Icon={CheckCircleIcon}
        tone="success"
        title="Cache flush 완료"
        description={`Ran at ${data.result.ranAt}`}
      />
    );
  }

  return (
    <Callout
      Icon={data.result.ok ? CheckCircleIcon : ExclamationTriangleIcon}
      tone={data.result.ok ? "success" : "warning"}
      title={data.result.ok ? "Cache refresh 완료" : "Cache refresh 일부 실패"}
      description={`Ran at ${data.result.ranAt}`}
    >
      <dl className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
        {Object.entries(data.result.durations).map(([name, duration]) => (
          <div key={name} className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2">
            <dt className="truncate font-medium">{name}</dt>
            <dd>{duration}ms</dd>
          </div>
        ))}
      </dl>
      {data.result.errors && (
        <div className="mt-3 space-y-2 text-xs">
          {Object.entries(data.result.errors).map(([name, message]) => (
            <p key={name} className="rounded-md bg-background/60 px-3 py-2 text-destructive">
              {name}: {message}
            </p>
          ))}
        </div>
      )}
    </Callout>
  );
}
