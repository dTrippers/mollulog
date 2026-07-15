import { ClockIcon, DocumentDuplicateIcon, PencilSquareIcon, PlayIcon, TrashIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page, RouteErrorBoundary } from "~/components/features/layout";
import {
  flattenTimelineParties,
  TimelineStudentImage,
  WalkthroughTimelineViewerLauncher,
} from "~/components/features/walkthrough-timeline";
import Button from "~/components/primitives/Button";
import {
  clonePostgresWalkthroughTimeline,
  deletePostgresWalkthroughTimeline,
  getPostgresWalkthroughTimeline,
} from "~/db/postgres/walkthrough-timelines";
import { routeError } from "~/lib/http-errors";
import { defenseTypeLocale, difficultyLocale } from "~/locales/ko";
import { getAllRaidSchedules } from "~/models/raid";
import { getSenseiById } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.timeline.title ?? "공략 타임라인"} | 몰루로그` },
  ...(data?.timeline.visibility === "public" ? [] : [{ name: "robots", content: "noindex,nofollow" }]),
];
export const ErrorBoundary = RouteErrorBoundary;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const [timeline, currentUser] = await Promise.all([
    params.uid ? getPostgresWalkthroughTimeline(env, params.uid, { ctx }) : null,
    getActiveSensei(env, request),
  ]);
  if (!timeline) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  const owner = currentUser?.id === timeline.userId;
  if (timeline.visibility === "private" && !owner) {
    throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  }
  const [author, students, raids] = await Promise.all([
    getSenseiById(env, timeline.userId),
    getAllStudentsMap(env, true),
    getAllRaidSchedules(env),
  ]);
  const bossName = raids.find((raid) => raid.raidBoss.uid === timeline.bossUid)?.raidBoss.name ?? null;
  return {
    timeline,
    owner,
    signedIn: currentUser !== null,
    author: author ? { username: author.username } : null,
    bossName,
    studentsByUid: Object.fromEntries(Object.entries(students).map(([uid, student]) => [uid, { name: student.name }])),
  };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  if (!params.uid) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "clone") {
    const cloned = await clonePostgresWalkthroughTimeline(env, params.uid, currentUser.id, { ctx });
    if (!cloned) throw routeError(404, "timeline.not_found", "복제할 타임라인을 찾을 수 없어요.");
    return redirect(`/timelines/${cloned.uid}/edit`);
  }
  if (intent === "delete") {
    const deleted = await deletePostgresWalkthroughTimeline(env, params.uid, currentUser.id, { ctx });
    if (!deleted) throw routeError(403, "timeline.forbidden", "이 타임라인을 삭제할 수 없어요.");
    return redirect(`/@${currentUser.username}/timelines`);
  }
  throw routeError(400, "timeline.invalid_action", "지원하지 않는 요청이에요.");
};

export default function WalkthroughTimelineDetailPage() {
  const { timeline, owner, signedIn, author, bossName, studentsByUid } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const items = flattenTimelineParties(timeline.document.parties);
  const usedStudentUids = [
    ...new Set(
      timeline.document.parties.flatMap((party) => [
        ...party.units.flatMap((unit) => (unit.studentUid ? [unit.studentUid] : [])),
        ...party.steps.flatMap((step) =>
          step.actions.flatMap((action) => (action.studentUid ? [action.studentUid] : [])),
        ),
      ]),
    ),
  ];

  return (
    <Page
      title={timeline.title}
      description={author ? `@${author.username} 선생님의 공략 타임라인` : "공략 타임라인"}
      contentWidth="full"
      links={
        author
          ? [
              {
                title: "작성자 프로필",
                description: "작성자의 다른 공략 타임라인 보기",
                Icon: ClockIcon,
                to: `/@${author.username}/timelines`,
              },
            ]
          : undefined
      }
    >
      <div className="space-y-4 py-4">
        <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              <p>{bossName ?? "보스 정보 확인 불가"}</p>
              <p className="mt-1">
                {defenseTypeLocale[timeline.defenseType as keyof typeof defenseTypeLocale] ?? timeline.defenseType} ·{" "}
                {difficultyLocale[timeline.maxDifficulty]}
              </p>
              <p className="mt-1">
                {timeline.document.parties.length}파티 · {items.length}단계 ·{" "}
                {dayjs(timeline.updatedAt).format("YYYY.MM.DD 수정")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                to={`/timelines/${timeline.uid}/viewer`}
                icon={PlayIcon}
                text="전체 화면 뷰어"
                variant="primary"
              />
              {owner && <Button to={`/timelines/${timeline.uid}/edit`} icon={PencilSquareIcon} text="수정" />}
            </div>
          </div>
          {usedStudentUids.length > 0 && (
            <fieldset className="mt-5 flex flex-wrap gap-2">
              <legend className="sr-only">사용 학생</legend>
              {usedStudentUids.map((uid) => (
                <TimelineStudentImage
                  key={uid}
                  uid={uid}
                  name={studentsByUid[uid]?.name ?? "학생"}
                  className="size-12"
                />
              ))}
            </fieldset>
          )}
        </section>

        <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <h2 className="font-bold">실전 진행</h2>
          <p className="mt-1 text-sm text-muted-foreground">열 때마다 첫 단계부터 시작합니다.</p>
          <div className="mt-4">
            <WalkthroughTimelineViewerLauncher items={items} studentsByUid={studentsByUid} />
          </div>
        </section>

        <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <h2 className="font-bold">파티별 타임라인</h2>
          <div className="mt-4 divide-y divide-border">
            {timeline.document.parties.map((party, index) => (
              <div key={party.uid} className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{index + 1}파티</span>
                  <span className="text-sm text-muted-foreground">{party.steps.length}단계</span>
                </div>
                {party.units.some((unit) => unit.studentUid) && (
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                    {party.units
                      .filter((unit): unit is typeof unit & { studentUid: string } => Boolean(unit.studentUid))
                      .map((unit) => (
                        <div
                          key={`${party.uid}-slot-${unit.slot}`}
                          className="flex min-w-0 items-center gap-3 rounded-md bg-muted p-3"
                        >
                          <TimelineStudentImage
                            uid={unit.studentUid}
                            name={studentsByUid[unit.studentUid]?.name ?? "학생"}
                            className="size-12 shrink-0"
                          />
                          <div className="min-w-0 text-xs">
                            <p className="truncate font-medium">
                              {studentsByUid[unit.studentUid]?.name ?? "학생 정보 없음"}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {unit.snapshot?.tier ? `★${unit.snapshot.tier}` : "성급 미입력"}
                              {unit.snapshot?.level ? ` · Lv.${unit.snapshot.level}` : ""}
                              {unit.snapshot?.skillEx ? ` · EX${unit.snapshot.skillEx}` : ""}
                            </p>
                            {party.startingSkillStudentUids.includes(unit.studentUid) && (
                              <p className="mt-1 font-medium text-primary">시작 스킬</p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {signedIn && !owner && (
            <Form method="post">
              <Button
                type="submit"
                name="intent"
                value="clone"
                icon={DocumentDuplicateIcon}
                text="복제해서 내 타임라인 만들기"
                disabled={navigation.state !== "idle"}
              />
            </Form>
          )}
          {owner && (
            <Form
              method="post"
              onSubmit={(event) => {
                if (!window.confirm("이 타임라인을 삭제할까요?")) event.preventDefault();
              }}
            >
              <Button
                type="submit"
                name="intent"
                value="delete"
                icon={TrashIcon}
                text="삭제"
                variant="danger-subtle"
                disabled={navigation.state !== "idle"}
              />
            </Form>
          )}
          {!signedIn && (
            <Link to="/signin" className="text-sm text-primary hover:underline">
              로그인하면 내 타임라인으로 복제할 수 있어요.
            </Link>
          )}
        </div>
      </div>
    </Page>
  );
}
