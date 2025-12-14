import { data } from "react-router";
import { Outlet, type Params, isRouteErrorResponse, useParams, useRouteError, useLocation } from "react-router";
import { ChartBarIcon, DocumentTextIcon, HeartIcon, IdentificationIcon, UserIcon } from "@heroicons/react/24/outline";
import { Title } from "~/components/atoms/typography";
import { Page } from "~/components/navigation";
import { ErrorPage } from "~/components/organisms/error";
import { getSenseiByUsername, type Sensei } from "~/models/sensei";
import { useEffect, useState } from "react";

export async function getRouteSensei(env: Env, params: Params<string>): Promise<Sensei> {
  const usernameParam = params.username;
  if (!usernameParam || !usernameParam.startsWith("@")) {
    throw new Error("Not found");
  }

  const username = usernameParam.replace("@", "");
  const sensei = await getSenseiByUsername(env, username);
  if (!sensei) {
    throw data(
      { error: { message: "선생님을 찾을 수 없어요", data: { username } } },
      { status: 404 },
    );
  }

  return sensei;
}

export const ErrorBoundary = () => {
  const error = useRouteError();
  let username, message;
  if (isRouteErrorResponse(error)) {
    username = error.data.error.data.username;
    message = error.data.error.message;
  }

  return (
    <>
      {username && <Title text={`@${username}`} />}
      <ErrorPage message={message} />
    </>
  )
};

type Screen = "profile" | "students" | "pickups" | "futures" | "parties";

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
  } else if (pathname.startsWith(`/@${username}/parties`)) {
    currentScreen = "parties";
  }

  const [panel, setPanel] = useState<{ title: string; description: string; Icon: React.ElementType; children: React.ReactNode } | undefined>(undefined);
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
        { text: "프로필 정보", Icon: UserIcon, link: `/@${username}`, active: currentScreen === "profile" },
        { text: "모집한 학생", Icon: IdentificationIcon, link: `/@${username}/students`, active: currentScreen === "students" },
        { text: "모집 이력/통계", Icon: ChartBarIcon, link: `/@${username}/pickups`, active: currentScreen === "pickups" },
        { text: "관심 학생", Icon: HeartIcon, link: `/@${username}/futures`, active: currentScreen === "futures" },
        { text: "편성/공략", Icon: DocumentTextIcon, link: `/@${username}/parties`, active: currentScreen === "parties" },
      ]}
    >
      <Outlet context={{ setPanel }} />
    </Page>
  );
}
