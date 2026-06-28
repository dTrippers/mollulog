import {
  ChartBarIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  TrophyIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Outlet, useLoaderData, useLocation, useSearchParams } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { createPageErrorBoundary, Page } from "~/components/features/layout";
import { RaidSelector } from "~/components/features/raids";
import { FilterButtons, type PagePanelProps } from "~/components/primitives";
import { raidTypeToParam } from "~/domain/raid";
import type { Defense } from "~/graphql/graphql";
import { routeError } from "~/lib/http-errors";
import { canonicalLink } from "~/lib/seo";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, raidTypeLocale } from "~/locales/ko";
import { type RaidDefenseTypeSet, getRaidDefenseTypeSetKey } from "~/models/raid";
import { loadRaidSeasonPage } from "~/views/raid";

function getDefenseTypeSetLabel(defenseTypeSet: RaidDefenseTypeSet) {
  return defenseTypeSet.defenseTypes.map((defenseType) => defenseTypeLocale[defenseType]).join(" / ");
}

function getAvailableDefenseTypeSet(
  defenseTypeSets: RaidDefenseTypeSet[],
  requestedDefenseTypeSet: string | null,
  requestedDefenseType: string | null,
): RaidDefenseTypeSet {
  const requestedSet = defenseTypeSets.find(
    (defenseTypeSet) => getRaidDefenseTypeSetKey(defenseTypeSet) === requestedDefenseTypeSet,
  );
  if (requestedSet) {
    return requestedSet;
  }

  const requestedPrimaryDefense = defenseTypeSets.find(
    ({ primaryDefenseType }) => primaryDefenseType === requestedDefenseType,
  );
  return requestedPrimaryDefense ?? defenseTypeSets[0];
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

  return {
    currentRaid,
    allRaids,
    signedIn,
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
  const { currentRaid, allRaids, signedIn } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const raidPath = `/raids/${raidTypeToParam(currentRaid.raidType)}/${currentRaid.seasonIndex}`;

  const [panel, setPanel] = useState<PagePanelProps | undefined>(undefined);
  useEffect(() => {
    if (pathname !== `${raidPath}/ranks`) {
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
        return next;
      },
      { replace: true },
    );
  };
  const selectedDefenseTypeSetKey = getRaidDefenseTypeSetKey(selectedDefenseTypeSet);
  const selectedDefense = selectedDefenseTypeSet.primaryDefenseType;

  return (
    <Page
      title={`${raidTypeLocale[currentRaid.raidType as keyof typeof raidTypeLocale] ?? currentRaid.raidType} 정보`}
      description="일본 서버에서 개최된 총력전/대결전의 최상위권 편성, 통계, 공략 영상 정보를 확인할 수 있어요"
      belowTitle={<RaidSelector raids={allRaids} currentRaid={currentRaid ?? null} />}
      panels={panel ? [panel] : undefined}
      screens={[
        {
          text: "시즌 요약",
          description: `${raidTypeLocale[currentRaid.raidType as keyof typeof raidTypeLocale] ?? currentRaid.raidType}의 주요 정보 요약`,
          Icon: InformationCircleIcon,
          link: raidPath,
          active: pathname === raidPath,
        },
        {
          text: "상위권 편성",
          Icon: TrophyIcon,
          link: `${raidPath}/ranks`,
          active: pathname === `${raidPath}/ranks`,
        },
        {
          text: "학생별 출전 횟수",
          Icon: ChartBarIcon,
          link: `${raidPath}/statistics`,
          active: pathname === `${raidPath}/statistics`,
        },
        {
          text: "공략 영상",
          Icon: VideoCameraIcon,
          link: `${raidPath}/videos`,
          active: pathname === `${raidPath}/videos`,
        },
      ]}
    >
      {currentRaid.defenseTypeSets.length > 1 && !pathname.endsWith("/compare") && (
        <div className="my-4">
          {!pathname.endsWith("/videos") && (
            <FilterButtons
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
          )}
        </div>
      )}
      <Outlet
        context={{
          currentRaid,
          allRaids,
          defenseType: selectedDefense,
          defenseTypeSet: selectedDefenseTypeSet,
          setPanel,
          signedIn,
        } satisfies RaidPageContext}
      />
    </Page>
  );
}
