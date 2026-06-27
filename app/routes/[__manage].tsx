import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, Callout, Title } from "~/components/primitives";
import { getFutureContents, getIndexContents, getNavigationBarContentsRaw } from "~/models/content";
import { getEventList, syncEventContentsList, warmActiveUpcomingEventContent } from "~/models/event-content";
import { getMainStories } from "~/models/main-story";
import { warmRaidCache } from "~/models/raid";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import type { Sensei } from "~/models/sensei";
import { getAllStudents, getStudentSkillItemsBatch, syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { getStudentGearData } from "~/models/growth-resource";
import { getItemCatalogResources } from "~/models/item-catalog";
import { warmRecruitmentCache } from "~/models/recruitment";
import { getCampaignFarmingStages } from "~/models/stage";

type RefreshTaskName =
  | "syncYoutubeCommunityPosts"
  | "syncRawStudents"
  | "warmRecruitmentCache"
  | "warmRaidCache"
  | "getMainStories"
  | "getAllStudentsFavoriteItems"
  | "syncAllTimelineContentsMeta"
  | "syncEventContentsList"
  | "warmStudentSkillItems"
  | "warmStudentGearData"
  | "warmActiveUpcomingEventContent"
  | "getItemCatalogResources"
  | "getCampaignFarmingStages"
  | "getEventList"
  | "getIndexContents"
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

type ManageActionData = { intent: "cache.refresh"; result: RefreshResult } | { intent: "unknown"; error: string };

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

async function refreshCache(env: Env, ctx: ExecutionContext): Promise<RefreshResult> {
  const studentUids = getAllStudents(env, true).then((students) => students.map((student) => student.uid));
  const sourceTasks: Array<[RefreshTaskName, () => Promise<unknown>]> = [
    ["syncYoutubeCommunityPosts", () => syncYoutubeCommunityPosts(env)],
    ["syncRawStudents", () => syncRawStudents(env)],
    ["warmRecruitmentCache", () => warmRecruitmentCache(env)],
    ["warmRaidCache", () => warmRaidCache(env)],
    ["getMainStories", () => getMainStories(env, true)],
    ["getAllStudentsFavoriteItems", () => getAllStudentsFavoriteItems(env, true)],
    ["syncAllTimelineContentsMeta", () => syncAllTimelineContentsMeta(env)],
    ["syncEventContentsList", () => syncEventContentsList(env)],
    ["warmStudentSkillItems", async () => getStudentSkillItemsBatch(env, await studentUids, true)],
    ["warmStudentGearData", async () => getStudentGearData(env, await studentUids, true)],
    ["warmActiveUpcomingEventContent", () => warmActiveUpcomingEventContent(env, true)],
    ["getItemCatalogResources", () => getItemCatalogResources(env, true)],
    ["getCampaignFarmingStages", () => getCampaignFarmingStages(env, true)],
  ];
  const routeTasks: Array<[RefreshTaskName, () => Promise<unknown>]> = [
    ["getEventList", () => getEventList(env, undefined, true, ctx)],
    ["getIndexContents", () => getIndexContents(env, true, ctx)],
    ["getFutureContents", () => getFutureContents(env, true, ctx)],
    ["getNavigationBarContentsRaw", () => getNavigationBarContentsRaw(env, true, ctx)],
  ];

  const sourceResults = await Promise.all(sourceTasks.map(([name, fn]) => runRefreshTask(name, fn)));
  const routeResults = sourceResults.some((result) => result.error)
    ? []
    : await Promise.all(routeTasks.map(([name, fn]) => runRefreshTask(name, fn)));
  const results = [...sourceResults, ...routeResults];
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
    return data<ManageActionData>({ intent, result: await refreshCache(env, ctx) });
  }

  return data<ManageActionData>({ intent: "unknown", error: `Unsupported intent: ${intent}` }, { status: 400 });
}

export const meta: MetaFunction = () => [{ title: "관리 | 몰루로그" }, { name: "robots", content: "noindex,nofollow" }];

export default function ManagePage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get("intent");
  const isRefreshing = navigation.state === "submitting" && submittingIntent === "cache.refresh";

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
                disabled={isRefreshing}
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
