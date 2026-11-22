import { ArrowDownTrayIcon, ArrowUpTrayIcon, CameraIcon, ClockIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { PageAside } from "~/components/v2/layout/PageAside";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import { ScreenNavigation, ScreenNavigationToolbar } from "~/components/v2/layout/ScreenNavigation";
import type { ScreenTabItem } from "~/components/v2/layout/ScreenTabs";
import { ScreenNavigationFocusScope } from "~/components/v2/layout/screen-navigation-focus";
import { V2Page } from "~/components/v2/layout/V2Page";

export type ConnectScreen = "scanner" | "import" | "export" | "history";

const connectScreens = [
  { key: "scanner", text: "게임 화면 인식기", shortText: "인식기", link: "/scanner", Icon: CameraIcon },
  { key: "import", text: "데이터 가져오기", shortText: "가져오기", link: "/connect/import", Icon: ArrowDownTrayIcon },
  { key: "export", text: "데이터 내보내기", shortText: "내보내기", link: "/connect/export", Icon: ArrowUpTrayIcon },
  { key: "history", text: "데이터 변경 이력", shortText: "변경 이력", link: "/data-history", Icon: ClockIcon },
] as const satisfies readonly {
  key: ConnectScreen;
  text: string;
  shortText: string;
  link: string;
  Icon: ScreenTabItem["Icon"];
}[];

/**
 * The group's screens as navigation items. The Aside shows the full names, and the stacked tabs show the short ones.
 * The scanner uses the same items beside its own tabs, so every screen of the group shares one navigation.
 */
export function getConnectScreenItems(current: ConnectScreen, variant: "aside" | "tabs"): ScreenTabItem[] {
  return connectScreens.map((screen) => ({
    key: screen.key,
    text: variant === "aside" ? screen.text : screen.shortText,
    Icon: screen.Icon,
    link: screen.link,
    active: screen.key === current,
  }));
}

type ConnectScreenLayoutProps = {
  current: Exclude<ConnectScreen, "scanner">;
  title: ReactNode;
  description?: string;
  back?: { title: string; to: string };
  meta?: ReactNode;
  children: ReactNode;
  // Extra page-level content after the main column, such as a bar pinned to the bottom of the screen.
  footer?: ReactNode;
};

/**
 * The shared shell of the data connect screens: one header across the full width, with the group navigation in the
 * Aside (stacked tabs on narrow screens) and the screen's content in the main column.
 */
export function ConnectScreenLayout({
  current,
  title,
  description,
  back,
  meta,
  children,
  footer,
}: ConnectScreenLayoutProps) {
  return (
    <V2Page width="wide">
      <PageHeader title={title} description={description} back={back} meta={meta} />
      <ScreenNavigationFocusScope>
        <ScreenNavigationToolbar items={getConnectScreenItems(current, "tabs")} />
        <PageAside>
          <ScreenNavigation items={getConnectScreenItems(current, "aside")} />
        </PageAside>
      </ScreenNavigationFocusScope>
      <PageMain>{children}</PageMain>
      {footer}
    </V2Page>
  );
}
