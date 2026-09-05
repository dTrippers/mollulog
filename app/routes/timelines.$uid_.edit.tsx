import { UserGroupIcon } from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page, RouteErrorBoundary } from "~/components/features/layout";
import {
  WalkthroughTimelineEditor,
  type WalkthroughTimelineEditorActionState,
  type WalkthroughTimelineEditorHandle,
  WalkthroughTimelineFeedbackButton,
  WalkthroughTimelinePartyPanel,
} from "~/components/features/walkthrough-timeline";
import {
  getPostgresWalkthroughTimeline,
  updatePostgresWalkthroughTimelineWithCommunityPost,
} from "~/db/postgres/walkthrough-timelines";
import {
  isWalkthroughTimelineVisibility,
  parseWalkthroughTimelineDocument,
  type WalkthroughParty,
} from "~/domain/walkthrough-timeline";
import { ActionValidationError, isActionValidationError } from "~/lib/action-errors";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { loadTimelineEditorOptions } from "./timelines._components/timeline-route-data.server";

type ActionData = { error: string };

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.timeline.title ?? "타임라인"} 수정 | 몰루로그` },
];
export const ErrorBoundary = RouteErrorBoundary;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  const timeline = params.uid
    ? await getPostgresWalkthroughTimeline(env, params.uid, { ctx: context.cloudflare.ctx })
    : null;
  if (!timeline) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  if (timeline.userId !== currentUser.id)
    throw routeError(403, "timeline.forbidden", "이 타임라인을 수정할 수 없어요.");
  return { timeline, ...(await loadTimelineEditorOptions(env, currentUser.id)) };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "timelines.edit.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  if (!params.uid) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  const formData = await request.formData();
  let document: ReturnType<typeof parseWalkthroughTimelineDocument>;
  let visibility: "private" | "unlisted" | "public";
  try {
    document = parseWalkthroughTimelineDocument(JSON.parse(String(formData.get("document") ?? "null")));
    const rawVisibility = String(formData.get("visibility") ?? "private");
    if (!isWalkthroughTimelineVisibility(rawVisibility)) {
      throw new ActionValidationError("공개 범위를 확인해주세요.");
    }
    visibility = rawVisibility;
  } catch (error) {
    return data<ActionData>(
      { error: isActionValidationError(error) ? error.message : "입력값을 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    const updated = await updatePostgresWalkthroughTimelineWithCommunityPost(
      env,
      params.uid,
      currentUser.id,
      {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        visibility,
        bossUid: document.context.bossUid,
        terrain: document.context.terrain,
        defenseType: document.context.defenseType,
        maxDifficulty: document.context.maxDifficulty,
        document,
      },
      { ctx },
    );
    if (!updated) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
    return redirect(`/timelines/${updated.uid}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    if (isActionValidationError(error)) {
      return data<ActionData>({ error: error.message }, { status: 400 });
    }
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
  const actionError = actionData && "error" in actionData ? actionData.error : undefined;
  const editorRef = useRef<WalkthroughTimelineEditorHandle>(null);
  const [activePartyIndex, setActivePartyIndex] = useState(0);
  const [parties, setParties] = useState<WalkthroughParty[]>(timeline.document.parties);
  const [actionState, setActionState] = useState<WalkthroughTimelineEditorActionState>({
    canUndo: false,
    canRedo: false,
  });
  return (
    <Page
      title="공략 타임라인 수정"
      contentWidth="full"
      backward={{ title: "타임라인으로 돌아가기", to: `/timelines/${timeline.uid}` }}
      panels={[
        {
          title: "파티 선택",
          Icon: UserGroupIcon,
          children: (
            <WalkthroughTimelinePartyPanel
              mode="edit"
              parties={parties}
              students={students}
              activePartyIndex={activePartyIndex}
              onChange={setActivePartyIndex}
              onAddParty={() => editorRef.current?.addParty()}
              onDeleteParty={(index) => editorRef.current?.deleteParty(index)}
              onSave={() => editorRef.current?.save()}
              onUndo={() => editorRef.current?.undo()}
              onRedo={() => editorRef.current?.redo()}
              canUndo={actionState.canUndo}
              canRedo={actionState.canRedo}
              error={actionError}
            />
          ),
        },
      ]}
      belowPanels={<WalkthroughTimelineFeedbackButton signedIn />}
    >
      <div className="py-4">
        <WalkthroughTimelineEditor
          ref={editorRef}
          initialTitle={timeline.title}
          initialDescription={timeline.description}
          initialVisibility={timeline.visibility}
          initialDocument={timeline.document}
          students={students}
          bosses={bosses}
          recruitedSnapshots={recruitedSnapshots}
          activePartyIndex={activePartyIndex}
          onActivePartyIndexChange={setActivePartyIndex}
          onPartiesChange={setParties}
          onActionStateChange={setActionState}
          draftStorageKey={`walkthrough-timeline:draft:${timeline.uid}`}
        />
      </div>
    </Page>
  );
}
