import { UserGroupIcon } from "@heroicons/react/24/outline";
import { nanoid } from "nanoid/non-secure";
import { useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import CommunityWriteMaintenanceToast from "~/components/features/community/CommunityWriteMaintenanceToast";
import { Page, RouteErrorBoundary } from "~/components/features/layout";
import {
  WalkthroughTimelineEditor,
  type WalkthroughTimelineEditorActionState,
  type WalkthroughTimelineEditorHandle,
  WalkthroughTimelineFeedbackButton,
  WalkthroughTimelinePartyPanel,
} from "~/components/features/walkthrough-timeline";
import { createPostgresWalkthroughTimeline } from "~/db/postgres/walkthrough-timelines";
import { isCommunityWriteMaintenanceActionResult } from "~/domain/community-write-freeze";
import {
  isWalkthroughTimelineVisibility,
  parseWalkthroughTimelineDocument,
  type WalkthroughParty,
} from "~/domain/walkthrough-timeline";
import { communityWriteMaintenanceResponse, isCommunityWriteFrozen } from "~/lib/community-write-freeze.server";
import { getLogger } from "~/lib/observability.server";
import { syncWalkthroughTimelineCommunityPost } from "~/models/community.server";
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
  try {
    const document = parseWalkthroughTimelineDocument(JSON.parse(String(formData.get("document") ?? "null")));
    const visibility = String(formData.get("visibility") ?? "private");
    if (!isWalkthroughTimelineVisibility(visibility)) throw new Error("공개 범위를 확인해주세요.");
    if (
      await isCommunityWriteFrozen(env, {
        ctx,
        operation: "walkthrough-timeline.create",
      })
    ) {
      return communityWriteMaintenanceResponse();
    }
    const timeline = await createPostgresWalkthroughTimeline(
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
    try {
      await syncWalkthroughTimelineCommunityPost(env, timeline);
    } catch (error) {
      logger.error("Failed to sync walkthrough timeline community post", error, {
        timelineUid: timeline.uid,
        visibility: timeline.visibility,
        operation: "create",
      });
    }
    return redirect(`/timelines/${timeline.uid}`);
  } catch (error) {
    return data<ActionData>(
      { error: error instanceof Error ? error.message : "입력값을 확인해주세요." },
      { status: 400 },
    );
  }
};

export default function NewWalkthroughTimelinePage() {
  const { students, bosses, recruitedSnapshots, preselectedBossIndex, preselectedTerrain } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const communityWriteMaintenanceVisible = isCommunityWriteMaintenanceActionResult(actionData);
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
            />
          ),
        },
      ]}
      belowPanels={<WalkthroughTimelineFeedbackButton signedIn />}
    >
      {communityWriteMaintenanceVisible ? <CommunityWriteMaintenanceToast trigger={actionData} /> : null}
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
          error={actionError}
        />
      </div>
    </Page>
  );
}
