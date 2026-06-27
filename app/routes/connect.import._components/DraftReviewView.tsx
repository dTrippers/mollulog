import type { ReactNode } from "react";
import { useId } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { Form, Link, useNavigation } from "react-router";
import { Button, Callout } from "~/components/primitives";
import type { SyncDraft, SyncDraftStatus, SyncDraftType } from "~/models/sync-draft";
import type { ItemCatalogResource } from "~/models/item-catalog";

export type SyncDraftDisplayMetadata = {
  label: string;
  item?: ItemCatalogResource;
  studentUid?: string;
  equipments?: string[];
  hasGear?: boolean;
  initialTier?: number;
};

export type SyncDraftReviewActionData = {
  intent?: "apply" | "discard";
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

type DraftReviewNotice = {
  id: string;
  tone: "danger" | "warning";
  content: ReactNode;
};

type DraftReviewViewProps = {
  lowConfidenceCount?: number;
  notices?: DraftReviewNotice[];
  actionData?: SyncDraftReviewActionData;
  children: ReactNode;
  actions?: ReactNode;
};

type DraftReviewActionsProps = {
  applyDisabled?: boolean;
  draftFormId?: string;
};

export default function DraftReviewView({
  lowConfidenceCount = 0,
  notices = [],
  actionData,
  children,
  actions,
}: DraftReviewViewProps) {
  return (
    <div className="space-y-4 pb-12">
      {notices.map((notice) => (
        <DraftReviewNotice key={notice.id} tone={notice.tone}>
          {notice.content}
        </DraftReviewNotice>
      ))}

      {lowConfidenceCount > 0 ? (
        <DraftReviewNotice tone="warning">
          인식 신뢰도가 낮은 항목이 {lowConfidenceCount.toLocaleString()}개 있어요. 반영 전에 값을 확인해주세요.
        </DraftReviewNotice>
      ) : null}

      {actionData?.error ? (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.success ? (
        <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {actionData.success}
        </p>
      ) : null}

      <Callout
        tone="warning"
        Icon={ExclamationTriangleIcon}
        title="베타 기능 안내"
        description={
          <>
            가져온 데이터에 오류가 있을 수 있어요. 값이 잘못되었거나 반영 중 문제가 있다면{" "}
            <Link to="/contact" className="font-medium underline underline-offset-2">
              제안/문의
            </Link>
            로 알려주세요.
          </>
        }
      />

      {children}
      {actions}
    </div>
  );
}

export function DraftReviewActions({ applyDisabled = false, draftFormId }: DraftReviewActionsProps) {
  const navigation = useNavigation();
  const generatedApplyFormId = useId();
  const generatedDiscardFormId = useId();
  const submittingIntent = navigation.formData?.get("intent");
  const isApplying = navigation.state === "submitting" && submittingIntent === "apply";
  const isDiscarding = navigation.state === "submitting" && submittingIntent === "discard";
  const applyFormId = draftFormId ?? generatedApplyFormId;
  const discardFormId = generatedDiscardFormId;

  return (
    <>
      {draftFormId ? null : <Form method="post" id={applyFormId} className="hidden" />}
      <Form method="post" id={discardFormId} className="hidden" />

      <div className="flex flex-col gap-2 md:flex-row md:justify-start">
        <Button
          type="submit"
          name="intent"
          value="discard"
          form={discardFormId}
          size="sm"
          variant="danger"
          disabled={navigation.state === "submitting"}
        >
          {isDiscarding ? "삭제중..." : "삭제"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="apply"
          form={applyFormId}
          size="sm"
          variant="primary"
          disabled={navigation.state === "submitting" || applyDisabled}
        >
          {isApplying ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
          {isApplying ? "반영 중..." : "프로필에 반영"}
        </Button>
      </div>
    </>
  );
}

export function syncDraftTypeLabel(type: SyncDraftType): string {
  switch (type) {
    case "student_tier":
      return "학생 보유 등급";
    case "student_state":
      return "학생 현재 상태/육성 목표";
    default:
      return "아이템 보유 수량";
  }
}

export function draftStatusLabel(status: SyncDraftStatus): string {
  switch (status) {
    case "applied":
      return "반영됨";
    case "discarded":
      return "폐기됨";
    case "expired":
      return "만료됨";
    default:
      return "대기 중";
  }
}

export function parseConfidence(meta: string | null): number | null {
  if (!meta) {
    return null;
  }

  try {
    const parsed = JSON.parse(meta) as { confidence?: unknown };
    return typeof parsed.confidence === "number" ? parsed.confidence : null;
  } catch {
    return null;
  }
}

function DraftReviewNotice({ tone, children }: { tone: DraftReviewNotice["tone"]; children: ReactNode }) {
  const className =
    tone === "danger"
      ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
      : "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200";

  return (
    <div className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${className}`}>
      <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
