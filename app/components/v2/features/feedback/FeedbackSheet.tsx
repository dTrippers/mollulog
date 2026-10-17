import { CheckCircleIcon } from "@heroicons/react/16/solid";
import { type FormEvent, useEffect, useState } from "react";
import { useFetcher, useLocation } from "react-router";
import type { PathFeedbackAdditional } from "~/domain/feedback";
import { nowUtcIso } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { Sheet } from "../../primitives/Sheet";

export type FeedbackSheetProps = {
  open: boolean;
  onClose: () => void;
  featureName: string;
  feedbackType: PathFeedbackAdditional["type"];
};

export const SCANNER_FEEDBACK_ACTION = "/contact";

export type FeedbackRequestInput = {
  featureName: string;
  feedbackType: PathFeedbackAdditional["type"];
  description: string;
  path: string;
  timestamp: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  userAgent: string;
};

// The same fields as the 1.x FeatureFeedbackButton: title, content, and the `additional` diagnostic payload with feedbackType.
export function buildFeedbackFormData(input: FeedbackRequestInput): FormData {
  const additional: PathFeedbackAdditional = {
    type: input.feedbackType,
    version: 1,
    payload: {
      timestamp: input.timestamp,
      path: input.path,
      viewport: input.viewport,
      userAgent: input.userAgent,
    },
  };
  const formData = new FormData();
  formData.append("title", `${input.featureName} 의견/오류 제보 (${input.path})`);
  formData.append("content", input.description.trim() || "추가 설명이 입력되지 않았습니다.");
  formData.append("additional", JSON.stringify(additional));
  return formData;
}

export function FeedbackSheet({ open, onClose, featureName, feedbackType }: FeedbackSheetProps) {
  const [description, setDescription] = useState("");
  const fetcher = useFetcher<{ success?: boolean; error?: { content?: string } }>();
  const location = useLocation();

  useEffect(() => {
    if (!open) setDescription("");
  }, [open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const path = `${location.pathname}${location.search}`;
    const formData = buildFeedbackFormData({
      featureName,
      feedbackType,
      description,
      path,
      timestamp: nowUtcIso(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      userAgent: window.navigator.userAgent,
    });
    fetcher.submit(formData, { method: "post", action: SCANNER_FEEDBACK_ACTION });
  };

  const submitted = fetcher.data?.success === true;
  const submitting = fetcher.state === "submitting";

  return (
    <Sheet
      open={open}
      title="의견/오류 제보"
      description={`${featureName}를 사용하면서 불편했던 점이나 발견한 오류를 알려주세요. 현재 페이지와 브라우저 정보가 진단 정보로 함께 전송됩니다.`}
      onClose={onClose}
    >
      {submitted ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircleIcon className="size-10 text-v2-success" aria-hidden="true" />
          <p className="text-base font-semibold text-v2-fg">제출 완료</p>
          <p className="text-sm text-v2-fg-secondary">소중한 의견을 남겨주셔서 감사합니다.</p>
        </div>
      ) : (
        <fetcher.Form onSubmit={handleSubmit} className="flex flex-col gap-v2-block-gap">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-v2-fg">
            의견 또는 문제 상황 (선택)
            <textarea
              name="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder="불편했던 점이나 문제가 발생한 상황을 알려주세요"
              aria-invalid={fetcher.data?.error?.content ? true : undefined}
              className={cn(
                "w-full min-w-0 resize-y rounded-md border border-v2-control-border bg-v2-surface px-3 py-2 text-sm font-normal text-v2-fg placeholder:text-v2-fg-tertiary",
                v2FocusRing,
              )}
            />
          </label>
          {fetcher.data?.error?.content ? (
            <p className="text-sm text-v2-danger" role="alert">
              {fetcher.data.error.content}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={onClose} disabled={submitting}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "제출 중..." : "제출하기"}
            </Button>
          </div>
        </fetcher.Form>
      )}
    </Sheet>
  );
}
