import { ArrowRightIcon, ArrowsPointingOutIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { ScannerCompletionSummary } from "~/components/v2/features/scanner/ScannerCompletionSummary";
import { ScannerEndBlock } from "~/components/v2/features/scanner/ScannerEndBlock";
import { ScannerFailureNotice } from "~/components/v2/features/scanner/ScannerFailureNotice";
import {
  type ScannerFileStatusItem,
  ScannerFileStatusList,
} from "~/components/v2/features/scanner/ScannerFileStatusList";
import { ScannerJobStatusNotice } from "~/components/v2/features/scanner/ScannerJobStatusNotice";
import { formatScannerQuotaAvailability } from "~/components/v2/features/scanner/ScannerQuota";
import {
  ScannerStepHeader,
  type ScannerStepStates,
  ScannerStepTitle,
} from "~/components/v2/features/scanner/ScannerStepHeader";
import { PageActionBar } from "~/components/v2/layout/PageActionBar";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { Popover } from "~/components/v2/primitives/Popover";
import { ProgressBar } from "~/components/v2/primitives/ProgressBar";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { OCR_ALLOWED_CONTENT_TYPES } from "~/domain/ocr";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { mapWithConcurrencyLimit } from "~/lib/concurrency";
import { cn } from "~/lib/utils";
import type { ScannerOutletContext } from "../scanner";
import ScannerFileList from "../scanner._components/ScannerFileList";
import ScannerImageDialog from "../scanner._components/ScannerImageDialog";
import ScannerJobSkeleton from "../scanner._components/ScannerJobSkeleton";
import { notifyScannerJobsChanged } from "../scanner._components/ScannerJobsPanel";
import ScannerUploadSection from "../scanner._components/ScannerUploadSection";
import ScannerUploadTargetGuide from "../scanner._components/ScannerUploadTargetGuide";
import {
  formatScannerBytes,
  requestScannerJson,
  ScannerApiRequestError,
  type ScannerPhase,
  toScannerErrorMessage,
  uploadScannerFile,
} from "../scanner._components/scanner-client";
import {
  formatScannerRelativeTime,
  getScannerCompletionState,
  getScannerJobStatusView,
  getScannerTerminalJobDescription,
  getScannerTerminalJobTitle,
  getScannerUnavailableResultMessage,
  scannerMessages,
} from "../scanner._components/scanner-messages";
import { getScannerStepBody } from "../scanner._components/scanner-step-body";
import {
  getScannerImageContentType,
  ITEM_SCANNER_ACCEPT_SPEC,
  mergeScannerFiles,
  scannerFileKey,
  validateScannerFiles,
} from "../scanner._components/scanner-upload";
import { sha256FileInWorker } from "../scanner._components/sha256-client";
import type { ScannerUploadQuota } from "../scanner._components/UploadQuotaMeter";
import { useScannerJob } from "../scanner._components/useScannerJob";
import {
  buildCellApplyPayload,
  buildCellReviewAttentionCounts,
  buildCellReviewPreviewSummary,
  type CandidateDetails,
  type CellEdit,
  CellReviewPanel,
  cellAddressKey,
  mergeCellCandidateQuantities,
  type ReviewCell,
} from "./resource-cell-review";

type ScannerImageStatus = {
  uid: string;
  filename: string;
  status: string;
};

type ScannerImageRecognitionReviewCell = Pick<ReviewCell, "imageUid" | "status">;

type ScannerImageRecognitionReviewInput = {
  images: ScannerImageStatus[];
  cells?: ScannerImageRecognitionReviewCell[];
};

type JobStatus = {
  uid: string;
  generation: number;
  status: string;
  progress: { completed: number; failed: number; total: number };
  images: ScannerImageStatus[];
  reviewMode?: "cells";
  reviewError?: boolean;
  cells?: ReviewCell[];
  currentQuantities: Record<string, number>;
  application: JobApplication;
  completionSummary?: ItemCompletionSummary | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type JobApplication = { status: "pending" | "applied" | "discarded" | "expired"; appliedAt: string | null } | null;

function completionCountLabel(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  if (count >= 10_000) return `${(count / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
  return count.toLocaleString();
}

// The saved apply record, read from the job detail, so the completion view matches before and after a reload.
export type ItemCompletionSummary = {
  appliedCount: number;
  unappliedCellCount: number;
  // assetUid and resourceType are the catalog's image key and type, null when the catalog no longer has the resource.
  items: Array<{
    uid: string;
    assetUid: string | null;
    resourceType: ResourceTypeEnum | null;
    name: string | null;
    quantity: number;
  }>;
};

function CompletionResourceCard({ item }: { item: ItemCompletionSummary["items"][number] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = item.name ?? "아이템 정보 없음";
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${name}, 반영 후 수량 ${item.quantity.toLocaleString()}`}
        onClick={() => setOpen((current) => !current)}
        className="relative block size-10 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      >
        {item.assetUid && item.resourceType ? (
          <ResourceThumb itemUid={item.assetUid} resourceType={item.resourceType} name={name} size="md" />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-md bg-v2-inset px-1 text-center text-[8px] text-v2-fg-tertiary">
            이미지 없음
          </span>
        )}
        <span className="absolute -right-1 -bottom-1 rounded border-2 border-v2-surface bg-v2-fg px-1 text-xs font-medium text-v2-canvas tabular-nums">
          {completionCountLabel(item.quantity)}
        </span>
      </button>
      <Popover
        open={open}
        label={`${name} 반영 결과`}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        className="w-max max-w-72 p-3"
      >
        <p className="text-sm font-medium break-words text-v2-fg">{name}</p>
        <p className="mt-1 text-xs text-v2-fg-secondary tabular-nums">
          반영 후 수량 {item.quantity.toLocaleString()}
        </p>
      </Popover>
    </>
  );
}

type OcrUploadQuota = ScannerUploadQuota;

type ImageBoundingBox = { x: number; y: number; width: number; height: number };

const REVIEW_IMAGE_BUFFER_RATIO = 0.06;
const REVIEW_IMAGE_MIN_BUFFER_RATIO = 0.02;
const REVIEW_IMAGE_HOVER_CONTEXT_RATIO = 2.25;
const REVIEW_IMAGE_HOVER_MAX_SCALE = 3;
const REVIEW_IMAGE_HOVER_MAX_ITEM_SIZE = 176;
// A shared empty list. A new default array per render would re-run the review image effect on every render.
const NO_CONTENT_BOXES: ImageBoundingBox[] = [];

const TERMINAL_JOB_STATUSES = new Set(["failed", "cancelled", "expired"]);
export const RESOURCE_FILE_CONCURRENCY = 4;

export function groupScannerImagesByStatus<T extends { uid: string; status: string }>(
  images: T[],
  partialRecognitionReviewImageUids: ReadonlySet<string> = new Set(),
) {
  const needsReview = (image: T) => image.status !== "succeeded" || partialRecognitionReviewImageUids.has(image.uid);
  return {
    succeeded: images.filter((image) => !needsReview(image)),
    reviewRequired: images.filter(needsReview),
  };
}

export function getPartialRecognitionReviewImageUids(job: ScannerImageRecognitionReviewInput): Set<string> {
  const reviewRequiredImageUids = new Set<string>();
  const succeededImages = job.images.filter((image) => image.status === "succeeded");
  const cellsByImageUid = new Map<string, ScannerImageRecognitionReviewCell[]>();
  for (const cell of job.cells ?? []) {
    const imageCells = cellsByImageUid.get(cell.imageUid);
    if (imageCells) {
      imageCells.push(cell);
    } else {
      cellsByImageUid.set(cell.imageUid, [cell]);
    }
  }
  for (const image of succeededImages) {
    const imageCells = cellsByImageUid.get(image.uid) ?? [];
    if (imageCells.length === 0 || imageCells.some((cell) => cell.status !== "recognized")) {
      reviewRequiredImageUids.add(image.uid);
    }
  }
  return reviewRequiredImageUids;
}

export function shouldShowScannerResultActions(
  jobStatus: string | undefined,
  reviewMode: JobStatus["reviewMode"] | undefined,
  reviewError = false,
): boolean {
  return jobStatus === "review_ready" && reviewMode === "cells" && !reviewError;
}

export function shouldShowScannerCancelAction(jobStatus: string | undefined): boolean {
  return jobStatus === "review_ready";
}

export function getResourceJobTransition(job: JobStatus): { phase: ScannerPhase; error?: string | null } {
  if (job.reviewError) return { phase: "review" };
  if (job.status === "review_ready") {
    return { phase: job.application?.status === "applied" ? "applied" : "review" };
  }
  if (["queued", "processing", "finalizing"].includes(job.status)) return { phase: "waiting" };
  if (job.status === "failed" && job.images.some((image) => image.status === "failed")) return { phase: "review" };
  if (TERMINAL_JOB_STATUSES.has(job.status)) return { phase: "idle" };
  return { phase: "idle", error: getScannerUnavailableResultMessage() };
}

export function getResourceStepStates(phase: ScannerPhase, job: JobStatus | null): ScannerStepStates {
  if (!job) return ["active", "pending", "pending", "pending"];
  if (job.status === "expired") return ["failed", "pending", "pending", "pending"];
  if (job.status === "cancelled") return ["pending", "pending", "pending", "pending"];
  if (job.status === "failed") return ["done", "failed", "pending", "pending"];
  if (["queued", "processing", "finalizing"].includes(job.status)) return ["done", "active", "pending", "pending"];
  if (job.reviewError) return ["done", "done", "failed", "pending"];
  if (job.application?.status === "applied") return ["done", "done", "done", "done"];
  if (phase === "applying") return ["done", "done", "done", "active"];
  return ["done", "done", "active", "pending"];
}

export default function ResourceScanner() {
  const {
    imageUploadQuota: uploadQuota,
    setImageUploadQuota: setUploadQuota,
    openJobsPanel,
    setMobileActionBarHidden,
    stacked,
  } = useOutletContext<ScannerOutletContext>();
  const [files, setFiles] = useState<File[]>([]);
  const [hashProgress, setHashProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [allowsTrainingDataUse, setAllowsTrainingDataUse] = useState(false);
  const [selectedImageUid, setSelectedImageUid] = useState<string | null>(null);
  const [highlightedSources, setHighlightedSources] = useState<string[]>([]);
  const [highlightedReviewPosition, setHighlightedReviewPosition] = useState<number | null>(null);
  const [cellEdits, setCellEdits] = useState<Record<string, CellEdit>>({});
  const [cellCandidateDetails, setCellCandidateDetails] = useState<Record<string, CandidateDetails>>({});
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  const handleJob = useCallback((next: JobStatus) => {
    const partialRecognitionReviewImageUids = getPartialRecognitionReviewImageUids(next);
    const firstReviewImage =
      next.images.find((image) => image.status === "succeeded" && !partialRecognitionReviewImageUids.has(image.uid)) ??
      next.images.find((image) => image.status === "succeeded") ??
      next.images[0];
    setSelectedImageUid(firstReviewImage?.uid ?? null);
    setHighlightedSources([]);
    setHighlightedReviewPosition(null);
    setIsImageExpanded(false);
    setCellEdits({});
    setCellCandidateDetails({});
  }, []);

  const handleReset = useCallback(() => {
    setFiles([]);
    setSelectedImageUid(null);
    setHighlightedSources([]);
    setHighlightedReviewPosition(null);
    setCellEdits({});
    setCellCandidateDetails({});
    setIsImageExpanded(false);
    setAllowsTrainingDataUse(false);
  }, []);

  const lifecycle = useScannerJob<JobStatus>({
    getTransition: getResourceJobTransition,
    onJob: handleJob,
    onReset: handleReset,
  });
  const {
    job,
    phase,
    setPhase,
    error,
    setError,
    isCancelling,
    selectedJobUid,
    setSearchParams,
    acceptJob,
    updateJob,
    resetForNewUpload,
    refreshJob,
    beginNewUpload,
    statusError,
    cancelResult,
  } = lifecycle;

  const unknownCount = useMemo(() => (job?.cells ?? []).filter((cell) => cell.status !== "recognized").length, [job]);

  const selectedImage = useMemo(
    () => job?.images.find((image) => image.uid === selectedImageUid) ?? job?.images[0] ?? null,
    [job, selectedImageUid],
  );

  const selectedImageHasNoResult = selectedImage !== null && selectedImage.status !== "succeeded";

  const partialRecognitionReviewImageUids = useMemo(
    () => (job ? getPartialRecognitionReviewImageUids(job) : new Set<string>()),
    [job],
  );
  const imageGroups = useMemo(
    () => groupScannerImagesByStatus(job?.images ?? [], partialRecognitionReviewImageUids),
    [job?.images, partialRecognitionReviewImageUids],
  );

  const selectedResultImage = useMemo(() => getSelectedResultImage(job, selectedImageUid), [job, selectedImageUid]);

  const highlightedObservation =
    highlightedReviewPosition === null
      ? null
      : (job?.cells?.find(
          (cell) => cell.imageUid === selectedImageUid && cell.position === highlightedReviewPosition,
        ) ?? null);

  const selectionRequiredCountByImageUid = useMemo(
    () => buildCellReviewAttentionCounts(job?.cells, cellEdits),
    [cellEdits, job],
  );

  const cellReviewPreview = useMemo(
    () => (job ? buildCellReviewPreviewSummary(job.cells ?? [], cellEdits, job.currentQuantities) : null),
    [cellEdits, job],
  );

  const hasChanges = (cellReviewPreview?.applicableChanged ?? 0) > 0;

  const isUploadLocked = phase === "uploading" || phase === "applying";
  const isFileSelectionDisabled = isUploadLocked || uploadQuota?.remaining === 0;

  function setReviewPositionHighlight(position: number, highlighted: boolean) {
    setHighlightedReviewPosition((current) => (highlighted ? position : current === position ? null : current));
  }

  function addFiles(candidates: File[]) {
    if (isFileSelectionDisabled || candidates.length === 0) return;
    const nextFiles = mergeScannerFiles(files, candidates);
    const validation = validateScannerFiles(nextFiles, ITEM_SCANNER_ACCEPT_SPEC);
    if (validation.error) {
      setError(validation.error);
      return;
    }
    if (uploadQuota && nextFiles.length > uploadQuota.remaining) {
      setError(`현재 업로드할 수 있는 스크린샷은 ${uploadQuota.remaining}장이에요.`);
      return;
    }
    setFiles(nextFiles);
    setError(null);
  }

  async function startRecognition() {
    if (files.length === 0) return;
    beginNewUpload();
    setError(null);
    setPhase("uploading");
    setHashProgress(0);
    setUploadProgress(0);
    try {
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      const hashedBytesByFile = new Map<string, number>();
      const descriptors = await mapWithConcurrencyLimit(files, RESOURCE_FILE_CONCURRENCY, async (file) => {
        const contentType = getScannerImageContentType(file);
        if (!contentType) throw new Error("PNG, JPEG, WebP 이미지만 첨부할 수 있어요.");
        const key = scannerFileKey(file);
        const sha256 = await sha256FileInWorker(file, (processedBytes) => {
          const previous = hashedBytesByFile.get(key) ?? 0;
          hashedBytesByFile.set(key, Math.min(file.size, Math.max(previous, processedBytes)));
          const hashedBytes = Array.from(hashedBytesByFile.values()).reduce((sum, value) => sum + value, 0);
          setHashProgress(totalBytes === 0 ? 1 : Math.min(1, hashedBytes / totalBytes));
        });
        hashedBytesByFile.set(key, file.size);
        const hashedBytes = Array.from(hashedBytesByFile.values()).reduce((sum, value) => sum + value, 0);
        setHashProgress(totalBytes === 0 ? 1 : Math.min(1, hashedBytes / totalBytes));
        return { filename: file.name, contentType, byteSize: file.size, sha256 };
      });
      const created = await requestScannerJson<{
        jobUid: string;
        quota: OcrUploadQuota;
        images: Array<{ imageUid: string; filename: string; uploadUrl: string }>;
      }>("/api/ocr/jobs", {
        method: "POST",
        body: JSON.stringify({ images: descriptors, trainingConsent: allowsTrainingDataUse }),
      });
      setUploadQuota(created.quota);
      let uploadedBytes = 0;
      await mapWithConcurrencyLimit(created.images, RESOURCE_FILE_CONCURRENCY, async (upload, index) => {
        let previousUploadedBytes = 0;
        await uploadScannerFile({
          url: upload.uploadUrl,
          file: files[index],
          contentType: descriptors[index].contentType,
          onProgress: (uploaded) => {
            const delta = Math.max(0, uploaded - previousUploadedBytes);
            previousUploadedBytes = Math.max(previousUploadedBytes, uploaded);
            uploadedBytes += delta;
            setUploadProgress(totalBytes === 0 ? 1 : Math.min(1, uploadedBytes / totalBytes));
          },
        });
      });
      const submitted = await requestScannerJson<JobStatus & { quota: OcrUploadQuota }>(
        `/api/ocr/jobs/${created.jobUid}/submit`,
        { method: "POST" },
      );
      setUploadQuota(submitted.quota);
      setSearchParams({ job: created.jobUid }, { replace: true });
      acceptJob({
        ...submitted,
        currentQuantities: {},
        application: null,
      });
      setFiles([]);
      setAllowsTrainingDataUse(false);
      notifyScannerJobsChanged();
    } catch (startError) {
      if (startError instanceof ScannerApiRequestError && startError.quota) setUploadQuota(startError.quota);
      setError(toScannerErrorMessage(startError));
      setPhase("idle");
    }
  }

  async function applyResult() {
    if (!job) return;
    if (job.reviewError || job.reviewMode !== "cells") {
      setError(getScannerUnavailableResultMessage());
      setPhase("review");
      return;
    }
    setError(null);
    setPhase("applying");
    try {
      const cells = buildCellApplyPayload(job.cells ?? [], cellEdits);
      const response = await requestScannerJson<{
        application: NonNullable<JobApplication>;
      }>(`/api/ocr/jobs/${job.uid}/apply`, {
        method: "POST",
        body: JSON.stringify({ resultGeneration: job.generation, cells }),
      });
      // The summary is read again with the job detail below; until then the completion view shows it is loading.
      updateJob((currentJob) =>
        currentJob ? { ...currentJob, application: response.application, completionSummary: undefined } : null,
      );
      setCellEdits({});
      setCellCandidateDetails({});
      setSelectedImageUid(null);
      setHighlightedSources([]);
      setHighlightedReviewPosition(null);
      setIsImageExpanded(false);
      setPhase("applied");
      notifyScannerJobsChanged();
      // A failed re-read leaves no summary to wait for: the completion view then shows its error with a new upload.
      if ((await refreshJob()) === "failed") {
        updateJob((currentJob) => (currentJob ? { ...currentJob, completionSummary: null } : null));
      }
    } catch (applyError) {
      setError(toScannerErrorMessage(applyError));
      setPhase("review");
    }
  }

  function selectFirstFailedImage(current: JobStatus) {
    const failedImage = current.images.find((image) => image.status !== "succeeded");
    if (failedImage) setSelectedImageUid(failedImage.uid);
  }

  const hidesMobileActionBar = (!job && files.length > 0) || phase === "review" || phase === "applying";
  useEffect(() => {
    setMobileActionBarHidden(hidesMobileActionBar);
    return () => setMobileActionBarHidden(false);
  }, [hidesMobileActionBar, setMobileActionBarHidden]);

  const stepStates = getResourceStepStates(phase, job);
  const failedImageCount = job?.images.filter((image) => image.status !== "succeeded").length ?? 0;
  const isTerminal = job ? TERMINAL_JOB_STATUSES.has(job.status) : false;
  const isApplied = job?.application?.status === "applied";
  const uploadPercent = Math.round((hashProgress < 1 ? hashProgress : uploadProgress) * 100);
  const selectedBytes = formatScannerBytes(files.reduce((sum, file) => sum + file.size, 0));
  const isUploadQuotaExhausted = uploadQuota?.remaining === 0;
  const uploadActionDisabled =
    files.length === 0 || isUploadLocked || !uploadQuota || files.length > uploadQuota.remaining;
  const isReviewActionVisible =
    job !== null && (phase === "review" || phase === "applying") && shouldShowScannerCancelAction(job.status);
  // Only the upload bar is fixed on stacked layouts; review actions stay sticky at the end of the step.
  const hasFixedBar = stacked && !job && files.length > 0;

  // The stacked "최근 작업" button shows only while the mobile action bar is hidden (files selected, review, applying).
  const recentJobsButton =
    stacked && hidesMobileActionBar ? (
      <Button variant="secondary" onClick={openJobsPanel}>
        최근 작업
      </Button>
    ) : null;
  const headerAction =
    job && !isTerminal && !isApplied && phase !== "applying" ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => resetForNewUpload()}>
          <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
          {scannerMessages.item.uploadAction}
        </Button>
        {recentJobsButton}
      </div>
    ) : (
      recentJobsButton
    );

  const reviewBody =
    job && !job.reviewError ? (
      <div className="flex flex-col gap-v2-block-gap lg:grid lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-start">
        {selectedImage ? (
          <section className="flex min-w-0 flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p lg:sticky lg:top-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-v2-fg">
                {job.images.findIndex((image) => image.uid === selectedImage.uid) + 1} / {job.images.length} ·{" "}
                {selectedImage.filename}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {selectionRequiredCountByImageUid[selectedImage.uid] ? (
                  <p className="text-xs text-v2-warning tabular-nums">
                    확인 필요 {selectionRequiredCountByImageUid[selectedImage.uid]}칸
                  </p>
                ) : null}
                <IconButton
                  icon={ArrowsPointingOutIcon}
                  label={`${selectedImage.filename} 크게 보기`}
                  onClick={() => setIsImageExpanded(true)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsImageExpanded(true)}
              aria-label={`${selectedImage.filename} 크게 보기`}
              className={cn("relative block w-full cursor-pointer overflow-hidden rounded-md bg-v2-inset", v2FocusRing)}
            >
              <ReviewSourceImage
                key={selectedImage.uid}
                src={`/api/ocr/jobs/${encodeURIComponent(job.uid)}/images/${encodeURIComponent(selectedImage.uid)}`}
                alt={`${selectedImage.filename} 원본`}
                imageWidth={selectedResultImage?.width}
                imageHeight={selectedResultImage?.height}
                contentBoxes={selectedResultImage?.boxes}
                highlightedBox={highlightedObservation?.bbox ?? undefined}
              />
            </button>
            <div className="flex flex-col gap-v2-block-gap">
              {imageGroups.reviewRequired.length > 0 ? (
                <ScannerImageGroup
                  jobUid={job.uid}
                  images={imageGroups.reviewRequired}
                  label={`검토 필요 ${imageGroups.reviewRequired.length}장`}
                  selectedImageUid={selectedImage.uid}
                  highlightedSources={highlightedSources}
                  selectionRequiredCountByImageUid={selectionRequiredCountByImageUid}
                  allImages={job.images}
                  onSelect={(image) => {
                    setHighlightedSources([]);
                    setHighlightedReviewPosition(null);
                    setSelectedImageUid(image.uid);
                  }}
                />
              ) : null}
              {imageGroups.succeeded.length > 0 ? (
                <ScannerImageGroup
                  jobUid={job.uid}
                  images={imageGroups.succeeded}
                  label={`인식 성공 ${imageGroups.succeeded.length}장`}
                  selectedImageUid={selectedImage.uid}
                  highlightedSources={highlightedSources}
                  selectionRequiredCountByImageUid={selectionRequiredCountByImageUid}
                  allImages={job.images}
                  onSelect={(image) => {
                    setHighlightedSources([]);
                    setHighlightedReviewPosition(null);
                    setSelectedImageUid(image.uid);
                  }}
                />
              ) : null}
            </div>
          </section>
        ) : null}
        {/* A screenshot that was not recognized keeps the source and the screenshot strip, so another one can be chosen;
            only the cell area says that it has no result. */}
        {selectedImageHasNoResult ? (
          <section className="flex min-w-0 flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
            <StatusNotice tone="danger">
              이 스크린샷은 인식하지 못했어요. 이 스크린샷의 아이템은 반영되지 않아요.
            </StatusNotice>
          </section>
        ) : (
          <section className="flex min-w-0 flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
            <CellReviewPanel
              jobUid={job.uid}
              stacked={stacked}
              selectedImageUid={selectedImage?.uid ?? null}
              cells={job.cells ?? []}
              edits={cellEdits}
              candidateDetails={cellCandidateDetails}
              disabled={phase === "applying"}
              onHighlightChange={setReviewPositionHighlight}
              onLoadCandidates={(cell, details) => {
                setCellCandidateDetails((current) => ({ ...current, [cellAddressKey(cell)]: details }));
                updateJob((currentJob) =>
                  currentJob
                    ? {
                        ...currentJob,
                        currentQuantities: mergeCellCandidateQuantities(currentJob.currentQuantities, details),
                      }
                    : null,
                );
              }}
              onEdit={(cell, edit) =>
                setCellEdits((current) => ({
                  ...current,
                  [cellAddressKey(cell)]: { ...current[cellAddressKey(cell)], ...edit },
                }))
              }
            />
          </section>
        )}
      </div>
    ) : null;

  const reviewStep = job ? (
    <>
      <ScannerStepHeader states={stepStates} action={headerAction}>
        <ScannerStepTitle title="인식 결과" />
        {error ? (
          <StatusNotice tone="danger">{error}</StatusNotice>
        ) : job.reviewError ? (
          <StatusNotice tone="danger">{getScannerUnavailableResultMessage()}</StatusNotice>
        ) : failedImageCount > 0 ? (
          <StatusNotice
            tone="danger"
            action={
              <Button variant="text" onClick={() => selectFirstFailedImage(job)}>
                보기
              </Button>
            }
          >
            스크린샷 {failedImageCount}장 인식 실패
          </StatusNotice>
        ) : unknownCount > 0 ? (
          <StatusNotice tone="warning">확인이 필요한 칸을 선택해 주세요.</StatusNotice>
        ) : null}
      </ScannerStepHeader>
      {reviewBody}
    </>
  ) : null;

  const reviewActionBar =
    isReviewActionVisible && job ? (
      <PageActionBar
        placement="sticky"
        expandActions
        className="bottom-0 rounded-none bg-v2-canvas px-0 py-v2-block-gap shadow-none"
        summary={phase === "applying" ? "반영 중이에요" : isCancelling ? "삭제 중이에요" : null}
      >
        <Button variant="danger" disabled={phase === "applying" || isCancelling} onClick={cancelResult}>
          결과 삭제
        </Button>
        {shouldShowScannerResultActions(job.status, job.reviewMode, job.reviewError) ? (
          <Button
            variant="primary"
            aria-label={`${cellReviewPreview?.applicableChanged ?? 0}개 반영`}
            disabled={phase === "applying" || isCancelling || !hasChanges}
            onClick={applyResult}
          >
            반영
          </Button>
        ) : null}
      </PageActionBar>
    ) : null;

  const completionState = getScannerCompletionState(job?.completionSummary);
  const completionStep =
    job && isApplied ? (
      <>
        <ScannerStepHeader states={stepStates} action={headerAction}>
          <ScannerStepTitle title="반영했어요" meta={formatScannerQuotaAvailability(job.updatedAt)} />
        </ScannerStepHeader>
        {completionState.kind === "summary" ? (
          <ScannerCompletionSummary
            title="반영 결과"
            meta=""
            summary={`반영 ${completionState.summary.appliedCount}개${completionState.summary.unappliedCellCount > 0 ? ` · 반영하지 않은 칸 ${completionState.summary.unappliedCellCount}개` : ""}`}
            actions={
              <>
                <Button variant="primary" className="w-full sm:w-auto" onClick={() => resetForNewUpload()}>
                  <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
                  {scannerMessages.item.uploadAction}
                </Button>
                <Link
                  to="/utils/resources/inventory"
                  className={v2ButtonClassName({ variant: "secondary", className: "w-full sm:w-auto" })}
                >
                  보유 아이템 보기
                  <ArrowRightIcon className="size-4" aria-hidden="true" />
                </Link>
              </>
            }
          >
            <div className="flex flex-col gap-v2-group-gap">
              <p className="text-sm font-semibold text-v2-fg">반영한 아이템</p>
              <ul className="flex flex-wrap gap-2">
                {completionState.summary.items.map((item) => (
                  <li key={item.uid} className="w-12 shrink-0">
                    <CompletionResourceCard item={item} />
                  </li>
                ))}
              </ul>
            </div>
          </ScannerCompletionSummary>
        ) : completionState.kind === "loading" ? (
          <ScannerEndBlock
            action={
              <Button variant="primary" onClick={() => resetForNewUpload()}>
                <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
                {scannerMessages.item.uploadAction}
              </Button>
            }
          >
            <p role="status" className="text-sm text-v2-fg-tertiary">
              반영 기록을 불러오고 있어요
            </p>
          </ScannerEndBlock>
        ) : (
          // Without a summary there are no counts to show, but a new upload stays one step away.
          <ScannerEndBlock
            action={
              <Button variant="primary" onClick={() => resetForNewUpload()}>
                <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
                {scannerMessages.item.uploadAction}
              </Button>
            }
          >
            <StatusNotice tone="danger">{completionState.message}</StatusNotice>
          </ScannerEndBlock>
        )}
      </>
    ) : null;

  const endStep =
    job && isTerminal ? (
      <>
        <ScannerStepHeader states={stepStates}>
          <ScannerStepTitle
            title={getScannerTerminalJobTitle(job.status, "item_inventory_images_v1")}
            meta={`스크린샷 ${job.images.length}장 · ${formatScannerRelativeTime(job.createdAt)}`}
          />
        </ScannerStepHeader>
        {job.images.length > 0 && job.status === "failed" ? (
          <ScannerFileStatusList items={toFileStatusItems(job)} />
        ) : null}
        <ScannerEndBlock
          action={
            <Button variant="primary" onClick={() => resetForNewUpload()}>
              <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
              {scannerMessages.item.uploadAction}
            </Button>
          }
        >
          {getScannerTerminalJobDescription(job.status, "item_inventory_images_v1")}
        </ScannerEndBlock>
      </>
    ) : null;

  const waitingStep =
    job && phase === "waiting" ? (
      <>
        <ScannerStepHeader states={stepStates} action={headerAction}>
          {job.status === "queued" ? (
            <ScannerStepTitle
              title="인식 대기 중"
              meta={`스크린샷 ${job.images.length}장`}
            />
          ) : (
            <>
              <ScannerStepTitle
                title="아이템 인식 중"
                meta={`처리 ${processedCountOf(job)}/${job.progress.total}${job.progress.failed > 0 ? ` · 실패 ${job.progress.failed}` : ""}`}
              />
              <ProgressBar value={processedCountOf(job)} max={job.progress.total} label="인식 진행률" />
            </>
          )}
          <p className="text-sm text-v2-fg-secondary">
            {job.status === "queued"
              ? "페이지를 닫아도 차례가 오면 인식을 시작해요."
              : "페이지를 닫아도 인식은 계속돼요."}
          </p>
          {job.progress.failed > 0 ? (
            <ScannerFailureNotice>
              스크린샷 {job.progress.failed}장을 인식하지 못했어요. 나머지 스크린샷은 계속 인식해요.
            </ScannerFailureNotice>
          ) : null}
        </ScannerStepHeader>
        <ScannerFileStatusList items={toFileStatusItems(job)} />
      </>
    ) : null;

  const uploadBody = (
    <ScannerUploadSection
      inputId="resource-scanner-files"
      inputLabel="스크린샷 파일 선택"
      accept={OCR_ALLOWED_CONTENT_TYPES.join(",")}
      multiple
      selectionDisabled={isFileSelectionDisabled}
      onFiles={addFiles}
      targetGuide={<ScannerUploadTargetGuide target="item" />}
      targetPath="[메뉴] > [아이템]"
      helpText="파일을 끌어다 놓거나 붙여넣기(Ctrl+V), 또는 클릭해서 선택"
      descriptionLines={["1회 최대 이미지 30장 · PNG, JPG, WEBP"]}
      consentChecked={allowsTrainingDataUse}
      consentDisabled={isUploadLocked}
      onConsentChange={setAllowsTrainingDataUse}
      actionDisabled={uploadActionDisabled}
      actionLabel="인식 시작"
      onAction={startRecognition}
      stacked={stacked}
      hasFiles={files.length > 0}
    >
      <ScannerFileList
        files={files}
        disabled={isUploadLocked}
        onRemove={(index) => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
        onClear={() => setFiles([])}
      />
    </ScannerUploadSection>
  );

  // One body per job state. Each step below renders only when it is the body.
  const stepBody = getScannerStepBody({
    hasSelectedJob: selectedJobUid !== null,
    hasJob: job !== null,
    phase,
    isApplied,
    isTerminal,
    reviewBody: job ? "review" : null,
  });
  const showsUploadBar = stacked && !job && files.length > 0 && !selectedJobUid;
  const uploadStep = !selectedJobUid ? (
    <>
      <ScannerStepHeader states={stepStates} action={headerAction}>
        {phase === "uploading" ? (
          <>
            <ScannerStepTitle title="파일 업로드 중" />
            <ProgressBar
              value={hashProgress < 1 ? hashProgress : uploadProgress}
              max={1}
              label={hashProgress < 1 ? "파일 확인 진행률" : "업로드 진행률"}
            />
            <p className="text-sm text-v2-fg-secondary tabular-nums">
              {hashProgress < 1 ? `파일 확인 ${uploadPercent}%` : `업로드 ${uploadPercent}%`}
            </p>
          </>
        ) : isUploadQuotaExhausted && uploadQuota ? (
          <>
            <ScannerStepTitle
              title="이미지 업로드 가능 횟수를 모두 사용했어요"
              meta={
                uploadQuota.nextAvailableAt
                  ? `${formatScannerQuotaAvailability(uploadQuota.nextAvailableAt)}부터 다시 올릴 수 있어요`
                  : undefined
              }
            />
            <StatusNotice tone="neutral">
              최근 7일 동안 이미지 {uploadQuota.limit}장을 올렸어요. 가장 오래된 업로드가 7일을 넘기면 다시 올릴 수
              있어요.
            </StatusNotice>
          </>
        ) : (
          <ScannerStepTitle title="스크린샷을 선택해 주세요" />
        )}
      </ScannerStepHeader>
      {uploadBody}
      {showsUploadBar ? (
        <PageActionBar placement="fixed" summary={`스크린샷 ${files.length}장 · ${selectedBytes}`}>
          <Button variant="primary" disabled={uploadActionDisabled} onClick={startRecognition}>
            인식 시작
          </Button>
        </PageActionBar>
      ) : null}
    </>
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-v2-block-gap",
        hasFixedBar ? "pb-[calc(var(--mobile-nav-height)+5.5rem)]" : "pb-v2-block-p",
      )}
    >
      {error && phase !== "review" && phase !== "applying" ? <StatusNotice tone="danger">{error}</StatusNotice> : null}
      {statusError ? (
        <ScannerJobStatusNotice
          title={getScannerJobStatusView(statusError.kind).title}
          action={getScannerJobStatusView(statusError.kind).action}
          onRetry={() => void refreshJob()}
          onStartNew={() => resetForNewUpload(false)}
          startNewLabel={scannerMessages.item.uploadAction}
        />
      ) : null}
      {selectedJobUid && !job && !statusError ? <ScannerJobSkeleton /> : null}
      {stepBody === "upload" ? uploadStep : null}
      {stepBody === "waiting" ? waitingStep : null}
      {stepBody === "review" ? reviewStep : null}
      {stepBody === "completion" ? completionStep : null}
      {stepBody === "terminal" ? endStep : null}
      {stepBody === "review" ? reviewActionBar : null}
      {job && selectedImage ? (
        <ScannerImageDialog
          open={isImageExpanded}
          src={`/api/ocr/jobs/${encodeURIComponent(job.uid)}/images/${encodeURIComponent(selectedImage.uid)}`}
          title={selectedImage.filename}
          alt={`${selectedImage.filename} 원본`}
          onClose={() => setIsImageExpanded(false)}
        />
      ) : null}
    </div>
  );
}

function processedCountOf(job: JobStatus): number {
  return job.progress.completed + job.progress.failed;
}

function toFileStatusItems(job: JobStatus): ScannerFileStatusItem[] {
  return job.images.map((image) => ({
    key: image.uid,
    name: image.filename,
    status:
      image.status === "succeeded"
        ? "done"
        : image.status === "failed"
          ? "failed"
          : image.status === "queued"
            ? "queued"
            : "processing",
  }));
}

function getSelectedResultImage(
  job: JobStatus | null,
  selectedImageUid: string | null,
): { width?: number; height?: number; boxes: ImageBoundingBox[] } | null {
  const selectedCells = (job?.cells ?? []).filter((cell) => !selectedImageUid || cell.imageUid === selectedImageUid);
  const firstCell = selectedCells[0];
  return firstCell
    ? {
        width: firstCell.width ?? undefined,
        height: firstCell.height ?? undefined,
        boxes: selectedCells.flatMap((cell) =>
          cell.bbox && cell.bbox.width > 0 && cell.bbox.height > 0 ? [cell.bbox] : [],
        ),
      }
    : null;
}

function ReviewSourceImage({
  src,
  alt,
  imageWidth,
  imageHeight,
  contentBoxes = NO_CONTENT_BOXES,
  highlightedBox,
}: {
  src: string;
  alt: string;
  imageWidth?: number;
  imageHeight?: number;
  contentBoxes?: ImageBoundingBox[];
  highlightedBox?: ImageBoundingBox;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [imageError, setImageError] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [renderedImage, setRenderedImage] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const sourceWidth = imageWidth ?? naturalSize?.width;
  const sourceHeight = imageHeight ?? naturalSize?.height;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sourceWidth || !sourceHeight) {
      setRenderedImage(null);
      return;
    }

    const updateRenderedImage = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const contentBounds = getReviewImageContentBounds(contentBoxes, sourceWidth, sourceHeight);
      const baseScale = Math.min(containerWidth / contentBounds.width, containerHeight / contentBounds.height);
      const scale = highlightedBox
        ? getReviewImageHoverScale({
            baseScale,
            box: highlightedBox,
            containerWidth,
            containerHeight,
          })
        : baseScale;
      const focusBox = highlightedBox ?? contentBounds;
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      setRenderedImage({
        left: clampReviewImageOffset(
          containerWidth / 2 - (focusBox.x + focusBox.width / 2) * scale,
          width,
          containerWidth,
        ),
        top: clampReviewImageOffset(
          containerHeight / 2 - (focusBox.y + focusBox.height / 2) * scale,
          height,
          containerHeight,
        ),
        width,
        height,
      });
    };

    updateRenderedImage();
    const observer = new ResizeObserver(updateRenderedImage);
    observer.observe(container);
    return () => observer.disconnect();
  }, [contentBoxes, highlightedBox, sourceHeight, sourceWidth]);

  const highlightStyle =
    renderedImage && highlightedBox && sourceWidth && sourceHeight
      ? {
          left: renderedImage.left + (highlightedBox.x / sourceWidth) * renderedImage.width,
          top: renderedImage.top + (highlightedBox.y / sourceHeight) * renderedImage.height,
          width: (highlightedBox.width / sourceWidth) * renderedImage.width,
          height: (highlightedBox.height / sourceHeight) * renderedImage.height,
        }
      : null;

  return (
    <span
      ref={containerRef}
      className="relative flex aspect-video max-h-[calc(100vh-10rem)] items-center justify-center overflow-hidden"
    >
      {imageError ? (
        <span className="px-4 text-center text-sm text-v2-fg-secondary">스크린샷을 표시할 수 없어요.</span>
      ) : (
        <img
          src={src}
          alt={alt}
          className={cn(renderedImage ? "pointer-events-none absolute max-w-none" : "size-full object-contain")}
          style={renderedImage ?? undefined}
          onLoad={(event) => {
            const image = event.currentTarget;
            setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
          }}
          onError={() => setImageError(true)}
        />
      )}
      {highlightStyle ? (
        <span
          aria-hidden="true"
          data-review-highlight=""
          className="pointer-events-none absolute rounded-md border-2 border-v2-focus bg-v2-highlight shadow-v2-marker"
          style={highlightStyle}
        />
      ) : null}
    </span>
  );
}

function getReviewImageContentBounds(
  boxes: ImageBoundingBox[],
  imageWidth: number,
  imageHeight: number,
): ImageBoundingBox {
  const validBoxes = boxes.flatMap((box) => {
    const left = Math.max(0, Math.min(imageWidth, box.x));
    const top = Math.max(0, Math.min(imageHeight, box.y));
    const right = Math.max(left, Math.min(imageWidth, box.x + box.width));
    const bottom = Math.max(top, Math.min(imageHeight, box.y + box.height));
    return right > left && bottom > top ? [{ x: left, y: top, width: right - left, height: bottom - top }] : [];
  });
  if (validBoxes.length === 0) return { x: 0, y: 0, width: imageWidth, height: imageHeight };

  const left = Math.min(...validBoxes.map((box) => box.x));
  const top = Math.min(...validBoxes.map((box) => box.y));
  const right = Math.max(...validBoxes.map((box) => box.x + box.width));
  const bottom = Math.max(...validBoxes.map((box) => box.y + box.height));
  const width = right - left;
  const height = bottom - top;
  const horizontalBuffer = Math.max(width * REVIEW_IMAGE_BUFFER_RATIO, imageWidth * REVIEW_IMAGE_MIN_BUFFER_RATIO);
  const verticalBuffer = Math.max(height * REVIEW_IMAGE_BUFFER_RATIO, imageHeight * REVIEW_IMAGE_MIN_BUFFER_RATIO);
  const bufferedLeft = Math.max(0, left - horizontalBuffer);
  const bufferedTop = Math.max(0, top - verticalBuffer);
  const bufferedRight = Math.min(imageWidth, right + horizontalBuffer);
  const bufferedBottom = Math.min(imageHeight, bottom + verticalBuffer);

  return {
    x: bufferedLeft,
    y: bufferedTop,
    width: bufferedRight - bufferedLeft,
    height: bufferedBottom - bufferedTop,
  };
}

function getReviewImageHoverScale({
  baseScale,
  box,
  containerWidth,
  containerHeight,
}: {
  baseScale: number;
  box: ImageBoundingBox;
  containerWidth: number;
  containerHeight: number;
}): number {
  if (box.width <= 0 || box.height <= 0) return baseScale;
  const contextScale = Math.min(
    containerWidth / (box.width * REVIEW_IMAGE_HOVER_CONTEXT_RATIO),
    containerHeight / (box.height * REVIEW_IMAGE_HOVER_CONTEXT_RATIO),
  );
  const itemSizeScale = REVIEW_IMAGE_HOVER_MAX_ITEM_SIZE / Math.max(box.width, box.height);
  return Math.max(baseScale, Math.min(contextScale, itemSizeScale, baseScale * REVIEW_IMAGE_HOVER_MAX_SCALE));
}

function clampReviewImageOffset(offset: number, renderedSize: number, containerSize: number): number {
  if (renderedSize <= containerSize) return (containerSize - renderedSize) / 2;
  return Math.min(0, Math.max(containerSize - renderedSize, offset));
}

function ScannerImageGroup({
  jobUid,
  images,
  label,
  selectedImageUid,
  highlightedSources,
  selectionRequiredCountByImageUid,
  allImages,
  onSelect,
}: {
  jobUid: string;
  images: JobStatus["images"];
  label: string;
  selectedImageUid: string | null;
  highlightedSources: string[];
  selectionRequiredCountByImageUid: Record<string, number>;
  allImages: JobStatus["images"];
  onSelect: (image: JobStatus["images"][number]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-v2-fg-tertiary">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((image) => (
          <SourceImagePreview
            key={image.uid}
            jobUid={jobUid}
            image={image}
            number={allImages.findIndex((candidate) => candidate.uid === image.uid) + 1}
            selected={selectedImageUid === image.uid}
            highlighted={highlightedSources.includes(image.filename)}
            selectionRequiredCount={selectionRequiredCountByImageUid[image.uid] ?? 0}
            onSelect={() => onSelect(image)}
          />
        ))}
      </div>
    </div>
  );
}

function SourceImagePreview({
  jobUid,
  image,
  number,
  selected,
  highlighted,
  selectionRequiredCount,
  onSelect,
}: {
  jobUid: string;
  image: JobStatus["images"][number];
  number: number;
  selected: boolean;
  highlighted: boolean;
  selectionRequiredCount: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${number}번 스크린샷 ${image.filename} ${selected ? "선택됨" : "결과 보기"}${selectionRequiredCount > 0 ? `, ${selectionRequiredCount}개 확인 필요` : ""}`}
      className={cn(
        "relative w-24 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-v2-inset text-left",
        selected || highlighted ? "border-v2-fg" : "border-v2-divider hover:border-v2-control-border-strong",
        v2FocusRing,
      )}
    >
      <span className="absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-v2-scrim text-xs font-semibold text-v2-on-media">
        {number}
      </span>
      <span className="block aspect-video bg-v2-inset">
        <img
          src={`/api/ocr/jobs/${encodeURIComponent(jobUid)}/images/${encodeURIComponent(image.uid)}`}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      </span>
      <span className="block truncate px-2 py-1.5 text-xs text-v2-fg-tertiary" title={image.filename}>
        {image.filename}
      </span>
      {selectionRequiredCount > 0 ? (
        <span className="flex min-h-5 items-center gap-1 px-2 pb-1.5 text-[10px] font-medium text-v2-warning">
          <span className="size-1.5 shrink-0 rounded-full bg-v2-warning" aria-hidden="true" />
          <span className="tabular-nums">{selectionRequiredCount}개</span> 확인 필요
        </span>
      ) : (
        <span className="block min-h-5 pb-1.5" aria-hidden="true" />
      )}
    </button>
  );
}
