import { AcademicCapIcon, ArchiveBoxIcon, ClockIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLocation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import FeatureFeedbackButton from "~/components/features/feedback/FeatureFeedbackButton";
import Page from "~/components/features/layout/Page";
import ScannerJobsPanel from "./scanner._components/ScannerJobsPanel";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const sensei = await getActiveSensei(context.cloudflare.env, request);
  if (!sensei) return redirect("/unauthorized");
  return null;
};

export default function ScannerLayout() {
  const { pathname } = useLocation();

  return (
    <Page
      title="스크린샷/영상 인식기 (β)"
      description="게임 화면 스크린샷 또는 녹화한 파일을 업로드하여 보유 재화 수량, 학생 성장도 정보를 인식할 수 있어요"
      contentWidth="full"
      maxWidth="wide"
      layout="horizontal"
      panels={[
        {
          title: "진행 상황",
          description: "최근 7일 동안의 인식 작업",
          Icon: ClockIcon,
          children: <ScannerJobsPanel />,
        },
      ]}
      belowPanels={<FeatureFeedbackButton featureName="스크린샷 인식기" feedbackType="resource_scanner_feedback" />}
      screens={[
        {
          text: "아이템",
          description: "보유 재화 수량 스크린샷을 인식",
          Icon: ArchiveBoxIcon,
          link: "/scanner/resource",
          active: pathname.startsWith("/scanner/resource"),
        },
        {
          text: "학생 성장도",
          description: "학생 기본 정보 녹화 영상을 인식",
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
