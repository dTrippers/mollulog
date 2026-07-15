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
  WalkthroughTimelinePartyPanel,
} from "~/components/features/walkthrough-timeline";
import { createPostgresWalkthroughTimeline } from "~/db/postgres/walkthrough-timelines";
import {
  parseWalkthroughTimelineDocument,
  type WalkthroughParty,
  type WalkthroughTimelineVisibility,
} from "~/domain/walkthrough-timeline";
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
  const preselectedBossIndex = options.bosses.findIndex((boss) => boss.scheduleKeys.includes(requestedScheduleKey));
  return { ...options, preselectedBossIndex: preselectedBossIndex >= 0 ? preselectedBossIndex : 0 };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  const formData = await request.formData();
  try {
    const document = parseWalkthroughTimelineDocument(JSON.parse(String(formData.get("document") ?? "null")));
    const visibility = String(formData.get("visibility") ?? "private") as WalkthroughTimelineVisibility;
    if (!["public", "private"].includes(visibility)) throw new Error("공개 범위를 확인해주세요.");
    const timeline = await createPostgresWalkthroughTimeline(
      env,
      currentUser.id,
      {
        title: String(formData.get("title") ?? ""),
        visibility,
        bossUid: document.context.bossUid,
        defenseType: document.context.defenseType,
        maxDifficulty: document.context.maxDifficulty,
        document,
      },
      { ctx },
    );
    return redirect(`/timelines/${timeline.uid}`);
  } catch (error) {
    return data<ActionData>(
      { error: error instanceof Error ? error.message : "입력값을 확인해주세요." },
      { status: 400 },
    );
  }
};

export default function NewWalkthroughTimelinePage() {
  const { students, bosses, recruitedSnapshots, preselectedBossIndex } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const editorRef = useRef<WalkthroughTimelineEditorHandle>(null);
  const [activePartyIndex, setActivePartyIndex] = useState(0);
  const [parties, setParties] = useState<WalkthroughParty[]>([]);
  const [actionState, setActionState] = useState<WalkthroughTimelineEditorActionState>({
    canUndo: false,
    canRedo: false,
  });
  const boss = bosses[preselectedBossIndex];
  const defenseType = boss?.defenseTypes[0];
  if (!boss || !defenseType) throw new Response("보스의 방어 타입 정보를 찾을 수 없어요.", { status: 503 });
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
              onUndo={() => editorRef.current?.undo()}
              onRedo={() => editorRef.current?.redo()}
              canUndo={actionState.canUndo}
              canRedo={actionState.canRedo}
            />
          ),
        },
      ]}
    >
      <div className="py-4">
        <WalkthroughTimelineEditor
          ref={editorRef}
          initialTitle=""
          initialVisibility="private"
          initialDocument={{
            type: "walkthrough_timeline",
            schemaVersion: 1,
            partySize: 6,
            context: {
              bossUid: boss.uid,
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
          error={actionData?.error}
        />
      </div>
    </Page>
  );
}
