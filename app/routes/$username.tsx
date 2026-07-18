import {
  ChartBarIcon,
  DocumentTextIcon,
  HeartIcon,
  IdentificationIcon,
  QueueListIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Outlet, type Params, useLocation, useParams, useRouteError } from "react-router";
import { ErrorPage, Page, ServerErrorPage } from "~/components/features/layout";
import { Title } from "~/components/primitives";
import { routeError } from "~/lib/http-errors";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
import { getSenseiByUsername, type Sensei } from "~/models/sensei";

export async function getRouteSensei(env: Env, params: Params<string>): Promise<Sensei> {
  const usernameParam = params.username;
  if (!usernameParam || !usernameParam.startsWith("@")) {
    throw routeError(404, "sensei.not_found", "선생님을 찾을 수 없어요");
  }

  const username = usernameParam.replace("@", "");
  const sensei = await getSenseiByUsername(env, username);
  if (!sensei) {
    throw routeError(404, "sensei.not_found", "선생님을 찾을 수 없어요", { username });
  }

  return sensei;
}

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

  const [panel, setPanel] = useState<
    { title: string; description: string; Icon: React.ElementType; children: React.ReactNode } | undefined
  >(undefined);
  useEffect(() => {
    if (currentScreen !== "students") {
      setPanel(undefined);
    }
  }, [currentScreen]);

  return (
    <Page
      title={`@${username}`}
      description="선생님의 정보를 확인해보세요"
      panels={panel ? [panel] : undefined}
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
      <Outlet context={{ setPanel }} />
    </Page>
  );
}
