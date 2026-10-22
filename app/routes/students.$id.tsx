import {
  ChartBarIcon,
  ChatBubbleOvalLeftIcon,
  InformationCircleIcon,
  BookOpenIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { AttributeStripes } from "~/components/v2/features/students/AttributeStripes";
import { StudentFormSwitch } from "~/components/v2/features/students/StudentFormSwitch";
import { StudentProfileFacts } from "~/components/v2/features/students/StudentProfileFacts";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { TerrainRanks } from "~/components/v2/features/students/TerrainRanks";
import {
  AsideLinks,
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  PageStackedSummary,
  PageToolbar,
  ScreenTabs,
  V2Page,
} from "~/components/v2/layout";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { toUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import { positionLocale, schoolNameLocale, tacticRoleLocale } from "~/locales/ko";
import { getStudentHeader } from "~/models/student";
import { formatStudentFullName } from "~/models/student-name";
import type { TimelineContent } from "~/models/timeline-content";
import { findEventsForRecruitmentStudent, groupTimelineContentsByRecruitmentGroupUid } from "~/models/timeline-content";
import { StudentDetailErrorBoundary } from "./students.$id._components/StudentDetailErrorBoundary";

/**
 * Restricts the events shown on a student's page to the ones actually listing that student,
 * since a recruitment group can be shared by multiple events (e.g. a rerun and its permanent
 * counterpart) that each only feature a subset of the group's students.
 */
export function getStudentRelevantTimelineContents(
  timelineContents: TimelineContent[],
  recruitmentGroupUids: string[],
  studentUid: string,
) {
  const timelineContentsByGroupUid = groupTimelineContentsByRecruitmentGroupUid(timelineContents);
  const relevantContents = recruitmentGroupUids.flatMap((groupUid) =>
    findEventsForRecruitmentStudent(timelineContentsByGroupUid.get(groupUid) ?? [], studentUid),
  );

  const seenUids = new Set<string>();
  return relevantContents.filter((content) => {
    if (seenUids.has(content.uid)) {
      return false;
    }
    seenUids.add(content.uid);
    return true;
  });
}

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "students.$id.loader",
    studentUid: uid,
  });

  let student: Awaited<ReturnType<typeof getStudentHeader>>;
  try {
    student = await getStudentHeader(env, uid);
  } catch (error) {
    logger.error("Failed to load student header", error);
    if (isStudentNotFoundError(error)) {
      throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
    }
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (student === undefined) {
    logger.error("Failed to load student header without response data");
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }
  if (!student) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }

  return {
    student: {
      ...student,
      releaseAt: student.releaseAt ? toUtcIso(student.releaseAt) : null,
    },
  };
};

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data) {
    return [{ title: "학생 정보 | 몰루로그" }];
  }

  const { student } = data;
  const studentFullName = formatStudentFullName(student);
  const title = `${studentFullName} - 학생 정보`;
  const description = `블루 아카이브 ${student.name}의 프로필, 스킬, 성장도별 능력치와 총력전·대결전 통계 및 평가를 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const ErrorBoundary = StudentDetailErrorBoundary;

export type StudentDetailPageContext = Awaited<ReturnType<typeof loader>>;

export default function StudentDetailPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const { student } = loaderData;
  const title = (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-[10px] gap-y-1">
      <span className="break-words">{student.name}</span>
      <StudentFormSwitch student={student} />
    </span>
  );
  const fullName = formatStudentFullName(student);
  const headerMeta = (
    <div className="flex min-w-0 flex-col gap-1">
      <p>{[schoolNameLocale[student.school], student.catalog?.profile.schoolYear].filter(Boolean).join(" · ")}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <AttributeStripes attackType={student.attackType} defenseType={student.defenseType} role={student.role} />
        <span className="text-xs text-v2-fg-secondary">
          {positionLocale[student.position]} · {tacticRoleLocale[student.tacticRole]}
        </span>
        {student.catalog?.terrainAdaptations ? <TerrainRanks terrainAdaptations={student.catalog.terrainAdaptations} /> : null}
      </div>
    </div>
  );
  const schaleDbLink = student.schaleDbId
    ? {
        key: "schale-db",
        title: "Schale DB",
        Icon: BookOpenIcon,
        to: `https://schaledb.com/student/${student.schaleDbId}`,
      }
    : null;
  const videoLink = { key: "scanner", title: "영상 인식기", Icon: VideoCameraIcon, to: "/scanner/student" };
  const mobileLinks = [...(schaleDbLink ? [{ ...schaleDbLink, shortTitle: "SchaleDB" }] : []), { ...videoLink, shortTitle: "인식기" }];

  return (
    <V2Page width="reading">
      <div className="contents max-md:[&_.v2-header]:-mt-1.5 md:[&_.v2-header]:-translate-y-6 md:[&_.v2-header]:-mb-[23px] md:[&_.v2-header_h1]:!leading-[1.4]">
        <PageHeader
          title={title}
          back={{ title: "학생 목록", to: "/students" }}
          media={<StudentThumb studentUid={student.uid} name={fullName} variant={null} showCaption={false} />}
          meta={headerMeta}
        />
      </div>
      <PageStackedSummary>
        <StudentProfileFacts student={student} compact />
      </PageStackedSummary>
      <PageToolbar>
        <ScreenTabs
          items={[
            {
              key: "info",
              text: "학생 정보",
              Icon: InformationCircleIcon,
              link: `/students/${student.uid}`,
              active: pathname === `/students/${student.uid}`,
            },
            {
              key: "stats",
              text: "편성/통계",
              Icon: ChartBarIcon,
              link: `/students/${student.uid}/statistics`,
              active: pathname === `/students/${student.uid}/statistics`,
            },
            {
              key: "gradings",
              text: "평가",
              Icon: ChatBubbleOvalLeftIcon,
              link: `/students/${student.uid}/gradings`,
              active: pathname === `/students/${student.uid}/gradings` || pathname === `/students/${student.uid}/grade`,
            },
          ]}
        />
      </PageToolbar>
      <PageAside>
        <StudentProfileFacts student={student} />
        <AsideLinks items={[...(schaleDbLink ? [schaleDbLink] : []), videoLink]} />
      </PageAside>
      <div className="contents [&_.v2-action-bar]:!bottom-[68px]">
        <MobileActionBar links={pathname.endsWith("/grade") ? [] : mobileLinks} />
      </div>
      <PageMain>
        <Outlet context={loaderData satisfies StudentDetailPageContext} />
      </PageMain>
    </V2Page>
  );
}
