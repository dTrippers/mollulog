import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { isRouteErrorResponse, Outlet, useLoaderData, useLocation, useRouteError } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { ShieldCheckIcon, InformationCircleIcon, TrophyIcon, ChartBarIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { ErrorPage } from "~/components/organisms/error";
import { FilterButtons, Page, type PagePanelProps } from "~/components/navigation";
import { RaidSelector } from "~/components/raids";
import { defenseTypeColor, defenseTypeLocale, raidTypeLocale } from "~/locales/ko";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getAllRaids, getRaidDetail } from "~/models/raid";
import type { Defense } from "~/graphql/graphql";


export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const raidDetail = await getRaidDetail(env, params.id!);
  if (!raidDetail) {
    throw new Response(
      JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const sensei = await getAuthenticator(env).isAuthenticated(request);
  return {
    currentRaid: raidDetail,
    allRaids: await getAllRaids(env),
    signedIn: sensei !== null,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.currentRaid) {
    return [{ title: "총력전 정보 | 몰루로그" }];
  }

  const { currentRaid } = data;
  const since = dayjs(currentRaid.since);
  const title = `${raidTypeLocale[currentRaid.type]} ${currentRaid.name}(${since.year()}년 ${since.month() + 1}월) 정보`;
  const description = `${since.year()}년 ${since.month() + 1}월에 진행${dayjs(currentRaid.until).isAfter(dayjs()) ? "될" : "된"} ${raidTypeLocale[currentRaid.type]} ${currentRaid.name}의 상위권 순위, 학생 통계, 공략 영상 정보 등을 확인해보세요.`;
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

export type RaidPageContext = {
  currentRaid: Awaited<ReturnType<typeof loader>>["currentRaid"];
  allRaids: Awaited<ReturnType<typeof loader>>["allRaids"];
  defenseType: Defense;
  setPanel: (panel: PagePanelProps) => void;
  signedIn: boolean;
};

export default function RaidPage() {
  const { currentRaid, allRaids, signedIn } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const videoAvailable = currentRaid.videos.pageInfo.hasNextPage;

  const [panel, setPanel] = useState<PagePanelProps | undefined>(undefined);
  useEffect(() => {
    // 요약 페이지와 순위 페이지에서만 panel 표시
    if (pathname !== `/raids/${currentRaid.uid}/ranks`) {
      setPanel(undefined);
    }
  }, [pathname, currentRaid.uid, setPanel]);

  const [selectedDefense, setDefense] = useState<Defense>(currentRaid.defenseTypes[0].defenseType);
  useEffect(() => {
    if (!currentRaid.defenseTypes.some(({ defenseType }) => defenseType === selectedDefense)) {
      setDefense(currentRaid.defenseTypes[0].defenseType);
    }
  }, [currentRaid.defenseTypes]);

  return (
    <Page
      title={`${raidTypeLocale[currentRaid.type]} 정보`}
      description={`일본 서버에서 개최된 총력전/대결전의 최상위권 편성, 통계, 공략 영상 정보를 확인할 수 있어요`}
      belowTitle={<RaidSelector raids={allRaids} currentRaid={currentRaid ?? null} />}
      panels={panel ? [panel] : undefined}
      screens={currentRaid.rankVisible ? [
        {
          text: "시즌 요약",
          description: `${raidTypeLocale[currentRaid.type]}의 주요 정보 요약`,
          Icon: InformationCircleIcon,
          link: `/raids/${currentRaid.uid}`,
          active: pathname === `/raids/${currentRaid.uid}`,
        },
        {
          text: "상위권 편성",
          Icon: TrophyIcon,
          link: `/raids/${currentRaid.uid}/ranks`,
          active: pathname === `/raids/${currentRaid.uid}/ranks`,
        },
        {
          text: "학생별 출전 횟수",
          Icon: ChartBarIcon,
          link: `/raids/${currentRaid.uid}/statistics`,
          active: pathname === `/raids/${currentRaid.uid}/statistics`,
        },
        {
          text: "공략 영상 (베타)",
          Icon: VideoCameraIcon,
          link: `/raids/${currentRaid.uid}/videos`,
          active: pathname === `/raids/${currentRaid.uid}/videos`,
          disabled: !videoAvailable,
        },
      ] : undefined}
    >
      {currentRaid.defenseTypes.length > 1 && !pathname.endsWith("/compare") && (
        <div className="my-4">
          <FilterButtons
            key={`filters-${currentRaid.uid}`}
            Icon={ShieldCheckIcon}
            buttonProps={currentRaid.defenseTypes.map(({ defenseType }) => ({
              text: defenseTypeLocale[defenseType],
              color: defenseTypeColor[defenseType],
              active: defenseType === selectedDefense,
              onToggle: () => setDefense(defenseType),
            }))}
            exclusive atLeastOne
          />
        </div>
      )}
      <Outlet context={{ currentRaid, allRaids, defenseType: selectedDefense, setPanel, signedIn } satisfies RaidPageContext} />
    </Page>
  );
}
