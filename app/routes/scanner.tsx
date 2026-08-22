import { AcademicCapIcon, ArchiveBoxIcon, ClockIcon } from "@heroicons/react/24/outline";
import { type Dispatch, type SetStateAction, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLocation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import FeatureFeedbackButton from "~/components/features/feedback/FeatureFeedbackButton";
import Page from "~/components/features/layout/Page";
import ScannerJobsPanel from "./scanner._components/ScannerJobsPanel";
import { type ScannerUploadQuota, UploadQuotaMeter } from "./scanner._components/UploadQuotaMeter";
import { getScannerQuotaError, isScannerQuotaEnabled, useScannerQuota } from "./scanner._components/useScannerQuota";

export type ScannerOutletContext = {
  imageUploadQuota: ScannerUploadQuota | null;
  setImageUploadQuota: Dispatch<SetStateAction<ScannerUploadQuota | null>>;
  videoUploadQuota: ScannerUploadQuota | null;
  setVideoUploadQuota: Dispatch<SetStateAction<ScannerUploadQuota | null>>;
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const sensei = await getActiveSensei(context.cloudflare.env, request);
  if (!sensei) return redirect("/unauthorized");
  return null;
};

export default function ScannerLayout() {
  const { pathname } = useLocation();
  const [imageQuotaError, setImageQuotaError] = useState<string | null>(null);
  const [videoQuotaError, setVideoQuotaError] = useState<string | null>(null);
  const showVideoQuota = isScannerQuotaEnabled(pathname, "video");
  const [imageUploadQuota, setImageUploadQuota] = useScannerQuota(
    "item_inventory_images_v1",
    setImageQuotaError,
    isScannerQuotaEnabled(pathname, "image"),
  );
  const [videoUploadQuota, setVideoUploadQuota] = useScannerQuota(
    "student_detail_video_v1",
    setVideoQuotaError,
    showVideoQuota,
  );
  const quotaError = getScannerQuotaError({
    imageError: imageQuotaError,
    videoError: videoQuotaError,
    showVideoQuota,
  });
  const quotaContext: ScannerOutletContext = {
    imageUploadQuota,
    setImageUploadQuota,
    videoUploadQuota,
    setVideoUploadQuota,
  };

  return (
    <Page
      title="스크린샷/영상 인식기 (β)"
      description="게임 화면 스크린샷 또는 녹화 영상을 업로드하여 인게임 데이터를 인식 후 등록할 수 있어요"
      belowTitle={
        <ScannerQuotaSummary
          imageUploadQuota={imageUploadQuota}
          videoUploadQuota={videoUploadQuota}
          showVideoQuota={showVideoQuota}
          error={quotaError}
        />
      }
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
          description: "보유 재화 화면 스크린샷",
          Icon: ArchiveBoxIcon,
          link: "/scanner/resource",
          active: pathname.startsWith("/scanner/resource"),
        },
        {
          text: "학생 성장도",
          description: "학생 상세 화면 스크린샷 또는 영상",
          Icon: AcademicCapIcon,
          link: "/scanner/student",
          active: pathname.startsWith("/scanner/student"),
        },
      ]}
    >
      <Outlet context={quotaContext} />
    </Page>
  );
}

function ScannerQuotaSummary({
  imageUploadQuota,
  videoUploadQuota,
  showVideoQuota,
  error,
}: {
  imageUploadQuota: ScannerUploadQuota | null;
  videoUploadQuota: ScannerUploadQuota | null;
  showVideoQuota: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-2" aria-busy={!imageUploadQuota || (showVideoQuota && !videoUploadQuota)}>
      <p className="py-2 text-xs font-medium text-muted-foreground">7일간 업로드 가능 횟수</p>
      <div className="flex flex-wrap gap-4">
        {imageUploadQuota ? <UploadQuotaMeter quota={imageUploadQuota} unit="장" subject="이미지" /> : null}
        {showVideoQuota && videoUploadQuota ? (
          <UploadQuotaMeter quota={videoUploadQuota} unit="개" subject="영상" />
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
