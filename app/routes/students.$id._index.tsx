import type { MetaFunction, LoaderFunctionArgs } from "react-router";
import { isRouteErrorResponse, useLoaderData, useRouteError } from "react-router";
import { useState, useMemo, useEffect } from "react";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { EmptyView, SubTitle, Title } from "~/components/primitives";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { ErrorPage } from "~/components/features/layout";
import { StudentGradingComments, StudentInfo } from "~/components/features/students";
import { RaidStatisticsSlotCount } from "~/components/features/raids";
import { getMaxTierAt } from "~/models/student";
import { FilterButtons } from "~/components/primitives";
import { BarsArrowDownIcon } from "@heroicons/react/24/outline";
import { getTagCountsByStudent } from "~/models/student-grading-tag";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading";
import { getAuthenticator } from "~/auth/authenticator.server";
import { RecruitmentHistories } from "~/components/features/students";
import { fetchRaidStatisticsByStudent, type RaidStatistics } from "~/models/raid-statistics.client";
import { getAllRaids } from "~/models/raid";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Defense } from "~/graphql/graphql";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import StudentGradingChart from "./students.$id._components/StudentGradingChart";

const studentDetailQuery = graphql(`
  query StudentDetail($uid: String!) {
    student(uid: $uid) {
      name uid attackType defenseType role school schaleDbId
      recruitments {
        since rerun
        recruitmentGroup { uid startAt endAt }
      }
    }
  }
`);

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = context.cloudflare;

  const { data, error } = await runQuery(studentDetailQuery, { uid });
  let errorMessage: string | null = null;
  if (error || !data) {
    console.error(error);
    errorMessage = "학생 정보를 가져오는 중 오류가 발생했어요";
  } else if (!data.student) {
    errorMessage = "학생 정보를 찾을 수 없어요";
  }

  if (errorMessage) {
    throw new Response(JSON.stringify({ error: { message: errorMessage } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const student = data?.student;
  if (!student) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const recruitmentGroupUids = student.recruitments.map((r) => r.recruitmentGroup.uid);
  const timelineContents = await getTimelineContentsByRecruitmentGroupUids(env, recruitmentGroupUids);
  const recruitments = timelineContents.map((c) => ({ 
    uid: c.uid, name: c.name, since: c.startAt, until: c.endAt, imageUrl: c.imageUrl ?? null,
  }));

  // Get current user
  const currentUser = await getAuthenticator(env).isAuthenticated(request);

  // Get grading tag counts for this student
  const tagCounts = await getTagCountsByStudent(env, uid);

  // Get all gradings with comments and user information for this student
  const allGradings = await getStudentGradingsByStudentWithUsers(env, uid, true);

  const allRaids = await getAllRaids(env);
  return {
    student: {
      uid: student.uid,
      name: student.name,
      attackType: student.attackType,
      defenseType: student.defenseType,
      role: student.role,
      school: student.school,
      schaleDbId: student.schaleDbId,
    },
    recruitments,
    tagCounts,
    allGradings,
    currentUser,
    allRaids,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "학생 정보 | 몰루로그" }];
  }

  const { student } = data;
  const title = `${student.name} - 학생 정보`;
  const description = `블루 아카이브 ${student.name} - 학생의 총력전/대결전 통계 정보, 선생님들의 성능 평가를 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <ErrorPage message={error.data.error.message} />;
  }
  return <ErrorPage />;
};

export default function StudentDetail() {
  const { student, recruitments, tagCounts, allGradings, currentUser, allRaids } = useLoaderData<typeof loader>();

  const [raidShowMore, setRaidShowMore] = useState(false);
  const [sort, setSort] = useState<"recent" | "old">("recent");

  // Type for enriched raid statistics with full raid details
  type EnrichedRaidStatistics = Omit<RaidStatistics, "raid"> & {
    raid: {
      uid: string;
      name: string;
      boss: string;
      type: RaidType;
      since: Date;
      until: Date;
      terrain: Terrain;
      defenseType: Defense;
      difficulty: string | null;
    };
  };

  // Convert RaidStatistics to EnrichedRaidStatistics using allRaids
  const enrichRaidStatistics = useMemo(() => {
    return (stats: RaidStatistics[]): EnrichedRaidStatistics[] => {
      return stats.map((stat): EnrichedRaidStatistics | null => {
        // Find matching raid from allRaids
        const raid = allRaids.find((r) => r.type === stat.raid.raidType && r.raidIndexJp === stat.raid.season);
        if (!raid) {
          return null;
        }

        // Find difficulty from defenseTypes
        const defenseTypeInfo = raid.defenseTypes.find((dt) => dt.defenseType === stat.raid.defenseType);
        const difficulty = defenseTypeInfo?.difficulty ?? null;
        return {
          ...stat,
          raid: {
            uid: raid.uid,
            name: raid.name,
            boss: raid.boss,
            type: raid.type as RaidType,
            since: new Date(raid.since),
            until: new Date(raid.until),
            terrain: raid.terrain as Terrain,
            defenseType: stat.raid.defenseType,
            difficulty,
          },
        };
      })
      .filter((stat): stat is EnrichedRaidStatistics => stat !== null)
      .filter((stat) => stat.slotsCount > 100); // Filter by minimum count
    };
  }, [allRaids]);

  // Memoize the filtered statistics to prevent re-computation on every render
  const [statistics, setStatistics] = useState<EnrichedRaidStatistics[]>([]);
  useEffect(() => {
    let cancelled = false;
    const loadStatistics = async () => {
      try {
        const rawStatistics = await fetchRaidStatisticsByStudent(student.uid);
        if (cancelled) {
          return;
        }
        setStatistics(enrichRaidStatistics(rawStatistics));
      } catch (error) {
        console.error(error);
      }
    };
    loadStatistics();
    return () => { cancelled = true; };
  }, [enrichRaidStatistics, student.uid]);

  // Memoize the sorted and sliced statistics
  const filteredStatistics = useMemo(() => {
    const sorted = [...statistics].sort((a, b) => {
      if (sort === "recent") {
        return b.raid.since.getTime() - a.raid.since.getTime();
      }
      return a.raid.since.getTime() - b.raid.since.getTime();
    });
    return raidShowMore ? sorted : sorted.slice(0, 5);
  }, [statistics, sort, raidShowMore]);

  return (
    <>
      <Title text="학생부" />
      <StudentInfo student={student} />

      {/* Grading Section */}
      <SubTitle text="학생 평가" />
      <StudentGradingChart student={student} tagCounts={tagCounts} noGrading={allGradings.length === 0} signedIn={currentUser !== null} />
      <StudentGradingComments student={student} gradings={allGradings} currentUser={currentUser} />

      <SubTitle text="총력전/대결전 통계" />
      <div>
        {filteredStatistics.length === 0 ?
          <EmptyView text="편성된 충력전/대결전 정보가 없어요" /> :
          <FilterButtons
            Icon={BarsArrowDownIcon}
            buttonProps={[
              { text: "최신순", onToggle: () => setSort("recent"), active: sort === "recent" },
              { text: "과거순", onToggle: () => setSort("old"), active: sort === "old" },
            ]}
            exclusive atLeastOne
          />
        }
        {filteredStatistics.map((stat) => {
          const { raid, slotsByTier, slotsCount, assistsCount, assistsByTier } = stat;
          return (
            <RaidStatisticsSlotCount
              key={`${raid.uid}-${raid.defenseType}`}
              raid={raid}
              slotsCount={slotsCount}
              slotsByTier={slotsByTier}
              assistsCount={assistsCount}
              assistsByTier={assistsByTier}
              maxTier={getMaxTierAt(raid.since)}
            />
          );
        })}
        {statistics.length > 5 && (
          <button
            type="button"
            className="w-full py-2 mb-4 text-center cursor-pointer hover:underline flex items-center justify-center"
            onClick={() => setRaidShowMore(!raidShowMore)}
          >
            {raidShowMore ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
            <span className="ml-1">{raidShowMore ? "접기" : "더 보기"}</span>
          </button>
        )}
      </div>

      {recruitments.length > 0 && (
        <>
          <SubTitle text="모집 일정" />
          <RecruitmentHistories recruitments={recruitments} />
        </>
      )}
    </>
  );
}
