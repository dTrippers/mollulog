import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Page } from "~/components/features/layout";

type ConnectDataScreen = "import" | "export";

type ConnectDataPageProps = {
  currentScreen: ConnectDataScreen;
  pendingDraftCount: number;
  children: ReactNode;
};

export default function ConnectDataPage({ currentScreen, pendingDraftCount, children }: ConnectDataPageProps) {
  const pendingDraftLabel = pendingDraftCount > 0 ? pendingDraftCount.toLocaleString() : undefined;

  return (
    <Page
      title="외부 데이터 연동"
      description="외부 사이트의 데이터를 가져오거나 내보낼 수 있어요"
      screens={[
        {
          text: "데이터 가져오기",
          label: pendingDraftLabel,
          description: "외부 사이트 데이터 가져오기",
          Icon: ArrowDownTrayIcon,
          link: "/connect/import",
          active: currentScreen === "import",
        },
        {
          text: "데이터 내보내기",
          description: "외부 사이트로 데이터 내보내기",
          Icon: ArrowUpTrayIcon,
          link: "/connect/export",
          active: currentScreen === "export",
        },
      ]}
    >
      {children}
    </Page>
  );
}
