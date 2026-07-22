import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { Outlet, useLocation } from "react-router";
import Page from "~/components/features/layout/Page";

export default function ScannerLayout() {
  const { pathname } = useLocation();

  return (
    <Page
      title="스크린샷 인식기"
      description="게임 스크린샷에서 보유 재화 수량을 인식하고 각종 플래너에 반영할 수 있어요"
      contentWidth="full"
      layout="vertical"
      screens={[
        {
          text: "아이템",
          description: "아이템 화면에서 보유 재화 수량을 인식",
          Icon: ArchiveBoxIcon,
          link: "/scanner/resource",
          active: pathname.startsWith("/scanner/resource"),
        },
      ]}
    >
      <Outlet />
    </Page>
  );
}
