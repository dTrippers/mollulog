import {
  InformationCircleIcon,
  QueueListIcon,
  ShieldCheckIcon,
  TrophyIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, Outlet, useLoaderData, useLocation, useSearchParams } from "react-router";
import { createPageErrorBoundary, Page, type PagePanelProps } from "~/components/features/layout";
import { RaidSelector } from "~/components/features/raids";
import { FilterButtons } from "~/components/primitives";
import { findCurrentOrClosestRaidSchedule, raidTypeToParam } from "~/domain/raid";
import { WALKTHROUGH_TIMELINE_DIFFICULTIES } from "~/domain/walkthrough-timeline";
import type { Defense } from "~/graphql/graphql";
import { routeError } from "~/lib/http-errors";
import { canonicalLink } from "~/lib/seo";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, raidTypeLocale } from "~/locales/ko";
import { getRaidDefenseTypeSetByQuery, getRaidDefenseTypeSetKey, type RaidDefenseTypeSet } from "~/models/raid";
import { buildRaidYoutubeSearchUrl, getVideoDateRange } from "~/models/raid-videos";
import { loadRaidSeasonPage } from "~/views/raid";

function getDefenseTypeSetLabel(defenseTypeSet: RaidDefenseTypeSet) {
  return defenseTypeSet.defenseTypes.map((defenseType) => defenseTypeLocale[defenseType]).join(" / ");
}

function getAvailableDefenseTypeSet(
  defenseTypeSets: RaidDefenseTypeSet[],
  requestedDefenseTypeSet: string | null,
  requestedDefenseType: string | null,
): RaidDefenseTypeSet {
  return (
    getRaidDefenseTypeSetByQuery(defenseTypeSets, requestedDefenseTypeSet, requestedDefenseType) ?? defenseTypeSets[0]
  );
}

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const { raidType, seasonIndex } = params;
  if (!raidType || !seasonIndex) {
    throw routeError(404, "raid.not_found", "총력전/대결전 정보를 찾을 수 없어요");
  }

  const parsedSeasonIndex = Number.parseInt(seasonIndex, 10);
  if (Number.isNaN(parsedSeasonIndex)) {
    throw routeError(404, "raid.not_found", "총력전/대결전 정보를 찾을 수 없어요");
  }

  const { currentRaid, allRaids, signedIn } = await loadRaidSeasonPage(env, request, raidType, parsedSeasonIndex);

  if (!currentRaid) {
    throw routeError(404, "raid.not_found", "총력전/대결전 정보를 찾을 수 없어요");
  }

  const videoDateRange = await getVideoDateRange(env, currentRaid);
  const currentOrClosestRaid = findCurrentOrClosestRaidSchedule(allRaids);

  return {
    currentRaid,
    currentOrClosestRaid,
    allRaids,
    signedIn,
    youtubeSearchDateRange: videoDateRange?.youtubeSearchTo
      ? {
          from: videoDateRange.youtubeSearchFrom,
          to: videoDateRange.youtubeSearchTo,
        }
      : null,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data?.currentRaid) {
    return [{ title: "총력전 정보 | 몰루로그" }];
  }

  const { currentRaid } = data;
  const since = dayjs(currentRaid.startAt);
  const title = `${raidTypeLocale[currentRaid.raidType as keyof typeof raidTypeLocale] ?? currentRaid.raidType} 시즌 #${currentRaid.seasonIndex} ${currentRaid.raidBoss.name}(${since.year()}년 ${since.month() + 1}월) 정보`;
  const description = `${since.year()}년 ${since.month() + 1}월에 진행${dayjs(currentRaid.endAt).isAfter(dayjs()) ? "될" : "된"} ${raidTypeLocale[currentRaid.raidType as keyof typeof raidTypeLocale] ?? currentRaid.raidType} ${currentRaid.raidBoss.name}의 상위권 순위, 학생 통계, 공략 영상 정보 등을 확인해보세요.`;
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

export const ErrorBoundary = createPageErrorBoundary({
  title: "총력전 정보",
  description: "일본 서버에서 개최된 총력전/대결전의 최상위권 편성, 통계, 공략 영상 정보를 확인할 수 있어요",
});

export type RaidPageContext = {
  currentRaid: Awaited<ReturnType<typeof loader>>["currentRaid"];
  allRaids: Awaited<ReturnType<typeof loader>>["allRaids"];
  defenseType: Defense;
  defenseTypeSet: RaidDefenseTypeSet;
  setPanel: (panel: PagePanelProps) => void;
  signedIn: boolean;
};

export default function RaidPage() {
  const { currentRaid, currentOrClosestRaid, allRaids, signedIn, youtubeSearchDateRange } =
    useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const raidPath = `/raids/${raidTypeToParam(currentRaid.raidType)}/${currentRaid.seasonIndex}`;
  const currentOrClosestRaidPath = currentOrClosestRaid
    ? `/raids/${raidTypeToParam(currentOrClosestRaid.raidType)}/${currentOrClosestRaid.seasonIndex}`
    : null;
  const currentOrClosestRaidTypeLabel = currentOrClosestRaid
    ? (raidTypeLocale[currentOrClosestRaid.raidType as keyof typeof raidTypeLocale] ?? currentOrClosestRaid.raidType)
    : null;
  const showCurrentOrClosestRaidLink = currentOrClosestRaidPath !== null && currentOrClosestRaidPath !== raidPath;

  const [panel, setPanel] = useState<PagePanelProps | undefined>(undefined);
  useEffect(() => {
    if (pathname !== `${raidPath}/ranks` && pathname !== `${raidPath}/videos`) {
      setPanel(undefined);
    }
  }, [pathname, raidPath]);

  const [selectedDefenseTypeSet, setDefenseTypeSet] = useState<RaidDefenseTypeSet>(() =>
    getAvailableDefenseTypeSet(
      currentRaid.defenseTypeSets,
      searchParams.get("defenseTypeSet"),
      searchParams.get("defenseType"),
    ),
  );
  useEffect(() => {
    const nextDefenseTypeSet = getAvailableDefenseTypeSet(
      currentRaid.defenseTypeSets,
      searchParams.get("defenseTypeSet"),
      searchParams.get("defenseType"),
    );
    if (getRaidDefenseTypeSetKey(selectedDefenseTypeSet) !== getRaidDefenseTypeSetKey(nextDefenseTypeSet)) {
      setDefenseTypeSet(nextDefenseTypeSet);
    }
  }, [currentRaid.defenseTypeSets, searchParams, selectedDefenseTypeSet]);

  const selectDefenseTypeSet = (defenseTypeSet: RaidDefenseTypeSet) => {
    setDefenseTypeSet(defenseTypeSet);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("defenseTypeSet", getRaidDefenseTypeSetKey(defenseTypeSet));
        next.set("defenseType", defenseTypeSet.primaryDefenseType);
        next.delete("difficulty");
        return next;
      },
      { replace: true },
    );
  };
  const selectedDefenseTypeSetKey = getRaidDefenseTypeSetKey(selectedDefenseTypeSet);
  const selectedDefense = selectedDefenseTypeSet.primaryDefenseType;
  const youtubeSearchUrl = youtubeSearchDateRange
    ? buildRaidYoutubeSearchUrl({
        raidType: currentRaid.raidType,
        bossName: currentRaid.raidBoss.nameJa,
        defenseType: selectedDefense,
        from: youtubeSearchDateRange.from,
        to: youtubeSearchDateRange.to,
      })
    : null;
  const timelineSearchParams = new URLSearchParams({
    bossUid: currentRaid.raidBoss.uid,
    terrain: currentRaid.terrain,
    defenseType: selectedDefense,
  });
  const selectedDifficulty = searchParams.get("difficulty");
  if (selectedDifficulty && WALKTHROUGH_TIMELINE_DIFFICULTIES.some((difficulty) => difficulty === selectedDifficulty)) {
    timelineSearchParams.set("difficulty", selectedDifficulty);
  }

  return (
    <Page
      title={`${raidTypeLocale[currentRaid.raidType as keyof typeof raidTypeLocale] ?? currentRaid.raidType} 정보`}
      description="총력전/대결전의 편성, 통계, 공략 영상 정보를 확인할 수 있어요"
      belowTitle={
        <RaidSelector
          raids={allRaids}
          currentRaid={currentRaid ?? null}
          belowSelector={
            showCurrentOrClosestRaidLink ? (
              <Link
                to={currentOrClosestRaidPath}
                className="mt-2 block text-right text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {`이번 개최 ${currentOrClosestRaidTypeLabel}으로 이동 →`}
              </Link>
            ) : null
          }
        />
      }
      panels={panel ? [panel] : undefined}
      links={
        youtubeSearchUrl
          ? [
              {
                Icon: VideoCameraIcon,
                title: "YouTube에서 영상 검색",
                shortTitle: "YouTube 검색",
                description: "일본 서버 개최 시점의 영상을 확인해보세요",
                to: youtubeSearchUrl,
              },
            ]
          : undefined
      }
      contentWidth={pathname.endsWith("/videos") ? "full" : "narrow"}
      screens={[
        {
          text: "시즌 통계",
          description: "플래티넘 클리어 점수 및 통계 정보",
          Icon: InformationCircleIcon,
          link: raidPath,
          active: pathname === raidPath,
        },
        {
          text: "상위권 편성",
          Icon: TrophyIcon,
          description: "상위권 편성 정보를 학생/성장도로 찾기",
          link: `${raidPath}/ranks`,
          active: pathname === `${raidPath}/ranks`,
        },
        {
          text: "영상",
          Icon: VideoCameraIcon,
          description: "공략 영상과 해당 영상에서 사용한 편성 정보 확인",
          link: `${raidPath}/videos`,
          active: pathname === `${raidPath}/videos`,
        },
        {
          text: "타임라인 (β)",
          Icon: QueueListIcon,
          description: "선생님들이 공유한 공략 타임라인 정보",
          link: `/timelines?${timelineSearchParams.toString()}`,
          active: false,
        },
      ]}
    >
      {currentRaid.defenseTypeSets.length > 1 && !pathname.endsWith("/compare") && (
        <div className="my-4">
          <FilterButtons
            surface="page"
            key={`filters-${currentRaid.uid}`}
            Icon={ShieldCheckIcon}
            buttonProps={currentRaid.defenseTypeSets.map((defenseTypeSet) => ({
              text: getDefenseTypeSetLabel(defenseTypeSet),
              subText: defenseTypeSet.difficulty ? difficultyLocale[defenseTypeSet.difficulty] : undefined,
              color: defenseTypeColor[defenseTypeSet.primaryDefenseType],
              active: getRaidDefenseTypeSetKey(defenseTypeSet) === selectedDefenseTypeSetKey,
              onToggle: () => selectDefenseTypeSet(defenseTypeSet),
            }))}
            exclusive
            atLeastOne
          />
        </div>
      )}
      <Outlet
        context={
          {
            currentRaid,
            allRaids,
            defenseType: selectedDefense,
            defenseTypeSet: selectedDefenseTypeSet,
            setPanel,
            signedIn,
          } satisfies RaidPageContext
        }
      />
    </Page>
  );
}
