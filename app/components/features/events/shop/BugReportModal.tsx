import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useFetcher } from "react-router";
import { Transition } from "@headlessui/react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/16/solid";
import { Button, Textarea } from "~/components/primitives";
import { nowUtcIso } from "~/lib/date-time";
import type { Stage, ShopResource, CollectableResource } from "./types";
import type { ShopState } from "./hooks/useShopState";
import type { CalculationResult } from "./hooks/useShopCalculations";

type BugReportModalProps = {
  show: boolean;
  eventUid: string;
  stages: Stage[];
  shopResources: ShopResource[];
  collectableResources: CollectableResource[];
  stageCalculations: CalculationResult;
  shopState: ShopState;
  onClose: () => void;
};

export default function BugReportModal({
  show,
  eventUid,
  stages,
  shopResources,
  collectableResources,
  stageCalculations,
  shopState,
  onClose,
}: BugReportModalProps) {
  const [description, setDescription] = useState("");
  const fetcher = useFetcher<{ success?: boolean; error?: { content?: string } }>();

  // Reset form when modal closes
  useEffect(() => {
    if (!show) {
      setDescription("");
    }
  }, [show]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Create debug log at submission time
    const debugLog = {
      timestamp: nowUtcIso(),
      eventUid,
      stages,
      shopResources,
      collectableResources,
      stageCalculations,
      shopState,
    };

    const logContent = JSON.stringify(debugLog, null, 2);
    const fullContent = description.trim()
      ? `${description}\n\n--- 디버그 로그 ---\n\n${logContent}`
      : `--- 디버그 로그 ---\n\n${logContent}`;

    // Auto-generate title
    const title = `이벤트 상점 계산기 오류 제보 (${eventUid})`;

    const formData = new FormData();
    formData.append("title", title);
    formData.append("content", fullContent);

    fetcher.submit(formData, {
      method: "post",
      action: "/contact",
    });
  };

  const modal = (
    <Transition
      show={show}
      as="div"
      enter="transition duration-200 ease-out"
      enterFrom="opacity-0 scale-95"
      enterTo="opacity-100 scale-100"
      leave="transition duration-100 ease-in"
      leaveFrom="opacity-100 scale-100"
      leaveTo="opacity-0 scale-95"
      className="fixed inset-0 z-layer-modal flex items-center justify-center p-4"
    >
      <button type="button" className="fixed inset-0 bg-black/50" onClick={onClose} aria-label="오류 제보 모달 닫기" />
      <div className="relative w-full max-w-2xl bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">오류 제보</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              계산 결과에 오류가 있거나 사용 중 문제가 있는 경우 제보해주세요.<br />
              (로그 데이터가 서버로 전송됩니다.)
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="size-5 text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        {fetcher.data?.success ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircleIcon className="size-16 text-green-500 mb-4" />
            <p className="text-lg font-semibold mb-2">제출 완료</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              오류 제보가 성공적으로 제출되었습니다.
            </p>
          </div>
        ) : (
          <fetcher.Form onSubmit={handleSubmit}>
            <Textarea
              label="설명 (선택)"
              name="description"
              value={description}
              onChange={setDescription}
              placeholder="문제 상황을 설명해주시면 더 빠르게 원인을 파악할 수 있어요"
              rows={4}
              error={fetcher.data?.error?.content}
            />

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                text="취소"
                onClick={onClose}
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
    </Transition>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(modal, document.body);
}
