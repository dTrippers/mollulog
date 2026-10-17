import { AcademicCapIcon, ArchiveBoxIcon, ChatBubbleOvalLeftIcon, ClockIcon } from "@heroicons/react/24/outline";
import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLocation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { FeedbackSheet } from "~/components/v2/features/feedback/FeedbackSheet";
import {
  ScannerQuota,
  ScannerQuotaMeter,
  type ScannerQuotaMeterState,
} from "~/components/v2/features/scanner/ScannerQuota";
import { MobileActionBar } from "~/components/v2/layout/MobileActionBar";
import { PageAside } from "~/components/v2/layout/PageAside";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import { PageToolbar } from "~/components/v2/layout/PageToolbar";
import { PanelSheet } from "~/components/v2/layout/PanelSheet";
import { ScreenTabs } from "~/components/v2/layout/ScreenTabs";
import { V2Page, type V2PanelRequest } from "~/components/v2/layout/V2Page";
import { Button } from "~/components/v2/primitives/Button";
import ScannerJobsPanel from "./scanner._components/ScannerJobsPanel";
import type { ScannerUploadQuota } from "./scanner._components/UploadQuotaMeter";
import { getScannerQuotaDisplayState, useScannerQuota } from "./scanner._components/useScannerQuota";

export type ScannerOutletContext = {
  imageUploadQuota: ScannerUploadQuota | null;
  setImageUploadQuota: Dispatch<SetStateAction<ScannerUploadQuota | null>>;
  videoUploadQuota: ScannerUploadQuota | null;
  setVideoUploadQuota: Dispatch<SetStateAction<ScannerUploadQuota | null>>;
  // Opens the recent-jobs sheet on stacked layouts, such as the "최근 작업" button of a step.
  openJobsPanel: () => void;
  // Hides the stacked action bar while a step has its own bottom action bar, such as selected files or a review.
  setMobileActionBarHidden: (hidden: boolean) => void;
  // The stacked layout from V2Page. Stacked screens show their mobile controls: the select button, fixed bars, and the PC notice.
  stacked: boolean;
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const sensei = await getActiveSensei(context.cloudflare.env, request);
  if (!sensei) return redirect("/unauthorized");
  return null;
};

const FEEDBACK_TITLE = "의견/오류 제보";

export default function ScannerLayout() {
  const { pathname } = useLocation();
  const image = useScannerQuota("item_inventory_images_v1");
  const video = useScannerQuota("student_detail_video_v1");
  const [panelRequest, setPanelRequest] = useState<V2PanelRequest | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isMobileActionBarHidden, setMobileActionBarHidden] = useState(false);
  const [isStacked, setStacked] = useState(false);
  const openJobsPanel = useCallback(
    () => setPanelRequest((current) => ({ panelId: "jobs", requestId: (current?.requestId ?? 0) + 1 })),
    [],
  );
  const quotaContext: ScannerOutletContext = {
    imageUploadQuota: image.quota,
    setImageUploadQuota: image.setQuota,
    videoUploadQuota: video.quota,
    setVideoUploadQuota: video.setQuota,
    openJobsPanel,
    setMobileActionBarHidden,
    stacked: isStacked,
  };

  return (
    <V2Page width="wide" panelRequest={panelRequest} onStackedChange={setStacked}>
      <PageHeader
        title="게임 화면 인식기"
        description="게임 화면 스크린샷 또는 녹화 영상을 업로드하여 인게임 데이터를 인식 후 등록할 수 있어요"
        trailing={
          <ScannerQuota>
            <ScannerQuotaMeter subject="이미지" state={toMeterState(image)} />
            <ScannerQuotaMeter subject="영상" state={toMeterState(video)} />
          </ScannerQuota>
        }
      />
      <PageToolbar>
        <ScreenTabs
          items={[
            {
              key: "resource",
              text: "아이템",
              Icon: ArchiveBoxIcon,
              link: "/scanner/resource",
              active: pathname.startsWith("/scanner/resource"),
            },
            {
              key: "student",
              text: "학생 성장도",
              Icon: AcademicCapIcon,
              link: "/scanner/student",
              active: pathname.startsWith("/scanner/student"),
            },
          ]}
        />
      </PageToolbar>
      <PageMain>
        <Outlet context={quotaContext} />
      </PageMain>
      <PageAside>
        <PanelSheet panelId="jobs" title="진행 상황" description="최근 7일 동안의 인식 작업" Icon={ClockIcon}>
          <ScannerJobsPanel />
        </PanelSheet>
        <div className="flex justify-end">
          <Button variant="secondary" className="text-xs" onClick={() => setIsFeedbackOpen(true)}>
            <ChatBubbleOvalLeftIcon className="size-4" aria-hidden="true" />
            {FEEDBACK_TITLE}
          </Button>
        </div>
      </PageAside>
      <div className={isMobileActionBarHidden ? "hidden" : undefined}>
        <MobileActionBar
          links={[
            {
              key: "feedback",
              title: FEEDBACK_TITLE,
              shortTitle: "제보",
              Icon: ChatBubbleOvalLeftIcon,
              onClick: () => setIsFeedbackOpen(true),
            },
          ]}
          panels={[{ panelId: "jobs", title: "진행 상황", Icon: ClockIcon }]}
        />
      </div>
      <FeedbackSheet
        open={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        featureName="스크린샷 인식기"
        feedbackType="resource_scanner_feedback"
      />
    </V2Page>
  );
}

// Both kinds use the same meter. Exhaustion is an error color with the next available time; a low amount is a warning color.
function toMeterState(quota: {
  quota: ScannerUploadQuota | null;
  hasError: boolean;
  retry: () => void;
}): ScannerQuotaMeterState {
  const state = getScannerQuotaDisplayState(quota.quota, quota.hasError);
  if (state.kind === "loading") return { kind: "loading" };
  if (state.kind === "error") return { kind: "error", onRetry: quota.retry };
  if (state.kind === "exhausted") {
    return {
      kind: "exhausted",
      remaining: state.quota.remaining,
      limit: state.quota.limit,
      availableAt: state.quota.nextAvailableAt,
    };
  }
  if (state.kind === "low") return { kind: "low", remaining: state.quota.remaining, limit: state.quota.limit };
  return { kind: "normal", remaining: state.quota.remaining, limit: state.quota.limit };
}
