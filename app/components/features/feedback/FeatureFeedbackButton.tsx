import { Transition } from "@headlessui/react";
import { CheckCircleIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher, useLocation } from "react-router";
import { Button, Textarea } from "~/components/primitives";
import type { PathFeedbackAdditional } from "~/domain/feedback";
import { nowUtcIso } from "~/lib/date-time";

type FeatureFeedbackButtonProps = {
  featureName: string;
  feedbackType: PathFeedbackAdditional["type"];
};

export default function FeatureFeedbackButton({ featureName, feedbackType }: FeatureFeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const fetcher = useFetcher<{ success?: boolean; error?: { content?: string } }>();
  const location = useLocation();

  useEffect(() => {
    if (!open) setDescription("");
  }, [open]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const path = `${location.pathname}${location.search}`;
    const additional: PathFeedbackAdditional = {
      type: feedbackType,
      version: 1,
      payload: {
        timestamp: nowUtcIso(),
        path,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        userAgent: window.navigator.userAgent,
      },
    };
    const formData = new FormData();
    formData.append("title", `${featureName} 의견/오류 제보 (${path})`);
    formData.append("content", description.trim() || "추가 설명이 입력되지 않았습니다.");
    formData.append("additional", JSON.stringify(additional));
    fetcher.submit(formData, { method: "post", action: "/contact" });
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          의견/오류 제보
        </button>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <Transition
              show={open}
              as="div"
              enter="transition duration-200 ease-out"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition duration-100 ease-in"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
              className="fixed inset-0 z-layer-modal flex items-center justify-center p-4"
            >
              <button
                type="button"
                className="fixed inset-0 bg-black/50"
                onClick={() => setOpen(false)}
                aria-label="의견 및 오류 제보 모달 닫기"
              />
              <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg dark:bg-neutral-800">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">의견/오류 제보</h2>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {featureName}를 사용하면서 불편했던 점이나 발견한 오류를 알려주세요.
                      <br />
                      현재 페이지와 브라우저 정보가 진단 정보로 함께 전송됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    aria-label="닫기"
                  >
                    <XMarkIcon className="size-5 text-neutral-600 dark:text-neutral-400" />
                  </button>
                </div>

                {fetcher.data?.success ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <CheckCircleIcon className="mb-4 size-16 text-green-500" />
                    <p className="mb-2 text-lg font-semibold">제출 완료</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      소중한 의견을 남겨주셔서 감사합니다.
                    </p>
                  </div>
                ) : (
                  <fetcher.Form onSubmit={handleSubmit}>
                    <Textarea
                      label="의견 또는 문제 상황 (선택)"
                      name="description"
                      value={description}
                      onChange={setDescription}
                      placeholder="불편했던 점이나 문제가 발생한 상황을 알려주세요"
                      rows={4}
                      error={fetcher.data?.error?.content}
                    />
                    <div className="mt-6 flex justify-end gap-2">
                      <Button
                        type="button"
                        text="취소"
                        onClick={() => setOpen(false)}
                        disabled={fetcher.state === "submitting"}
                      />
                      <Button
                        type="submit"
                        text={fetcher.state === "submitting" ? "제출 중..." : "제출하기"}
                        variant="primary"
                        disabled={fetcher.state === "submitting"}
                      />
                    </div>
                  </fetcher.Form>
                )}
              </div>
            </Transition>,
            document.body,
          )
        : null}
    </>
  );
}
