import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { WalkthroughEditorForm } from "~/components/v2/features/walkthroughs/WalkthroughEditorForm";
import { WalkthroughRouteError } from "~/components/v2/features/walkthroughs/WalkthroughRouteError";
import {
  getPostgresWalkthroughTimeline,
  updatePostgresWalkthroughTimelineWithCommunityPost,
} from "~/db/postgres/walkthrough-timelines";
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

const NOT_FOUND_MESSAGE = "공략/타임라인을 찾을 수 없어요.";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.timeline.title ?? "공략/타임라인"} 수정 | 몰루로그` },
];
export const ErrorBoundary = WalkthroughRouteError;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  const timeline = params.uid
    ? await getPostgresWalkthroughTimeline(env, params.uid, { ctx: context.cloudflare.ctx })
    : null;
  if (!timeline) throw routeError(404, "timeline.not_found", NOT_FOUND_MESSAGE);
  if (timeline.userId !== currentUser.id) throw routeError(403, "timeline.forbidden", "이 타임라인을 수정할 수 없어요.");
  return { timeline, ...(await loadTimelineEditorOptions(env, currentUser.id)) };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "timelines.edit.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  if (!params.uid) throw routeError(404, "timeline.not_found", NOT_FOUND_MESSAGE);
  try {
    const input = parseWalkthroughFormData(await request.formData());
    const students = await getAllStudentsMap(env, true);
    const updated = await updatePostgresWalkthroughTimelineWithCommunityPost(
      env,
      params.uid,
      currentUser.id,
      input,
      walkthroughStudentNameLookup(students),
      { ctx },
    );
    if (!updated) throw routeError(404, "timeline.not_found", NOT_FOUND_MESSAGE);
    return redirect(`/timelines/${updated.uid}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    if (isActionValidationError(error)) return data<ActionData>({ error: error.message }, { status: 400 });
    logger.error("Failed to update walkthrough timeline", error, {
      operation: "update",
      timelineUid: params.uid,
      userId: currentUser.id,
    });
    return data<ActionData>({ error: "타임라인을 저장하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
};

export default function EditWalkthroughTimelinePage() {
  const { timeline, students, bosses, recruitedSnapshots } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <WalkthroughEditorForm
      pageTitle="공략/타임라인 수정"
      initialValue={{
        title: timeline.title,
        body: timeline.body,
        visibility: timeline.visibility,
        isAuto: timeline.isAuto,
        document: timeline.document,
      }}
      students={students}
      bosses={bosses}
      recruitedSnapshots={recruitedSnapshots}
      draftStorageKey={`walkthrough-timeline:draft:${timeline.uid}`}
      actionError={actionData?.error ?? null}
    />
  );
}
