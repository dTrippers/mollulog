import {
  ChartBarIcon,
  DocumentTextIcon,
  HeartIcon,
  IdentificationIcon,
  LockClosedIcon,
  QueueListIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useParams, useRouteError } from "react-router";
import { ErrorPage, Page, type PagePanelProps, ServerErrorPage } from "~/components/features/layout";
import { Title } from "~/components/primitives";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";

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

export default function User() {
  const params = useParams();
  const username = (params.username as string).replace("@", "");

  const { pathname } = useLocation();
  let currentScreen: Screen = "profile";
  if (pathname.startsWith(`/@${username}/students`)) {
    currentScreen = "students";
  } else if (pathname.startsWith(`/@${username}/pickups`)) {
    currentScreen = "pickups";
  } else if (pathname.startsWith(`/@${username}/futures`)) {
    currentScreen = "futures";
  } else if (pathname.startsWith(`/@${username}/timelines`)) {
    currentScreen = "timelines";
  } else if (pathname.startsWith(`/@${username}/parties`)) {
    currentScreen = "parties";
  }

  const [panels, setPanels] = useState<PagePanelProps[]>([]);
  useEffect(() => {
    if (currentScreen !== "students") {
      setPanels([]);
    }
  }, [currentScreen]);

  return (
    <Page
      title={`@${username}`}
      description="선생님의 정보를 확인해보세요"
      panels={panels}
      screens={[
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
      ]}
    >
      <Outlet context={{ setPanels }} />
    </Page>
  );
}
