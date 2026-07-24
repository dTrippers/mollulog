import { AcademicCapIcon, ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { Outlet, useLocation } from "react-router";
import Page from "~/components/features/layout/Page";

export default function ScannerLayout() {
  const { pathname } = useLocation();

  return (
    <Page
      title="게임 화면 인식"
      description="직접 촬영한 게임 화면에서 재화와 학생 성장도를 인식한 뒤 검토하여 반영할 수 있어요"
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
        {
          text: "학생 성장도",
          description: "학생부 녹화 영상에서 현재 성장도를 인식",
          Icon: AcademicCapIcon,
          link: "/scanner/student",
          active: pathname.startsWith("/scanner/student"),
        },
      ]}
    >
      <Outlet />
    </Page>
  );
}
