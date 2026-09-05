import { UserGroupIcon } from "@heroicons/react/24/outline";
import { nanoid } from "nanoid/non-secure";
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
import { createPostgresWalkthroughTimelineWithCommunityPost } from "~/db/postgres/walkthrough-timelines";
import {
  isWalkthroughTimelineVisibility,
  parseWalkthroughTimelineDocument,
  type WalkthroughParty,
} from "~/domain/walkthrough-timeline";
import { ActionValidationError, isActionValidationError } from "~/lib/action-errors";
import { getLogger } from "~/lib/observability.server";
import { loadTimelineEditorOptions } from "./timelines._components/timeline-route-data.server";

type ActionData = { error: string };

export const meta: MetaFunction = () => [{ title: "공략 타임라인 작성 | 몰루로그" }];
export const ErrorBoundary = RouteErrorBoundary;

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  const options = await loadTimelineEditorOptions(env, currentUser.id);
  if (options.bosses.length === 0) throw new Response("보스 정보를 찾을 수 없어요.", { status: 503 });
  const url = new URL(request.url);
  const requestedRaidType = url.searchParams.get("raidType");
  const requestedSeasonIndex = Number.parseInt(url.searchParams.get("seasonIndex") ?? "", 10);
  const requestedScheduleKey = `${requestedRaidType}:${requestedSeasonIndex}`;
  const preselectedBossIndex = options.bosses.findIndex((boss) =>
    boss.schedules.some((schedule) => schedule.key === requestedScheduleKey),
  );
  const resolvedBossIndex = preselectedBossIndex >= 0 ? preselectedBossIndex : 0;
  const preselectedTerrain = options.bosses[resolvedBossIndex]?.schedules.find(
    (schedule) => schedule.key === requestedScheduleKey,
  )?.terrain;
  return { ...options, preselectedBossIndex: resolvedBossIndex, preselectedTerrain };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "timelines.new.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
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
    const timeline = await createPostgresWalkthroughTimelineWithCommunityPost(
      env,
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
    return redirect(`/timelines/${timeline.uid}`);
  } catch (error) {
    if (isActionValidationError(error)) {
      return data<ActionData>({ error: error.message }, { status: 400 });
    }
    logger.error("Failed to create walkthrough timeline", error, {
      operation: "create",
      userId: currentUser.id,
    });
    return data<ActionData>({ error: "타임라인을 저장하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
};

export default function NewWalkthroughTimelinePage() {
  const { students, bosses, recruitedSnapshots, preselectedBossIndex, preselectedTerrain } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const actionError = actionData && "error" in actionData ? actionData.error : undefined;
  const editorRef = useRef<WalkthroughTimelineEditorHandle>(null);
  const [activePartyIndex, setActivePartyIndex] = useState(0);
  const [parties, setParties] = useState<WalkthroughParty[]>([]);
  const [actionState, setActionState] = useState<WalkthroughTimelineEditorActionState>({
    canUndo: false,
    canRedo: false,
  });
  const boss = bosses[preselectedBossIndex];
  const defenseType = boss?.defenseTypes[0];
  const terrain = preselectedTerrain ?? boss?.terrains[0];
  if (!boss || !defenseType || !terrain) {
    throw new Response("보스의 공략 설정 정보를 찾을 수 없어요.", { status: 503 });
  }
  return (
    <Page
      title="공략 타임라인 작성"
      contentWidth="full"
      panels={[
        {
          title: "파티 선택",
          Icon: UserGroupIcon,
          children: (
            <WalkthroughTimelinePartyPanel
              mode="create"
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
          initialTitle=""
          initialDescription=""
          initialVisibility="private"
          initialDocument={{
            type: "walkthrough_timeline",
            schemaVersion: 1,
            partySize: boss.partySize,
            context: {
              bossUid: boss.uid,
              terrain,
              defenseType,
              maxDifficulty: "extreme",
            },
            parties: [{ uid: nanoid(8), order: 0, startingSkillStudentUids: [], units: [], steps: [] }],
          }}
          students={students}
          bosses={bosses}
          recruitedSnapshots={recruitedSnapshots}
          activePartyIndex={activePartyIndex}
          onActivePartyIndexChange={setActivePartyIndex}
          onPartiesChange={setParties}
          onActionStateChange={setActionState}
          draftStorageKey="walkthrough-timeline:draft:new"
        />
      </div>
    </Page>
  );
}
