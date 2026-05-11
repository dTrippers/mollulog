import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { syncTimelineContents } from "~/jobs/sync-timeline-contents";
import type { Sensei } from "~/models/sensei";
import { flushCacheAll } from "~/models/base";
import { getFutureContents, getNavigationBarContentsRaw } from "~/models/content";
import { getMainStories } from "~/models/main-story";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { syncRawStudents } from "~/models/student";
import { RecruitmentRepository, RaidRepository } from "~/repositories";

type RefreshTaskName =
  | "syncTimelineContents"
  | "syncRawStudents"
  | "RecruitmentRepository.refresh"
  | "RaidRepository.refresh"
  | "getMainStories"
  | "getAllStudentsFavoriteItems"
  | "getFutureContents"
  | "getNavigationBarContentsRaw";

type RefreshTaskResult = {
  name: RefreshTaskName;
  duration: number;
  error: unknown | null;
};

type RefreshResponse = {
  ok: boolean;
  ranAt: string;
  durations: Partial<Record<RefreshTaskName, number>>;
  errors?: Partial<Record<RefreshTaskName, string>>;
};

async function requireAdmin(env: Env, request: Request): Promise<Sensei | Response> {
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }
  if (currentUser.role !== "admin") {
    return new Response(null, { status: 403 });
  }
  return currentUser;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

async function runRefreshTask(
  name: RefreshTaskName,
  fn: () => Promise<unknown>,
): Promise<RefreshTaskResult> {
  const startedAt = Date.now();
  try {
    await fn();
    return { name, duration: Date.now() - startedAt, error: null };
  } catch (error) {
    return { name, duration: Date.now() - startedAt, error };
  }
}

async function handleRefresh(env: Env, ctx: ExecutionContext): Promise<Response> {
  const recruitmentRepository = new RecruitmentRepository(env);
  const raidRepository = new RaidRepository(env);
  const leafTasks: Array<[RefreshTaskName, () => Promise<unknown>]> = [
    ["syncTimelineContents", () => syncTimelineContents(env, ctx)],
    ["syncRawStudents", () => syncRawStudents(env)],
    ["RecruitmentRepository.refresh", () => recruitmentRepository.refresh()],
    ["RaidRepository.refresh", () => raidRepository.refresh()],
    ["getMainStories", () => getMainStories(env, true)],
    ["getAllStudentsFavoriteItems", () => getAllStudentsFavoriteItems(env, true)],
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

  const body: RefreshResponse = {
    ok: Object.keys(errors).length === 0,
    ranAt: new Date().toISOString(),
    durations,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };

  return jsonResponse(body);
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const guard = await requireAdmin(env, request);
  if (guard instanceof Response) {
    return guard;
  }

  const command = params.command;
  if (command === "flush") {
    await flushCacheAll(env);
    return jsonResponse({ success: true, command });
  }
  if (command === "refresh") {
    return handleRefresh(env, context.cloudflare.ctx);
  }

  return jsonResponse({ success: false, error: `Unsupported command: ${command}` }, { status: 400 });
}
