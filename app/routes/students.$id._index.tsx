import type { MetaFunction, LoaderFunctionArgs } from "react-router";
import { isRouteErrorResponse, useLoaderData, useRouteError, Link } from "react-router";
import { useState, useMemo, useEffect } from "react";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { EmptyView, SubTitle, Title } from "~/components/atoms/typography";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { ErrorPage } from "~/components/organisms/error";
import { StudentInfo, StudentGradingComments } from "~/components/molecules/student";
import { RaidStatisticsSlotCount } from "~/components/raids";
import { getMaxTierAt } from "~/models/student";
import { FilterButtons } from "~/components/navigation";
import { BarsArrowDownIcon } from "@heroicons/react/24/outline";
import { getTagCountsByStudent, type StudentGradingTagValue } from "~/models/student-grading-tag";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading";
import { getAuthenticator } from "~/auth/authenticator.server";
import TagIcon from "~/components/atoms/student/TagIcon";
import { useSignIn } from "~/contexts/SignInProvider";
import { RecruitmentHistories } from "~/components/students";
import { fetchRaidStatisticsByStudent, type RaidStatistics  } from "~/models/raid-statistics.client";
import { getAllRaids } from "~/models/raid";
import type { RaidType, DefenseType, Terrain } from "~/models/content.d";

const studentDetailQuery = graphql(`
  query StudentDetail($uid: String!) {
    student(uid: $uid) {
      name uid attackType defenseType role school schaleDbId
      recruitments {
        since until
        event { type uid name rerun imageUrl }
      }
    }
  }
`);

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const uid = params.id!;
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

  // Get current user
  const currentUser = await getAuthenticator(env).isAuthenticated(request);

  // Get grading tag counts for this student
  const tagCounts = await getTagCountsByStudent(env, uid);

  // Get all gradings with comments and user information for this student
  const allGradings = await getStudentGradingsByStudentWithUsers(env, uid, true);

  const allRaids = await getAllRaids(env);
  return { student: data!.student!, tagCounts, allGradings, currentUser, allRaids };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: `학생 정보 | 몰루로그` }];
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
  } else {
    return <ErrorPage />;
  }
};

export default function StudentDetail() {
  const { student, tagCounts, allGradings, currentUser, allRaids } = useLoaderData<typeof loader>();

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
      defenseType: DefenseType;
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
  }, [student.uid]);

  // Memoize the sorted and sliced statistics
  const filteredStatistics = useMemo(() => {
    const sorted = [...statistics].sort((a, b) => {
      if (sort === "recent") {
        return b.raid.since.getTime() - a.raid.since.getTime();
      } else {
        return a.raid.since.getTime() - b.raid.since.getTime();
      }
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
          <div
            className="py-2 mb-4 text-center cursor-pointer hover:underline flex items-center justify-center"
            onClick={() => setRaidShowMore(!raidShowMore)}
          >
            {raidShowMore ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
            <span className="ml-1">{raidShowMore ? "접기" : "더 보기"}</span>
          </div>
        )}
      </div>

      {student.recruitments.length > 0 && (
        <>
          <SubTitle text="모집 일정" />
          <RecruitmentHistories recruitments={student.recruitments} />
        </>
      )}
    </>
  );
}

// StudentGradingChart component for displaying tag counts
type StudentGradingChartProps = {
  student: { uid: string; name: string };
  tagCounts: Array<{ tag: StudentGradingTagValue; displayName: string; count: number }>;
  noGrading: boolean;
  signedIn: boolean;
};

function StudentGradingChart({ student, tagCounts, noGrading, signedIn }: StudentGradingChartProps) {
  const { showSignIn } = useSignIn();

  // Get the maximum count for scaling the bars
  const maxCount = Math.max(...tagCounts.map(tc => tc.count), 1);

  // Show all tags, even with 0 count, and sort by count (descending)
  const allTagsWithCounts = tagCounts;

  const noGradingView = (
    <div className="mb-4 p-4 text-center text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 bg-neutral-100 dark:bg-neutral-900 transition rounded-lg cursor-pointer">
      <p className="text-sm">아직 평가가 없어요</p>
      <p className="text-xs mt-1 text-blue-600 dark:text-blue-400 group-hover:underline">
        {signedIn ? "첫 번째 평가를 작성해보세요!" : "로그인 후 첫 번째 평가를 작성해보세요!"}
      </p>
    </div>
  );

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-white dark:bg-neutral-800/50">
      <div className="space-y-3">
        {noGrading && (
          signedIn ?
            <Link to={`/students/${student.uid}/grade`} className="group">
              {noGradingView}
            </Link> :
            <div onClick={() => showSignIn()}>
              {noGradingView}
            </div>
        )}

        {allTagsWithCounts.map(({ tag, displayName, count }) => (
          <div key={tag} className="flex items-center gap-2">
            {/* Icon */}
            <div className="flex-shrink-0">
              <TagIcon tag={tag} />
            </div>

            {/* Text */}
            <div className="flex-shrink-0 w-32">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {displayName}
              </span>
            </div>

            {/* Bar */}
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 relative">
                <div 
                  className="bg-neutral-700 dark:bg-neutral-50 h-2 rounded-full transition-all duration-300 absolute left-0 top-0 min-w-0"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="ml-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 min-w-0 flex-shrink-0">
                {count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

