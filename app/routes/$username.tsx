import {
  ChartBarIcon,
  DocumentTextIcon,
  HeartIcon,
  IdentificationIcon,
  LockClosedIcon,
  QueueListIcon,
  UserIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useMatches, useOutletContext, useParams, useRouteError } from "react-router";
import { ErrorPage, Page, type PagePanelProps, ServerErrorPage } from "~/components/features/layout";
import PageLink, { type PageLinkProps } from "~/components/features/layout/PageLink";
import SegmentedControl from "~/components/primitives/SegmentedControl";
import { Title } from "~/components/primitives";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
import type { RootOutletContext } from "~/root";

export const ErrorBoundary = () => {
  const error = useRouteError();
  const normalized = normalizeRouteError(error);
  if (isServerRouteError(normalized)) {
    return <ServerErrorPage status={normalized.status} title={normalized.title} message={normalized.message} />;
  }

  const details = normalized.details;
  const username =
    typeof details === "object" && details !== null && "username" in details && typeof details.username === "string"
      ? details.username
      : undefined;

  if (normalized.code === "sensei.profile_private") {
    return (
      <div className="space-y-6">
        {username && <Title text={`@${username}`} />}
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 text-center">
          <LockClosedIcon className="size-10 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">비공개 프로필이에요</p>
            <p className="mt-1 text-sm text-muted-foreground">
              이 프로필의 정보와 작성한 콘텐츠는 본인만 볼 수 있어요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {username && <Title text={`@${username}`} />}
      <ErrorPage status={normalized.status} title={normalized.title} message={normalized.message} />
    </>
  );
};

type Screen = "profile" | "students" | "pickups" | "futures" | "parties" | "timelines";
type UserPageLinksState = { username: string; links: PageLinkProps[] };

export function getUserPagePresentation(pathname: string, username: string, isOwner: boolean) {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  let currentScreen: Screen = "profile";
  if (normalizedPathname.startsWith(`/@${username}/students`)) {
    currentScreen = "students";
  } else if (normalizedPathname.startsWith(`/@${username}/pickups`)) {
    currentScreen = "pickups";
  } else if (normalizedPathname.startsWith(`/@${username}/futures`)) {
    currentScreen = "futures";
  } else if (normalizedPathname.startsWith(`/@${username}/timelines`)) {
    currentScreen = "timelines";
  } else if (normalizedPathname.startsWith(`/@${username}/parties`)) {
    currentScreen = "parties";
  }

  const isOwnerDataScreen =
    isOwner &&
    (currentScreen === "students" ||
      currentScreen === "pickups" ||
      currentScreen === "futures" ||
      currentScreen === "timelines" ||
      currentScreen === "parties");
  const isOwnerProfileLanding = isOwner && normalizedPathname === `/@${username}`;
  const isOwnerDataPage = isOwnerDataScreen || isOwnerProfileLanding;
  const screens = isOwnerDataPage
    ? [
          {
            text: "프로필",
            Icon: UserCircleIcon,
            link: `/@${username}`,
            active: isOwnerProfileLanding,
          },
          { text: "모집한 학생", Icon: UserIcon, link: `/@${username}/students`, active: currentScreen === "students" },
          {
            text: "모집 기록",
            Icon: ChartBarIcon,
            link: `/@${username}/pickups`,
            active: currentScreen === "pickups",
          },
          {
            text: "관심 학생",
            Icon: HeartIcon,
            link: `/@${username}/futures`,
            active: currentScreen === "futures",
          },
          {
            text: "공략 작성하기",
            Icon: QueueListIcon,
            link: `/@${username}/timelines`,
            active: currentScreen === "timelines" || currentScreen === "parties",
          },
        ]
      : [
          { text: "프로필 정보", Icon: IdentificationIcon, link: `/@${username}`, active: currentScreen === "profile" },
          { text: "모집한 학생", Icon: UserIcon, link: `/@${username}/students`, active: currentScreen === "students" },
          {
            text: "모집 이력/통계",
            Icon: ChartBarIcon,
            link: `/@${username}/pickups`,
            active: currentScreen === "pickups",
          },
          { text: "관심 학생", Icon: HeartIcon, link: `/@${username}/futures`, active: currentScreen === "futures" },
          {
            text: "공략 타임라인",
            Icon: QueueListIcon,
            link: `/@${username}/timelines`,
            active: currentScreen === "timelines",
          },
          {
            text: "편성/공략",
            Icon: DocumentTextIcon,
            link: `/@${username}/parties`,
            active: currentScreen === "parties",
          },
        ];

  return {
    currentScreen,
    isOwnerDataScreen,
    isOwnerDataPage,
    isOwnerProfileLanding,
    title: isOwnerDataPage ? "나의 데이터" : `@${username}`,
    description: isOwnerDataPage ? undefined : "선생님의 정보를 확인해보세요",
    screens,
  };
}

export function shouldShowUserLegacyPartySwitcher(
  pathname: string,
  username: string,
  isOwner: boolean,
  hasParties: boolean,
): boolean {
  return (
    isOwner &&
    hasParties &&
    (pathname === `/@${username}/timelines` || pathname === `/@${username}/parties`)
  );
}

export function getUserPageHasParties(matches: readonly { data: unknown }[]): boolean {
  return matches.some(({ data }) => {
    if (typeof data !== "object" || data === null || !("hasParties" in data)) return false;
    return data.hasParties === true;
  });
}

export function getUserPageLinks(
  currentScreen: Screen,
  username: string,
  links: UserPageLinksState | undefined,
): PageLinkProps[] | undefined {
  return currentScreen === "students" && links?.username === username ? links.links : undefined;
}

export default function User() {
  const params = useParams();
  const username = (params.username as string).replace("@", "");
  const { pathname } = useLocation();
  const { currentUsername } = useOutletContext<RootOutletContext>();
  const isOwner = currentUsername === username;
  const hasParties = getUserPageHasParties(useMatches());
  const presentation = getUserPagePresentation(pathname, username, isOwner);
  const { currentScreen } = presentation;

  const [panels, setPanels] = useState<PagePanelProps[]>([]);
  const [links, setLinks] = useState<UserPageLinksState | undefined>(undefined);
  const setPageLinks = useCallback(
    (nextLinks: PageLinkProps[] | undefined) => {
      setLinks(nextLinks ? { username, links: nextLinks } : undefined);
    },
    [username],
  );
  const isOwnerLegacyPartyScreen = shouldShowUserLegacyPartySwitcher(pathname, username, isOwner, hasParties);

  useEffect(() => {
    if (currentScreen !== "students") {
      setPanels([]);
      setLinks(undefined);
    }
  }, [currentScreen]);

  return (
    <Page
      title={presentation.title}
      description={presentation.description}
      belowTitle={
        isOwner && currentScreen === "students" ? (
          <PageLink
            Icon={IdentificationIcon}
            title="학생부"
            description="모든 학생의 프로필과 통계를 확인해요"
            to="/students"
          />
        ) : undefined
      }
      panels={panels}
      links={getUserPageLinks(currentScreen, username, links)}
      screens={presentation.screens}
    >
      {isOwnerLegacyPartyScreen ? (
        <div className="mb-4">
          <SegmentedControl
            ariaLabel="내 공략 화면"
            value={currentScreen === "parties" ? "parties" : "timelines"}
            options={[
              { value: "timelines", label: "공략 타임라인", to: `/@${username}/timelines` },
              { value: "parties", label: "이전 편성·공략", to: `/@${username}/parties` },
            ]}
          />
        </div>
      ) : null}
      <Outlet context={{ setPanels, setLinks: setPageLinks }} />
    </Page>
  );
}
