import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  flattenTimelineParties,
  useWakeLock,
  WalkthroughTimelineViewer,
} from "~/components/features/walkthrough-timeline";
import { getPostgresWalkthroughTimeline } from "~/db/postgres/walkthrough-timelines";
import { routeError } from "~/lib/http-errors";
import { getAllStudentsMap } from "~/models/student";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.title ?? "타임라인"} 실전 뷰어 | 몰루로그` },
  { name: "robots", content: "noindex,nofollow" },
];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const [timeline, currentUser] = await Promise.all([
    params.uid ? getPostgresWalkthroughTimeline(env, params.uid, { ctx }) : null,
    getActiveSensei(env, request),
  ]);
  if (!timeline || (timeline.visibility === "private" && timeline.userId !== currentUser?.id)) {
    throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  }
  const students = await getAllStudentsMap(env, true);
  return {
    title: timeline.title,
    parties: timeline.document.parties,
    studentsByUid: Object.fromEntries(Object.entries(students).map(([uid, student]) => [uid, { name: student.name }])),
  };
};

export default function WalkthroughTimelineViewerPage() {
  const { parties, studentsByUid } = useLoaderData<typeof loader>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(true);
  const wakeLock = useWakeLock(wakeLockEnabled);
  const items = flattenTimelineParties(parties);

  useEffect(() => {
    if (wakeLock.unavailable) setWakeLockEnabled(false);
  }, [wakeLock.unavailable]);

  return (
    <main className="fixed inset-0 z-layer-modal overflow-y-auto bg-background">
      <WalkthroughTimelineViewer
        items={items}
        studentsByUid={studentsByUid}
        currentIndex={currentIndex}
        onCurrentIndexChange={setCurrentIndex}
        allowFullscreen
        wakeLockControl={{
          enabled: wakeLockEnabled,
          active: wakeLock.active,
          unavailable: wakeLock.unavailable,
          onToggle: () => setWakeLockEnabled((enabled) => !enabled),
        }}
      />
      <span className="sr-only" aria-live="polite">
        {wakeLock.active
          ? "화면 꺼짐 방지가 켜졌습니다."
          : wakeLockEnabled
            ? "화면 꺼짐 방지를 요청하고 있습니다."
            : "화면 꺼짐 방지를 사용할 수 없습니다."}
      </span>
    </main>
  );
}
