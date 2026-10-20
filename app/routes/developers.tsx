import { BookOpenIcon, ClockIcon, CodeBracketIcon, KeyIcon } from "@heroicons/react/24/outline";
import { Outlet, useLocation } from "react-router";
import { ApiName } from "~/components/v2/features/developers/ApiName";
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

const developerScreens = [
  { key: "intro", text: "소개", Icon: CodeBracketIcon, path: "/developers" },
  { key: "docs", text: "API 문서", Icon: BookOpenIcon, path: "/developers/docs" },
  { key: "keys", text: "API 키", Icon: KeyIcon, path: "/developers/keys" },
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
  const items: ScreenTabItem[] = developerScreens.map(({ path, ...screen }) => ({
    ...screen,
    active: location.pathname === path,
    link: path,
  }));

  return (
    <V2Page width="wide">
      <PageHeader title={<ApiName />} />
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
