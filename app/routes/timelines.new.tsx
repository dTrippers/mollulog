import { nanoid } from "nanoid/non-secure";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { WalkthroughEditorForm } from "~/components/v2/features/walkthroughs/WalkthroughEditorForm";
import { WalkthroughRouteError } from "~/components/v2/features/walkthroughs/WalkthroughRouteError";
import { createPostgresWalkthroughTimelineWithCommunityPost } from "~/db/postgres/walkthrough-timelines";
import { WALKTHROUGH_TIMELINE_SCHEMA_VERSION } from "~/domain/walkthrough-timeline";
import { isActionValidationError } from "~/lib/action-errors";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { getAllStudentsMap } from "~/models/student";
import {
  loadTimelineEditorOptions,
  parseWalkthroughFormData,
  walkthroughStudentNameLookup,
} from "./timelines._components/timeline-route-data.server";

type ActionData = { error: string };

export const meta: MetaFunction = () => [{ title: "공략/타임라인 작성 | 몰루로그" }];
export const ErrorBoundary = WalkthroughRouteError;

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  const options = await loadTimelineEditorOptions(env, currentUser.id);
  if (options.bosses.length === 0) throw routeError(503, "timeline.bosses_unavailable", "보스 정보를 찾을 수 없어요.");
  const url = new URL(request.url);
  const requestedScheduleKey = `${url.searchParams.get("raidType")}:${Number.parseInt(url.searchParams.get("seasonIndex") ?? "", 10)}`;
  const requestedBoss = options.bosses.find((boss) =>
    boss.schedules.some((schedule) => schedule.key === requestedScheduleKey),
  );
  const boss = requestedBoss ?? options.bosses[0];
  const terrain =
    boss?.schedules.find((schedule) => schedule.key === requestedScheduleKey)?.terrain ?? boss?.terrains[0];
  const defenseType = boss?.defenseTypes[0];
  if (!boss || !terrain || !defenseType) {
    throw routeError(503, "timeline.bosses_unavailable", "보스의 공략 설정 정보를 찾을 수 없어요.");
  }
  return {
    ...options,
    initialDocument: {
      type: "walkthrough_timeline" as const,
      schemaVersion: WALKTHROUGH_TIMELINE_SCHEMA_VERSION,
      partySize: boss.partySize,
      context: { bossUid: boss.uid, terrain, defenseType, maxDifficulty: "extreme" as const },
      parties: [{ uid: nanoid(8), order: 0, startingSkillStudentUids: [], units: [], steps: [] }],
    },
  };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "timelines.new.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  try {
    const input = parseWalkthroughFormData(await request.formData());
    const students = await getAllStudentsMap(env, true);
    const timeline = await createPostgresWalkthroughTimelineWithCommunityPost(
      env,
      currentUser.id,
      input,
      walkthroughStudentNameLookup(students),
      { ctx },
    );
    return redirect(`/timelines/${timeline.uid}`);
  } catch (error) {
    if (isActionValidationError(error)) return data<ActionData>({ error: error.message }, { status: 400 });
    logger.error("Failed to create walkthrough timeline", error, { operation: "create", userId: currentUser.id });
    return data<ActionData>({ error: "타임라인을 저장하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
};

export default function NewWalkthroughTimelinePage() {
  const { students, bosses, recruitedSnapshots, initialDocument } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <WalkthroughEditorForm
      pageTitle="공략/타임라인 작성"
      initialValue={{ title: "", body: null, visibility: "private", isAuto: false, document: initialDocument }}
      students={students}
      bosses={bosses}
      recruitedSnapshots={recruitedSnapshots}
      draftStorageKey="walkthrough-timeline:draft:new"
      actionError={actionData?.error ?? null}
    />
  );
}
