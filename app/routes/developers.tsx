import { BookOpenIcon, ClockIcon, CodeBracketIcon, KeyIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { Outlet, useLocation } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { DeveloperCenterName } from "~/components/v2/features/developers/ApiName";
import {
  AsideLinks,
  MobileActionBar,
  PageAside,
  PageHeader,
  ScreenNavigation,
  ScreenNavigationFocusScope,
  ScreenNavigationToolbar,
  V2Page,
} from "~/components/v2/layout";
import type { ScreenTabItem } from "~/components/v2/layout";
import { getSenseiById } from "~/models/sensei";

const developerScreens = (canManageApplications: boolean) => [
  { key: "intro", text: "소개", Icon: CodeBracketIcon, path: "/developers" },
  { key: "docs", text: "API 문서", Icon: BookOpenIcon, path: "/developers/docs" },
  { key: "keys", text: "API 키", Icon: KeyIcon, path: "/developers/keys" },
  {
    key: "applications",
    text: "애플리케이션",
    Icon: Squares2X2Icon,
    path: "/developers/applications",
    disabled: !canManageApplications,
    label: canManageApplications ? undefined : "준비중",
  },
];

const historyLink = {
  key: "history",
  title: "데이터 변경 이력",
  shortTitle: "변경 이력",
  description: "API로 변경한 데이터를 확인해요.",
  Icon: ClockIcon,
  to: "/data-history?filter=api",
};

export default function DevelopersLayout() {
  const location = useLocation();
  const { canManageApplications } = useLoaderData<typeof loader>();
  const items: ScreenTabItem[] = developerScreens(canManageApplications).map(({ path, ...screen }) => ({
    ...screen,
    active: path === "/developers" ? location.pathname === path : location.pathname.startsWith(path),
    ...(screen.disabled ? {} : { link: path }),
  }));

  return (
    <V2Page width="wide">
      <PageHeader title={<DeveloperCenterName />} />
      <ScreenNavigationFocusScope>
        <ScreenNavigationToolbar items={items} />
        <PageAside>
          <ScreenNavigation items={items} />
          <AsideLinks items={[historyLink]} />
        </PageAside>
      </ScreenNavigationFocusScope>
      <Outlet />
      <MobileActionBar links={[historyLink]} />
    </V2Page>
  );
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return { canManageApplications: false };
  const current = await getSenseiById(env, sensei.id, { ctx });
  return {
    canManageApplications:
      current?.active === true && (current.role === "app_developer" || current.role === "admin"),
  };
}
