import { ArrowsPointingOutIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import { Button, Callout, FloatingActionBar, HorizontalScroll, SubTitle } from "~/components/primitives";
import { OCR_ALLOWED_CONTENT_TYPES } from "~/domain/ocr";
import { mapWithConcurrencyLimit } from "~/lib/concurrency";
import { cn } from "~/lib/utils";
import type { ScannerOutletContext } from "../scanner";
import ScannerCompletionState from "../scanner._components/ScannerCompletionState";
import ScannerFileList from "../scanner._components/ScannerFileList";
import ScannerImageDialog from "../scanner._components/ScannerImageDialog";
import ScannerJobShell from "../scanner._components/ScannerJobShell";
import ScannerJobSkeleton from "../scanner._components/ScannerJobSkeleton";
import { notifyScannerJobsChanged } from "../scanner._components/ScannerJobsPanel";
import ScannerProgressCard from "../scanner._components/ScannerProgressCard";
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
  getScannerTerminalJobDescription,
  getScannerTerminalJobTitle,
  getScannerUnavailableResultMessage,
  scannerMessages,
} from "../scanner._components/scanner-messages";
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
  type CellApplySummary,
  CellApplySummaryPanel,
  type CellEdit,
  CellReviewPanel,
  cellAddressKey,
  hasCellReviewCells,
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
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type JobApplication = { status: "pending" | "applied" | "discarded" | "expired"; appliedAt: string | null } | null;

type OcrUploadQuota = ScannerUploadQuota;

type ImageBoundingBox = { x: number; y: number; width: number; height: number };

const REVIEW_IMAGE_BUFFER_RATIO = 0.06;
const REVIEW_IMAGE_MIN_BUFFER_RATIO = 0.02;
const REVIEW_IMAGE_HOVER_CONTEXT_RATIO = 2.25;
const REVIEW_IMAGE_HOVER_MAX_SCALE = 3;
const REVIEW_IMAGE_HOVER_MAX_ITEM_SIZE = 176;

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

export default function ResourceScanner() {
  const { imageUploadQuota: uploadQuota, setImageUploadQuota: setUploadQuota } =
    useOutletContext<ScannerOutletContext>();
  const [files, setFiles] = useState<File[]>([]);
  const [hashProgress, setHashProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [allowsTrainingDataUse, setAllowsTrainingDataUse] = useState(false);
  const [selectedImageUid, setSelectedImageUid] = useState<string | null>(null);
  const [highlightedSources, setHighlightedSources] = useState<string[]>([]);
  const [highlightedReviewPosition, setHighlightedReviewPosition] = useState<number | null>(null);
  const [cellEdits, setCellEdits] = useState<Record<string, CellEdit>>({});
  const [cellCandidateDetails, setCellCandidateDetails] = useState<Record<string, CandidateDetails>>({});
  const [cellApplySummary, setCellApplySummary] = useState<CellApplySummary | null>(null);
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
    setCellApplySummary(null);
  }, []);

  const handleReset = useCallback(() => {
    setFiles([]);
    setSelectedImageUid(null);
    setHighlightedSources([]);
    setHighlightedReviewPosition(null);
    setCellEdits({});
    setCellCandidateDetails({});
    setCellApplySummary(null);
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
  const selectedImageRequiresRecognitionReview =
    selectedImageHasNoResult || (selectedImage !== null && partialRecognitionReviewImageUids.has(selectedImage.uid));

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
        summary: CellApplySummary;
      }>(`/api/ocr/jobs/${job.uid}/apply`, {
        method: "POST",
        body: JSON.stringify({ resultGeneration: job.generation, cells }),
      });
      updateJob((currentJob) => (currentJob ? { ...currentJob, application: response.application } : null));
      setCellApplySummary(response.summary);
      setCellEdits({});
      setCellCandidateDetails({});
      setSelectedImageUid(null);
      setHighlightedSources([]);
      setHighlightedReviewPosition(null);
      setIsImageExpanded(false);
      setPhase("applied");
      notifyScannerJobsChanged();
    } catch (applyError) {
      setError(toScannerErrorMessage(applyError));
      setPhase("review");
    }
  }

  const uploadContent = !selectedJobUid ? (
    <ScannerUploadSection
      title="아이템 스크린샷 업로드"
      description="게임 내 [메뉴] > [아이템] 페이지의 스크린샷을 첨부해주세요"
      inputId="resource-scanner-files"
      accept={OCR_ALLOWED_CONTENT_TYPES.join(",")}
      multiple
      selectionDisabled={isFileSelectionDisabled}
      onFiles={addFiles}
      icon={<PhotoIcon className="size-6" aria-hidden="true" />}
      targetGuide={files.length === 0 ? <ScannerUploadTargetGuide target="item" /> : undefined}
      helpText="1회당 최대 이미지 30장"
      dropDetail={
        files.length > 0 ? (
          <span className="mt-2 text-xs text-muted-foreground">
            {files.length}장 · {formatScannerBytes(files.reduce((sum, file) => sum + file.size, 0))}
            {phase === "uploading"
              ? hashProgress < 1
                ? ` · 파일 확인 ${Math.round(hashProgress * 100)}%`
                : ` · 업로드 ${Math.round(uploadProgress * 100)}%`
              : ""}
            {phase === "uploading" ? (
              <progress
                aria-label={hashProgress < 1 ? "아이템 스크린샷 파일 확인 진행률" : "아이템 스크린샷 업로드 진행률"}
                className="mt-1.5 h-1.5 w-40 accent-primary"
                max={1}
                value={hashProgress < 1 ? hashProgress : uploadProgress}
              />
            ) : null}
          </span>
        ) : null
      }
      consentChecked={allowsTrainingDataUse}
      consentDisabled={isUploadLocked}
      onConsentChange={setAllowsTrainingDataUse}
      actionDisabled={files.length === 0 || isUploadLocked || !uploadQuota || files.length > uploadQuota.remaining}
      actionLabel={
        phase === "uploading"
          ? hashProgress < 1
            ? "파일 확인 중..."
            : `업로드 ${Math.round(uploadProgress * 100)}%`
          : "인식 시작"
      }
      onAction={startRecognition}
    >
      <ScannerFileList
        files={files}
        disabled={isUploadLocked}
        onRemove={(index) => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
      />
    </ScannerUploadSection>
  ) : null;

  const progressContent =
    job && phase === "waiting" ? (
      <ScannerProgressCard
        title="스크린샷을 인식하고 있어요"
        description="페이지를 닫아도 작업은 계속돼요."
        progress={job.progress}
        segmentStatuses={job.images.map((image) => ({ key: image.uid, status: image.status }))}
        segmentLabel="이미지 처리"
        remainingLabel="{remaining}장 남았어요"
        etaLabel="이미지 수에 따라 최대 1분 정도 소요될 수 있어요."
      />
    ) : null;

  const reviewContent =
    phase === "review" || phase === "applying" ? (
      <>
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <SubTitle
                text={job?.status === "failed" ? "스크린샷 확인" : "결과 검토"}
                description={
                  job?.status === "failed"
                    ? "인식하지 못한 스크린샷을 확인한 뒤 다시 시도해 주세요"
                    : "인식 결과를 검토 후 반영 여부를 선택해주세요"
                }
              />
              {job ? (
                <p className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">현재 작업</span>
                  <span className="truncate">
                    아이템 · 스크린샷 {job.images.length}장 · {formatScannerRelativeTime(job.createdAt)}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" onClick={() => resetForNewUpload()}>
                {scannerMessages.item.uploadAction}
              </Button>
            </div>
          </div>
          <div className="space-y-4 rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5">
            {error ? (
              <Callout tone="destructive" title="처리 중 오류가 발생했어요" description={error} />
            ) : job?.reviewError ? (
              <Callout
                tone="destructive"
                title="인식 결과를 확인하지 못했어요"
                description={getScannerUnavailableResultMessage()}
              />
            ) : selectedImageHasNoResult ? (
              <Callout
                tone="warning"
                title="검토가 필요한 스크린샷이 있어요"
                description="인식 결과를 만들지 못한 스크린샷이에요. 원본을 확인한 뒤 새로 업로드해 주세요."
              />
            ) : !selectedImage ? (
              <Callout
                tone="warning"
                title="스크린샷을 표시할 수 없어요"
                description="원본 스크린샷 정보를 확인할 수 없어 결과를 표시하지 못하고 있어요."
              />
            ) : !hasCellReviewCells(job?.cells) ? (
              <Callout
                tone="warning"
                title="인식된 아이템이 없어요"
                description={'스크린샷에 "아이템" 화면이 선명하게 보이는지 확인한 뒤 다시 시도해 주세요.'}
              />
            ) : unknownCount > 0 ? (
              <Callout
                tone="warning"
                title={`자동으로 인식하지 못한 항목이 ${unknownCount}개 있어요`}
                description="결과 화면에서 필요한 아이템과 수량을 확인해주세요."
              />
            ) : null}
            <div
              className={cn(
                "grid min-w-0 gap-5",
                job?.images.length ? "xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)] xl:items-start" : null,
              )}
            >
              {job?.images.length && selectedImage ? (
                <div className="min-w-0 space-y-3 xl:sticky xl:top-16">
                  <div className="flex min-w-0 items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {selectedImageRequiresRecognitionReview ? "검토 필요한 스크린샷" : "인식한 스크린샷"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={selectedImage.filename}>
                        {job.images.findIndex((image) => image.uid === selectedImage.uid) + 1} / {job.images.length} ·{" "}
                        {selectedImage.filename}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsImageExpanded(true)}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      <ArrowsPointingOutIcon className="size-4" aria-hidden="true" />
                      크게 보기
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImageExpanded(true)}
                    aria-label={`${selectedImage.filename} 크게 보기`}
                    className="group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-black/90 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
                    <span className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ArrowsPointingOutIcon className="size-5" aria-hidden="true" />
                    </span>
                  </button>
                  <div className="space-y-3">
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
                </div>
              ) : null}

              <div className="min-w-0 space-y-3">
                {job && !selectedImageHasNoResult && !job.reviewError ? (
                  <CellReviewPanel
                    jobUid={job.uid}
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
                ) : null}
              </div>
            </div>
            {shouldShowScannerCancelAction(job?.status) ? (
              <div className="sticky bottom-[var(--mobile-bottom-offset)] z-layer-navigation lg:bottom-4">
                <FloatingActionBar className="mx-3 flex items-center justify-between gap-4 p-4 md:mx-5">
                  {job?.reviewError ? (
                    <p className="text-sm font-medium text-destructive">인식 결과를 확인할 수 없어요</p>
                  ) : unknownCount > 0 ? (
                    <p className="text-sm font-medium">{unknownCount}개 검토 필요</p>
                  ) : (
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">검토 완료</p>
                  )}
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="danger-subtle"
                      disabled={phase === "applying" || isCancelling}
                      onClick={cancelResult}
                    >
                      {isCancelling ? "취소 중..." : "인식 결과 삭제"}
                    </Button>
                    {shouldShowScannerResultActions(job?.status, job?.reviewMode, job?.reviewError) ? (
                      <Button
                        variant="primary"
                        disabled={phase === "applying" || isCancelling || !hasChanges}
                        onClick={applyResult}
                      >
                        {phase === "applying" ? "반영 중..." : "수량 반영"}
                      </Button>
                    ) : null}
                  </div>
                </FloatingActionBar>
              </div>
            ) : null}
          </div>
        </section>
        {job && selectedImage ? (
          <ScannerImageDialog
            open={isImageExpanded}
            src={`/api/ocr/jobs/${encodeURIComponent(job.uid)}/images/${encodeURIComponent(selectedImage.uid)}`}
            title={selectedImage.filename}
            alt={`${selectedImage.filename} 원본`}
            onClose={() => setIsImageExpanded(false)}
          />
        ) : null}
      </>
    ) : null;

  const completionContent = (
    <>
      {job?.status === "review_ready" && job.application?.status === "applied" ? (
        <>
          {cellApplySummary ? <CellApplySummaryPanel summary={cellApplySummary} /> : null}
          <ScannerCompletionState
            title="아이템 수량 반영이 완료됐어요"
            description="새로운 인식을 시작하려면 아래 버튼을 눌러주세요."
            actionLabel={scannerMessages.item.uploadAction}
            onStartNew={() => resetForNewUpload()}
          />
        </>
      ) : null}

      {job && selectedJobUid && phase === "idle" && error && !TERMINAL_JOB_STATUSES.has(job.status) ? (
        <ScannerCompletionState
          tone="destructive"
          title="인식 작업 상태를 확인하지 못했어요"
          description={error}
          actionLabel={scannerMessages.item.uploadAction}
          onStartNew={() => resetForNewUpload(false)}
        />
      ) : null}

      {job && TERMINAL_JOB_STATUSES.has(job.status) && phase !== "review" ? (
        <ScannerCompletionState
          tone="destructive"
          title={getScannerTerminalJobTitle(job.status, "item_inventory_images_v1")}
          description={getScannerTerminalJobDescription(job.status, "item_inventory_images_v1")}
          actionLabel={scannerMessages.item.uploadAction}
          onStartNew={() => resetForNewUpload()}
        />
      ) : null}
    </>
  );

  return (
    <div className="space-y-8 pb-12 pt-6 lg:pt-2">
      {error && phase !== "review" && phase !== "applying" && !(selectedJobUid && job && phase === "idle") ? (
        <Callout tone="destructive" title="처리 중 오류가 발생했어요" description={error} />
      ) : null}
      {selectedJobUid && !job ? <ScannerJobSkeleton variant="resource" /> : null}
      <ScannerJobShell
        phase={phase}
        upload={uploadContent}
        progress={progressContent}
        review={reviewContent}
        completion={completionContent}
      />
    </div>
  );
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
        boxes: selectedCells.flatMap((cell) => (cell.bbox && cell.bbox.width > 0 && cell.bbox.height > 0 ? [cell.bbox] : [])),
      }
    : null;
}

function ReviewSourceImage({
  src,
  alt,
  imageWidth,
  imageHeight,
  contentBoxes = [],
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
        left: clampReviewImageOffset(containerWidth / 2 - (focusBox.x + focusBox.width / 2) * scale, width, containerWidth),
        top: clampReviewImageOffset(containerHeight / 2 - (focusBox.y + focusBox.height / 2) * scale, height, containerHeight),
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
        <span className="px-4 text-center text-sm text-white/80">스크린샷을 표시할 수 없어요.</span>
      ) : (
        <img
          src={src}
          alt={alt}
          className={cn(
            renderedImage
              ? "pointer-events-none absolute max-w-none transition-[left,top,width,height] duration-200 ease-out"
              : "size-full object-contain",
          )}
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
          className="pointer-events-none absolute rounded-md border-2 border-rose-400 bg-rose-400/20 shadow-[0_0_0_2px_rgba(76,5,25,0.9),0_0_0_4px_rgba(251,113,133,0.95),0_0_16px_rgba(244,63,94,0.65)] transition-[left,top,width,height] duration-200 ease-out"
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
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <HorizontalScroll
        itemWidth={{ mobile: "w-24", desktop: "w-24" }}
        gap="gap-2"
        showArrowsOnMobile
        fadeEdges
        className="pb-1"
        previousButtonLabel={`${label} 이전 스크린샷 보기`}
        nextButtonLabel={`${label} 다음 스크린샷 보기`}
      >
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
      </HorizontalScroll>
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
        "relative w-24 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-muted/30 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
        selected || highlighted ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/60",
      )}
    >
      <span className="absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-black/70 text-xs font-semibold text-white">
        {number}
      </span>
      <span className="block aspect-video bg-muted">
        <img
          src={`/api/ocr/jobs/${encodeURIComponent(jobUid)}/images/${encodeURIComponent(image.uid)}`}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      </span>
      <span className="block truncate px-2 py-1.5 text-xs text-muted-foreground" title={image.filename}>
        {image.filename}
      </span>
      {selectionRequiredCount > 0 ? (
        <span className="flex min-h-5 items-center gap-1 px-2 pb-1.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
          <span className="size-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
          <span className="tabular-nums">{selectionRequiredCount}개</span> 확인 필요
        </span>
      ) : (
        <span className="block min-h-5 pb-1.5" aria-hidden="true" />
      )}
    </button>
  );
}
