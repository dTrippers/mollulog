import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import { ArrowPathIcon, ArrowsPointingOutIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button, Callout, HorizontalScroll, NumberInput, ResourceCard, SubTitle } from "~/components/primitives";
import {
  OCR_ALLOWED_CONTENT_TYPES,
  OCR_CANDIDATE_SELECTION_LIMIT,
  OCR_MAX_IMAGE_BYTES,
  OCR_MAX_IMAGES,
  OCR_MAX_JOB_BYTES,
} from "~/domain/ocr";
import { cn } from "~/lib/utils";
import ScannerCompletionState from "../scanner._components/ScannerCompletionState";
import ScannerJobSkeleton from "../scanner._components/ScannerJobSkeleton";
import { notifyScannerJobsChanged } from "../scanner._components/ScannerJobsPanel";
import ScannerUploadSection from "../scanner._components/ScannerUploadSection";
import {
  formatScannerBytes,
  requestScannerJson,
  ScannerApiRequestError,
  type ScannerPhase,
  toScannerErrorMessage,
} from "../scanner._components/scanner-client";
import { sha256FileNative } from "../scanner._components/sha256-client";
import type { ScannerUploadQuota } from "../scanner._components/UploadQuotaMeter";
import { useScannerQuota } from "../scanner._components/useScannerQuota";
import {
  buildCellApplyPayload,
  buildCellReviewAttentionCounts,
  buildCellReviewPreviewSummary,
  type CandidateDetails,
  type CellApplySummary,
  CellApplySummaryPanel,
  type CellEdit,
  CellReviewPanel,
  CellReviewSummaryPreview,
  cellAddressKey,
  hasCellReviewCells,
  mergeCellCandidateQuantities,
  type ReviewCell,
} from "./resource-cell-review";
import { buildImageReviewSlots, type ReviewLayoutComponent } from "./resource-review-layout";

type JobStatus = {
  uid: string;
  generation: number;
  status: string;
  progress: { completed: number; failed: number; total: number };
  images: Array<{
    uid: string;
    filename: string;
    status: string;
    error?: { code: string; message: string } | null;
  }>;
  result: { items?: BatchItem[]; components?: ReviewLayoutComponent[]; images?: BatchImageResult[] } | null;
  reviewMode?: "cells" | "legacy";
  reviewModeReason?: string | null;
  cells?: ReviewCell[];
  versions: { model: string; catalog: string; schema: string } | null;
  currentQuantities: Record<string, number>;
  resourceRarities: Record<string, number>;
  resourceDescriptions: Record<string, string>;
  application: JobApplication;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type JobApplication = { status: "pending" | "applied" | "discarded" | "expired"; appliedAt: string | null } | null;

type OcrUploadQuota = ScannerUploadQuota;

type BatchItem = {
  resource_uid: string;
  resource_name: string;
  status: "recognized" | "conflict";
  quantity: number | null;
  quantity_exact: boolean;
  observed_quantities: number[];
  source_images: string[];
};

type EditableItem = BatchItem & { included: boolean; editedQuantity: string };

type ResourceCandidate = { uid: string; name: string; score: number };

type ImageBoundingBox = { x: number; y: number; width: number; height: number };

type BatchObservation = {
  observation_id: string;
  bbox?: ImageBoundingBox;
  resource_uid?: string | null;
  resource_name?: string | null;
  quantity?: number | null;
  quantity_exact?: boolean | null;
  candidates?: ResourceCandidate[];
  reasons?: string[];
};

type BatchImageResult = { filename: string; width?: number; height?: number; observations?: BatchObservation[] };

type CandidateOverride = {
  imageFilename: string;
  observationId: string;
  position: number;
  itemUid: string;
  itemName: string;
  editedQuantity: string;
};

type CandidatePickerState = {
  imageFilename: string;
  position: number;
  observation: BatchObservation;
};

const TERMINAL_JOB_STATUSES = new Set(["failed", "cancelled", "expired"]);

export function groupScannerImagesByStatus<T extends { status: string }>(images: T[]) {
  return {
    succeeded: images.filter((image) => image.status === "succeeded"),
    failed: images.filter((image) => image.status === "failed"),
  };
}

export function shouldConfirmUnappliedScannerResult(jobStatus: string | undefined): boolean {
  return jobStatus === "review_ready";
}

function getTerminalJobTitle(status: string): string {
  if (status === "cancelled") return "스크린샷 인식 작업이 취소됐어요";
  if (status === "expired") return "스크린샷 인식 작업이 만료됐어요";
  return "스크린샷을 인식하지 못했어요";
}

function getTerminalJobDescription(status: string): string {
  if (status === "cancelled") return "새 스크린샷을 선택해 다시 인식을 시작해 주세요.";
  if (status === "expired") return "보관 기간이 지난 작업이에요. 새 스크린샷을 선택해 다시 시도해 주세요.";
  return "실패한 이미지를 확인한 뒤 새 스크린샷으로 다시 시도해 주세요.";
}

export default function ResourceScanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<ScannerPhase>("idle");
  const [allowsTrainingDataUse, setAllowsTrainingDataUse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadQuota, setUploadQuota] = useScannerQuota("item_inventory_images_v1", setError);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedImageUid, setSelectedImageUid] = useState<string | null>(null);
  const [highlightedSources, setHighlightedSources] = useState<string[]>([]);
  const [highlightedReviewPosition, setHighlightedReviewPosition] = useState<number | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [cellEdits, setCellEdits] = useState<Record<string, CellEdit>>({});
  const [cellCandidateDetails, setCellCandidateDetails] = useState<Record<string, CandidateDetails>>({});
  const [cellApplySummary, setCellApplySummary] = useState<CellApplySummary | null>(null);
  const [candidateOverrides, setCandidateOverrides] = useState<Record<string, CandidateOverride>>({});
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const selectedJobUid = searchParams.get("job");

  const showJob = useCallback((next: JobStatus) => {
    const firstReviewImage = next.images.find((image) => image.status === "succeeded") ?? next.images[0];
    setJob(next);
    setSelectedSource(firstReviewImage?.filename ?? null);
    setSelectedImageUid(firstReviewImage?.uid ?? null);
    setHighlightedSources([]);
    setHighlightedReviewPosition(null);
    setIsImageExpanded(false);
    setCandidateOverrides({});
    setCellEdits({});
    setCellCandidateDetails({});
    setCellApplySummary(null);
    if (next.status === "review_ready") {
      const isApplied = next.application?.status === "applied";
      setItems(isApplied ? [] : toEditableItems(next));
      setCellEdits({});
      setCellApplySummary(null);
      setPhase(isApplied ? "applied" : "review");
      setError(null);
    } else if (["queued", "processing", "finalizing"].includes(next.status)) {
      setItems([]);
      setPhase("waiting");
      setError(null);
    } else if (next.status === "failed" && next.images.some((image) => image.status === "failed")) {
      setItems([]);
      setPhase("review");
      setError(null);
    } else if (TERMINAL_JOB_STATUSES.has(next.status)) {
      setItems([]);
      setPhase("idle");
      setError(null);
    } else {
      setItems([]);
      setPhase("idle");
      setError("인식 작업 상태를 확인하지 못했어요. 새 스크린샷으로 다시 시도해 주세요.");
    }
  }, []);

  useEffect(() => {
    if (!selectedJobUid) {
      setJob(null);
      setItems([]);
      setSelectedSource(null);
      setSelectedImageUid(null);
      setHighlightedSources([]);
      setHighlightedReviewPosition(null);
      setCandidateOverrides({});
      setCellEdits({});
      setCellCandidateDetails({});
      setCellApplySummary(null);
      setPhase("idle");
      return;
    }
    requestScannerJson<JobStatus>(`/api/ocr/jobs/${selectedJobUid}`)
      .then((savedJob) => {
        showJob(savedJob);
      })
      .catch((loadError) => {
        setSearchParams({}, { replace: true });
        setError(toScannerErrorMessage(loadError));
      });
  }, [selectedJobUid, setSearchParams, showJob]);

  useEffect(() => {
    if (!job || !["queued", "processing", "finalizing"].includes(job.status)) return;
    const delay = job.progress.completed === 0 ? 2000 : 3500;
    const timer = window.setTimeout(async () => {
      try {
        const next = await requestScannerJson<JobStatus>(`/api/ocr/jobs/${job.uid}`);
        showJob(next);
        if (!["queued", "processing", "finalizing"].includes(next.status)) notifyScannerJobsChanged();
      } catch (pollError) {
        setError(toScannerErrorMessage(pollError));
        setJob((current) => (current ? { ...current } : current));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [job, showJob]);

  const unknownCount = useMemo(
    () =>
      job?.reviewMode === "cells"
        ? (job.cells ?? []).filter((cell) => cell.status !== "recognized").length
        : (job?.result?.components?.reduce(
            (count, component) =>
              count + (component.positions ?? []).filter((position) => position.status !== "recognized").length,
            0,
          ) ?? 0),
    [job],
  );

  const selectedImage = useMemo(
    () => job?.images.find((image) => image.uid === selectedImageUid) ?? job?.images[0] ?? null,
    [job, selectedImageUid],
  );

  const selectedImageFailed = selectedImage?.status === "failed";

  const reviewSlots = useMemo(
    () =>
      selectedImageFailed || job?.reviewMode === "cells"
        ? []
        : buildImageReviewSlots(job?.result?.components, items, selectedSource),
    [items, job, selectedImageFailed, selectedSource],
  );

  const recognizedSlotCount = useMemo(
    () => reviewSlots.filter((slot) => slot.itemIndex !== null).length,
    [reviewSlots],
  );

  const imageGroups = useMemo(() => groupScannerImagesByStatus(job?.images ?? []), [job?.images]);

  const selectedResultImage = useMemo(
    () => getSelectedResultImage(job, selectedImageUid, selectedSource),
    [job, selectedImageUid, selectedSource],
  );

  const highlightedObservation =
    highlightedReviewPosition === null
      ? null
      : job?.reviewMode === "cells"
        ? (job.cells?.find(
            (cell) => cell.imageUid === selectedImageUid && cell.position === highlightedReviewPosition,
          ) ?? null)
        : (selectedResultImage?.observations?.[highlightedReviewPosition] ?? null);

  const selectionRequiredCountByFilename = useMemo(
    () =>
      Object.fromEntries(
        (job?.result?.images ?? []).map((image) => [
          image.filename,
          (image.observations ?? []).filter((observation) => {
            if (observation.resource_uid || !observation.candidates?.length) return false;
            return !candidateOverrides[candidateOverrideKey(image.filename, observation.observation_id)];
          }).length,
        ]),
      ),
    [job, candidateOverrides],
  );

  const selectionRequiredCountByImageUid = useMemo(
    () => (job?.reviewMode === "cells" ? buildCellReviewAttentionCounts(job.cells, cellEdits) : {}),
    [cellEdits, job],
  );

  const cellReviewPreview = useMemo(
    () =>
      job?.reviewMode === "cells"
        ? buildCellReviewPreviewSummary(job.cells ?? [], cellEdits, job.currentQuantities)
        : null,
    [cellEdits, job],
  );

  const hasChanges = useMemo(
    () =>
      (cellReviewPreview ? cellReviewPreview.applicableChanged > 0 : false) ||
      items.some((item) => isChangedQuantity(item, job?.currentQuantities[item.resource_uid] ?? 0)) ||
      Object.values(candidateOverrides).some((override) =>
        isValidChangedQuantity(override.editedQuantity, job?.currentQuantities[override.itemUid] ?? 0),
      ),
    [cellReviewPreview, items, candidateOverrides, job],
  );

  const isUploadLocked = phase === "uploading" || phase === "applying";
  const isFileSelectionDisabled = isUploadLocked || uploadQuota?.remaining === 0;

  function setReviewPositionHighlight(position: number, highlighted: boolean) {
    setHighlightedReviewPosition((current) => (highlighted ? position : current === position ? null : current));
  }

  function selectCandidate(state: CandidatePickerState, candidate: ResourceCandidate) {
    const key = candidateOverrideKey(state.imageFilename, state.observation.observation_id);
    setCandidateOverrides((current) => ({
      ...current,
      [key]: {
        imageFilename: state.imageFilename,
        observationId: state.observation.observation_id,
        position: state.position,
        itemUid: candidate.uid,
        itemName: candidate.name,
        editedQuantity: typeof state.observation.quantity === "number" ? String(state.observation.quantity) : "",
      },
    }));
  }

  function clearCandidateSelection(state: CandidatePickerState) {
    const key = candidateOverrideKey(state.imageFilename, state.observation.observation_id);
    setCandidateOverrides((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function clearSelectedJob(confirmUnappliedResult = false) {
    if (confirmUnappliedResult && !window.confirm("현재 인식 결과를 반영하지 않고 새 스크린샷을 업로드할까요?")) {
      return;
    }
    setSearchParams({}, { replace: true });
    setFiles([]);
    setJob(null);
    setItems([]);
    setSelectedSource(null);
    setSelectedImageUid(null);
    setHighlightedSources([]);
    setHighlightedReviewPosition(null);
    setIsImageExpanded(false);
    setCandidateOverrides({});
    setCellEdits({});
    setCellCandidateDetails({});
    setCellApplySummary(null);
    setIsCancelling(false);
    setError(null);
    setPhase("idle");
  }

  async function cancelResult() {
    if (job?.status !== "review_ready" || isCancelling) return;
    if (!window.confirm("이 인식 결과를 취소할까요? 결과는 반영되지 않고 최근 작업에서 사라집니다.")) {
      return;
    }

    setIsCancelling(true);
    setError(null);
    try {
      await requestScannerJson<{ uid: string; status: "cancelled" }>(`/api/ocr/jobs/${job.uid}/cancel`, {
        method: "POST",
      });
      clearSelectedJob();
      notifyScannerJobsChanged();
    } catch (cancelError) {
      setError(toScannerErrorMessage(cancelError));
    } finally {
      setIsCancelling(false);
    }
  }

  function addFiles(candidates: File[]) {
    if (isFileSelectionDisabled || candidates.length === 0) return;

    const nextFiles = job ? [] : [...files];
    for (const file of candidates) {
      if (!OCR_ALLOWED_CONTENT_TYPES.includes(file.type as (typeof OCR_ALLOWED_CONTENT_TYPES)[number])) {
        setError(`${file.name}: PNG, JPEG, WebP 이미지만 첨부할 수 있어요.`);
        return;
      }
      if (file.size <= 0) {
        setError(`${file.name}: 비어 있는 파일은 첨부할 수 없어요.`);
        return;
      }
      if (file.size > OCR_MAX_IMAGE_BYTES) {
        setError(`${file.name}: 이미지 한 장은 10MB를 넘을 수 없어요.`);
        return;
      }

      const isDuplicate = nextFiles.some(
        (selected) =>
          selected.name === file.name && selected.size === file.size && selected.lastModified === file.lastModified,
      );
      if (!isDuplicate) nextFiles.push(file);
    }

    if (nextFiles.length > OCR_MAX_IMAGES) {
      setError(`스크린샷은 최대 ${OCR_MAX_IMAGES}장까지 첨부할 수 있어요.`);
      return;
    }
    if (uploadQuota && nextFiles.length > uploadQuota.remaining) {
      setError(`현재 업로드할 수 있는 스크린샷은 ${uploadQuota.remaining}장이에요.`);
      return;
    }
    if (nextFiles.reduce((total, file) => total + file.size, 0) > OCR_MAX_JOB_BYTES) {
      setError("첨부한 스크린샷의 전체 용량은 120MB를 넘을 수 없어요.");
      return;
    }

    if (job) clearSelectedJob();
    setFiles(nextFiles);
    setError(null);
  }

  async function startRecognition() {
    if (files.length === 0) return;
    setError(null);
    setPhase("uploading");
    try {
      const descriptors = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
          sha256: await sha256FileNative(file),
        })),
      );
      const created = await requestScannerJson<{
        jobUid: string;
        quota: OcrUploadQuota;
        images: Array<{ imageUid: string; filename: string; uploadUrl: string }>;
      }>("/api/ocr/jobs", {
        method: "POST",
        body: JSON.stringify({ images: descriptors, trainingConsent: allowsTrainingDataUse }),
      });
      setUploadQuota(created.quota);
      await Promise.all(
        created.images.map(async (upload, index) => {
          const response = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "content-type": files[index].type },
            body: files[index],
          });
          if (!response.ok) throw new Error(`${files[index].name} 업로드에 실패했어요`);
        }),
      );
      const submitted = await requestScannerJson<JobStatus & { quota: OcrUploadQuota }>(
        `/api/ocr/jobs/${created.jobUid}/submit`,
        { method: "POST" },
      );
      setUploadQuota(submitted.quota);
      setSearchParams({ job: created.jobUid }, { replace: true });
      setJob({
        ...submitted,
        currentQuantities: {},
        resourceRarities: {},
        resourceDescriptions: {},
        application: null,
      });
      setFiles([]);
      setAllowsTrainingDataUse(false);
      setPhase("waiting");
      notifyScannerJobsChanged();
    } catch (startError) {
      if (startError instanceof ScannerApiRequestError && startError.quota) setUploadQuota(startError.quota);
      setError(toScannerErrorMessage(startError));
      setPhase("idle");
    }
  }

  async function applyResult() {
    if (!job) return;
    setError(null);
    setPhase("applying");
    try {
      if (job.reviewMode === "cells") {
        const cells = buildCellApplyPayload(job.cells ?? [], cellEdits);
        const response = await requestScannerJson<{
          application: NonNullable<JobApplication>;
          summary: CellApplySummary;
        }>(`/api/ocr/jobs/${job.uid}/apply`, {
          method: "POST",
          body: JSON.stringify({ resultGeneration: job.generation, cells }),
        });
        setJob({ ...job, application: response.application });
        setCellApplySummary(response.summary);
        setCellEdits({});
        setCellCandidateDetails({});
        setSelectedSource(null);
        setSelectedImageUid(null);
        setHighlightedSources([]);
        setHighlightedReviewPosition(null);
        setIsImageExpanded(false);
        setPhase("applied");
        notifyScannerJobsChanged();
        return;
      }
      const recognized = items
        .filter((item) => item.included)
        .map((item) => {
          if (!item.editedQuantity.trim()) throw new Error(`${item.resource_name} 수량을 확인해 주세요`);
          const quantity = Number(item.editedQuantity);
          if (!Number.isInteger(quantity) || quantity < 0)
            throw new Error(`${item.resource_name} 수량을 확인해 주세요`);
          return {
            itemUid: item.resource_uid,
            quantity,
          };
        });
      const manuallySelected = Object.values(candidateOverrides).map((override) => {
        if (!override.editedQuantity.trim()) throw new Error(`${override.itemName} 수량을 확인해 주세요`);
        const quantity = Number(override.editedQuantity);
        if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`${override.itemName} 수량을 확인해 주세요`);
        return {
          itemUid: override.itemUid,
          quantity,
          candidateSelection: {
            imageFilename: override.imageFilename,
            observationId: override.observationId,
          },
        };
      });
      const selected = mergeApplyItems(recognized, manuallySelected);
      const response = await requestScannerJson<{ application: NonNullable<JobApplication> }>(
        `/api/ocr/jobs/${job.uid}/apply`,
        {
          method: "POST",
          body: JSON.stringify({ items: selected }),
        },
      );
      setJob({ ...job, application: response.application });
      setItems([]);
      setSelectedSource(null);
      setSelectedImageUid(null);
      setHighlightedSources([]);
      setHighlightedReviewPosition(null);
      setIsImageExpanded(false);
      setCandidateOverrides({});
      setCellEdits({});
      setCellCandidateDetails({});
      setCellApplySummary(null);
      setPhase("applied");
      notifyScannerJobsChanged();
    } catch (applyError) {
      setError(toScannerErrorMessage(applyError));
      setPhase("review");
    }
  }

  return (
    <div className="space-y-8 pb-12 pt-6 lg:pt-2">
      {!selectedJobUid ? (
        <ScannerUploadSection
          title="아이템 스크린샷 업로드"
          description="게임 내 [메뉴] > [아이템] 페이지의 스크린샷을 첨부해주세요"
          quota={uploadQuota}
          quotaUnit="장"
          quotaSubject="스크린샷"
          inputId="resource-scanner-files"
          accept={OCR_ALLOWED_CONTENT_TYPES.join(",")}
          multiple
          selectionDisabled={isFileSelectionDisabled}
          onFiles={addFiles}
          icon={<PhotoIcon className="size-6" aria-hidden="true" />}
          dropLabel={files.length > 0 ? "스크린샷 더 추가하기" : "스크린샷을 선택하거나 이곳에 끌어다 놓아주세요"}
          helpText="PNG, JPEG, WebP · 장당 10MB · 전체 120MB · 최대 30장"
          consentChecked={allowsTrainingDataUse}
          consentDisabled={isUploadLocked}
          onConsentChange={setAllowsTrainingDataUse}
          consentDataLabel="스크린샷 데이터"
          actionDisabled={files.length === 0 || isUploadLocked || !uploadQuota || files.length > uploadQuota.remaining}
          actionLabel={phase === "uploading" ? "업로드 중..." : "인식 시작"}
          onAction={startRecognition}
        >
          {files.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="sr-only">선택한 스크린샷</legend>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-medium text-foreground">선택한 스크린샷</p>
                <p className="text-muted-foreground" aria-live="polite">
                  {files.length}장 · {formatScannerBytes(files.reduce((sum, file) => sum + file.size, 0))}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {files.map((file, index) => (
                  <SelectedFilePreview
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    file={file}
                    disabled={isUploadLocked}
                    onRemove={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}
        </ScannerUploadSection>
      ) : null}

      {error ? <Callout tone="destructive" title="처리 중 오류가 발생했어요" description={error} /> : null}

      {selectedJobUid && !job ? <ScannerJobSkeleton variant="resource" /> : null}

      {job && phase === "waiting" ? <RecognitionProgressCard job={job} /> : null}

      {phase === "review" || phase === "applying" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SubTitle text="결과 검토" description="인식 결과를 검토 후 반영 여부를 선택해주세요" />
            <Button size="sm" onClick={() => clearSelectedJob(shouldConfirmUnappliedScannerResult(job?.status))}>
              새 스크린샷 업로드
            </Button>
          </div>
          <div className="space-y-4 rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5">
            {unknownCount > 0 && !selectedImageFailed ? (
              <Callout
                tone="warning"
                title={`자동으로 인식하지 못한 항목이 ${unknownCount}개 있어요`}
                description="후보가 있는 항목은 해당 셀에서 직접 아이템을 선택할 수 있어요"
              />
            ) : null}
            {!selectedImageFailed &&
            (job?.reviewMode === "cells"
              ? !hasCellReviewCells(job.cells)
              : items.length === 0 && reviewSlots.length === 0) ? (
              <Callout
                tone="warning"
                title="인식된 아이템이 없어요"
                description={'스크린샷에 "아이템" 화면이 선명하게 보이는지 확인한 뒤 다시 시도해 주세요.'}
              />
            ) : null}
            {job?.reviewMode === "cells" && !selectedImage ? (
              <Callout
                tone="warning"
                title="스크린샷을 표시할 수 없어요"
                description="원본 스크린샷 정보를 확인할 수 없어 셀 위치를 표시하지 못하고 있어요."
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
                        {selectedImageFailed ? "검토 필요한 스크린샷" : "인식한 스크린샷"}
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
                      highlightedBox={highlightedObservation?.bbox ?? undefined}
                    />
                    <span className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ArrowsPointingOutIcon className="size-5" aria-hidden="true" />
                    </span>
                  </button>
                  <div className="space-y-3">
                    {imageGroups.succeeded.length > 0 ? (
                      <ScannerImageGroup
                        jobUid={job.uid}
                        images={imageGroups.succeeded}
                        label={`인식 성공 ${imageGroups.succeeded.length}장`}
                        selectedImageUid={selectedImage.uid}
                        highlightedSources={highlightedSources}
                        selectionRequiredCountByImageUid={selectionRequiredCountByImageUid}
                        selectionRequiredCountByFilename={selectionRequiredCountByFilename}
                        reviewMode={job.reviewMode}
                        allImages={job.images}
                        onSelect={(image) => {
                          setHighlightedSources([]);
                          setHighlightedReviewPosition(null);
                          setSelectedSource(image.filename);
                          setSelectedImageUid(image.uid);
                        }}
                      />
                    ) : null}
                    {imageGroups.failed.length > 0 ? (
                      <ScannerImageGroup
                        jobUid={job.uid}
                        images={imageGroups.failed}
                        label={`검토 필요 ${imageGroups.failed.length}장`}
                        selectedImageUid={selectedImage.uid}
                        highlightedSources={[]}
                        selectionRequiredCountByImageUid={{}}
                        selectionRequiredCountByFilename={{}}
                        reviewMode={job.reviewMode}
                        allImages={job.images}
                        onSelect={(image) => {
                          setHighlightedSources([]);
                          setHighlightedReviewPosition(null);
                          setSelectedSource(image.filename);
                          setSelectedImageUid(image.uid);
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="min-w-0 space-y-3">
                {selectedImageFailed ? (
                  <Callout
                    tone="warning"
                    title="이 스크린샷은 검토가 필요해요"
                    description="이 스크린샷에서는 인식 결과를 만들지 못했어요. 원본을 확인한 뒤 새 스크린샷으로 다시 시도해 주세요."
                  />
                ) : job?.reviewMode === "cells" ? (
                  <CellReviewPanel
                    jobUid={job.uid}
                    selectedSource={selectedSource}
                    selectedImageUid={selectedImage?.uid ?? null}
                    cells={job.cells ?? []}
                    edits={cellEdits}
                    candidateDetails={cellCandidateDetails}
                    disabled={phase === "applying"}
                    onHighlightChange={setReviewPositionHighlight}
                    onLoadCandidates={(cell, details) => {
                      setCellCandidateDetails((current) => ({ ...current, [cellAddressKey(cell)]: details }));
                      setJob((current) =>
                        current
                          ? {
                              ...current,
                              currentQuantities: mergeCellCandidateQuantities(current.currentQuantities, details),
                            }
                          : current,
                      );
                    }}
                    onEdit={(cell, edit) =>
                      setCellEdits((current) => ({
                        ...current,
                        [cellAddressKey(cell)]: { ...current[cellAddressKey(cell)], ...edit },
                      }))
                    }
                  />
                ) : (
                  <>
                    {reviewSlots.length > 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">인식 결과</p>
                        <p className="text-xs text-muted-foreground">
                          재화 식별{" "}
                          <span className="tabular-nums">
                            {recognizedSlotCount} / {reviewSlots.length}
                          </span>
                        </p>
                      </div>
                    ) : null}
                    {reviewSlots.length > 0 ? (
                      <div className="grid grid-cols-5 gap-x-2 gap-y-2.5">
                        {reviewSlots.map((slot) => {
                          if (slot.itemIndex === null) {
                            const observation = selectedResultImage?.observations?.[slot.position];
                            const pickerState =
                              observation && selectedResultImage
                                ? {
                                    imageFilename: selectedResultImage.filename,
                                    position: slot.position,
                                    observation,
                                  }
                                : null;
                            const overrideKey = pickerState
                              ? candidateOverrideKey(pickerState.imageFilename, pickerState.observation.observation_id)
                              : null;
                            const override = overrideKey ? candidateOverrides[overrideKey] : undefined;
                            if (override && pickerState && overrideKey) {
                              const selectedOverrideKey = overrideKey;
                              return (
                                <ManuallySelectedResourceTile
                                  key={`manual-${selectedOverrideKey}`}
                                  override={override}
                                  pickerState={pickerState}
                                  currentQuantity={job?.currentQuantities[override.itemUid] ?? 0}
                                  rarity={job?.resourceRarities[override.itemUid]}
                                  resourceRarities={job?.resourceRarities ?? {}}
                                  resourceDescriptions={job?.resourceDescriptions ?? {}}
                                  disabled={phase === "applying"}
                                  onHighlightChange={(highlighted) =>
                                    setReviewPositionHighlight(slot.position, highlighted)
                                  }
                                  onSelectCandidate={(candidate) => selectCandidate(pickerState, candidate)}
                                  onClearCandidate={() => clearCandidateSelection(pickerState)}
                                  onQuantityChange={(quantity) => {
                                    setCandidateOverrides((current) => ({
                                      ...current,
                                      [selectedOverrideKey]: {
                                        ...current[selectedOverrideKey],
                                        editedQuantity: quantity == null ? "" : String(quantity),
                                      },
                                    }));
                                  }}
                                />
                              );
                            }
                            const candidates = observation?.candidates?.slice(0, OCR_CANDIDATE_SELECTION_LIMIT) ?? [];
                            const hasDuplicateVisualIdentity =
                              observation?.reasons?.includes("resource_visual_identity_ambiguous") ?? false;
                            return (
                              <UnrecognizedResourceTile
                                key={`empty-${slot.position}`}
                                position={slot.position}
                                pickerState={pickerState}
                                resourceRarities={job?.resourceRarities ?? {}}
                                resourceDescriptions={job?.resourceDescriptions ?? {}}
                                hasCandidates={candidates.length > 0}
                                hasDuplicateVisualIdentity={hasDuplicateVisualIdentity}
                                disabled={phase === "applying"}
                                onHighlightChange={(highlighted) =>
                                  setReviewPositionHighlight(slot.position, highlighted)
                                }
                                onSelectCandidate={(candidate) => {
                                  if (pickerState) selectCandidate(pickerState, candidate);
                                }}
                              />
                            );
                          }

                          const item = items[slot.itemIndex];
                          return (
                            <RecognizedResourceTile
                              key={`${slot.position}-${item.resource_uid}`}
                              item={item}
                              currentQuantity={job?.currentQuantities[item.resource_uid] ?? 0}
                              rarity={job?.resourceRarities[item.resource_uid]}
                              disabled={phase === "applying"}
                              applied={false}
                              onHighlightChange={(highlighted) =>
                                setReviewPositionHighlight(slot.position, highlighted)
                              }
                              onToggle={() => {
                                setHighlightedSources(item.source_images);
                                setItems((current) =>
                                  current.map((entry, index) =>
                                    index === slot.itemIndex ? { ...entry, included: !entry.included } : entry,
                                  ),
                                );
                              }}
                              onQuantityChange={(quantity) =>
                                setItems((current) =>
                                  current.map((entry, index) =>
                                    index === slot.itemIndex
                                      ? {
                                          ...entry,
                                          editedQuantity: quantity == null ? "" : String(quantity),
                                          included: quantity !== null,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          );
                        })}
                      </div>
                    ) : items.length > 0 ? (
                      <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                        이 스크린샷에서 확정된 아이템이 없어요.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {job?.reviewMode === "cells" && !selectedImageFailed ? (
              <CellReviewSummaryPreview
                cells={job.cells ?? []}
                edits={cellEdits}
                currentQuantities={job.currentQuantities}
              />
            ) : null}
            {job?.status === "review_ready" ? (
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="danger-subtle" disabled={phase === "applying" || isCancelling} onClick={cancelResult}>
                  {isCancelling ? "취소 중..." : "인식 결과 삭제"}
                </Button>
                <Button
                  variant="primary"
                  disabled={phase === "applying" || isCancelling || !hasChanges}
                  onClick={applyResult}
                >
                  {phase === "applying" ? "반영 중..." : "수량 반영"}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {job?.status === "review_ready" && job.application?.status === "applied" ? (
        <>
          {cellApplySummary ? <CellApplySummaryPanel summary={cellApplySummary} /> : null}
          <ScannerCompletionState
            title="아이템 수량 반영이 완료됐어요"
            description="새로운 스크린샷을 업로드하려면 아래 버튼을 눌러주세요."
            actionLabel="새 스크린샷 업로드"
            onStartNew={() => clearSelectedJob()}
          />
        </>
      ) : null}

      {job && TERMINAL_JOB_STATUSES.has(job.status) && phase !== "review" ? (
        <ScannerCompletionState
          tone="destructive"
          title={getTerminalJobTitle(job.status)}
          description={getTerminalJobDescription(job.status)}
          actionLabel="새 스크린샷 업로드"
          onStartNew={() => clearSelectedJob()}
        />
      ) : null}

      {job && selectedImage && phase !== "applied" ? (
        <SourceImageDialog
          open={isImageExpanded}
          jobUid={job.uid}
          image={selectedImage}
          onClose={() => setIsImageExpanded(false)}
        />
      ) : null}
    </div>
  );
}

function getSelectedResultImage(
  job: JobStatus | null,
  selectedImageUid: string | null,
  _selectedSource: string | null,
): BatchImageResult | null {
  if (job?.reviewMode === "cells") {
    const selectedCells = (job.cells ?? []).filter((cell) => !selectedImageUid || cell.imageUid === selectedImageUid);
    const firstCell = selectedCells[0];
    return firstCell
      ? { filename: firstCell.filename, width: firstCell.width ?? undefined, height: firstCell.height ?? undefined }
      : null;
  }
  if (!job?.result?.images?.length) return null;
  const selectedImage = job.images.find((image) => image.uid === selectedImageUid) ?? job.images[0];
  if (!selectedImage) return null;
  const succeededImages = job.images.filter((image) => image.status === "succeeded");
  const resultIndex = succeededImages.findIndex((image) => image.uid === selectedImage.uid);
  return resultIndex >= 0 ? (job.result.images[resultIndex] ?? null) : null;
}

function RecognitionProgressCard({ job }: { job: JobStatus }) {
  const processed = job.progress.completed + job.progress.failed;
  const remaining = Math.max(0, job.progress.total - processed);
  const percentage = job.progress.total > 0 ? (processed / job.progress.total) * 100 : 0;

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="rounded-lg border border-primary/20 bg-primary/10 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ArrowPathIcon className="size-5 animate-spin" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-foreground">스크린샷을 인식하고 있어요</h2>
              <p className="mt-1 text-sm text-muted-foreground">페이지를 닫아도 작업은 계속돼요.</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {processed}/{job.progress.total}
              </p>
              <p className="text-xs text-muted-foreground">이미지 처리</p>
            </div>
          </div>

          <progress
            aria-label={`스크린샷 ${job.progress.total}장 중 ${processed}장 처리`}
            max={job.progress.total}
            value={processed}
            className="sr-only"
          />
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary/15" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {job.images.map((image) => (
              <span
                key={image.uid}
                className={cn(
                  "h-1.5 min-w-1 flex-1 rounded-full",
                  image.status === "succeeded"
                    ? "bg-primary"
                    : image.status === "failed"
                      ? "bg-destructive"
                      : image.status === "processing"
                        ? "animate-pulse bg-primary/60"
                        : "animate-pulse bg-primary/20",
                )}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{remaining > 0 ? `${remaining}장 남았어요` : "인식 결과를 정리하고 있어요"}</span>
            <span>이미지 수에 따라 최대 1분 정도 소요될 수 있어요.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SelectedFilePreview({ file, disabled, onRemove }: { file: File; disabled: boolean; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="aspect-video bg-muted">
        {previewUrl ? (
          <img src={previewUrl} alt={`${file.name} 미리보기`} className="size-full object-contain" />
        ) : null}
      </div>
      <div className="min-w-0 px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatScannerBytes(file.size)}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`${file.name} 삭제`}
        className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
      >
        <XMarkIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ReviewSourceImage({
  src,
  alt,
  imageWidth,
  imageHeight,
  highlightedBox,
}: {
  src: string;
  alt: string;
  imageWidth?: number;
  imageHeight?: number;
  highlightedBox?: ImageBoundingBox;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [imageError, setImageError] = useState(false);
  const [renderedImage, setRenderedImage] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !imageWidth || !imageHeight) {
      setRenderedImage(null);
      return;
    }

    const updateRenderedImage = () => {
      const scale = Math.min(container.clientWidth / imageWidth, container.clientHeight / imageHeight);
      const width = imageWidth * scale;
      const height = imageHeight * scale;
      setRenderedImage({
        left: (container.clientWidth - width) / 2,
        top: (container.clientHeight - height) / 2,
        width,
        height,
      });
    };

    updateRenderedImage();
    const observer = new ResizeObserver(updateRenderedImage);
    observer.observe(container);
    return () => observer.disconnect();
  }, [imageWidth, imageHeight]);

  const highlightStyle =
    renderedImage && highlightedBox && imageWidth && imageHeight
      ? {
          left: renderedImage.left + (highlightedBox.x / imageWidth) * renderedImage.width,
          top: renderedImage.top + (highlightedBox.y / imageHeight) * renderedImage.height,
          width: (highlightedBox.width / imageWidth) * renderedImage.width,
          height: (highlightedBox.height / imageHeight) * renderedImage.height,
        }
      : null;

  return (
    <span
      ref={containerRef}
      className="relative flex aspect-video max-h-[calc(100vh-10rem)] items-center justify-center"
    >
      {imageError ? (
        <span className="px-4 text-center text-sm text-white/80">스크린샷을 표시할 수 없어요.</span>
      ) : (
        <img src={src} alt={alt} className="size-full object-contain" onError={() => setImageError(true)} />
      )}
      {highlightStyle ? (
        <span
          aria-hidden="true"
          data-review-highlight=""
          className="pointer-events-none absolute rounded-md border-2 border-rose-400 bg-rose-400/20 shadow-[0_0_0_2px_rgba(76,5,25,0.9),0_0_0_4px_rgba(251,113,133,0.95),0_0_16px_rgba(244,63,94,0.65)] transition-[left,top,width,height] duration-150"
          style={highlightStyle}
        />
      ) : null}
    </span>
  );
}

function ScannerImageGroup({
  jobUid,
  images,
  label,
  selectedImageUid,
  highlightedSources,
  selectionRequiredCountByImageUid,
  selectionRequiredCountByFilename,
  reviewMode,
  allImages,
  onSelect,
}: {
  jobUid: string;
  images: JobStatus["images"];
  label: string;
  selectedImageUid: string | null;
  highlightedSources: string[];
  selectionRequiredCountByImageUid: Record<string, number>;
  selectionRequiredCountByFilename: Record<string, number>;
  reviewMode?: "cells" | "legacy";
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
        previousButtonLabel="이전 스크린샷 보기"
        nextButtonLabel="다음 스크린샷 보기"
      >
        {images.map((image) => (
          <SourceImagePreview
            key={image.uid}
            jobUid={jobUid}
            image={image}
            number={allImages.findIndex((candidate) => candidate.uid === image.uid) + 1}
            selected={selectedImageUid === image.uid}
            highlighted={highlightedSources.includes(image.filename)}
            selectionRequiredCount={
              reviewMode === "cells"
                ? (selectionRequiredCountByImageUid[image.uid] ?? 0)
                : (selectionRequiredCountByFilename[image.filename] ?? 0)
            }
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

function SourceImageDialog({
  open,
  jobUid,
  image,
  onClose,
}: {
  open: boolean;
  jobUid: string;
  image: JobStatus["images"][number];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-layer-modal">
      <DialogBackdrop className="fixed inset-0 bg-black/85 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
        <DialogPanel className="relative flex max-h-full w-full max-w-[min(96rem,96vw)] flex-col overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-white">
            <DialogTitle className="truncate text-sm font-medium">{image.filename}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="확대 이미지 닫기"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <XMarkIcon className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-4">
            <img
              src={`/api/ocr/jobs/${encodeURIComponent(jobUid)}/images/${encodeURIComponent(image.uid)}`}
              alt={`${image.filename} 원본`}
              className="max-h-[calc(100vh-7rem)] max-w-full object-contain"
            />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function CandidatePopover({
  state,
  selectedItemUid,
  resourceRarities,
  resourceDescriptions,
  disabled,
  triggerLabel,
  triggerClassName,
  children,
  onHighlightChange,
  onSelect,
  onClear,
}: {
  state: CandidatePickerState;
  selectedItemUid?: string;
  resourceRarities: Record<string, number>;
  resourceDescriptions: Record<string, string>;
  disabled: boolean;
  triggerLabel: string;
  triggerClassName: string;
  children: ReactNode;
  onHighlightChange: (highlighted: boolean) => void;
  onSelect: (candidate: ResourceCandidate) => void;
  onClear?: () => void;
}) {
  const row = Math.floor(state.position / 5) + 1;
  const column = (state.position % 5) + 1;
  const candidates = state.observation.candidates?.slice(0, OCR_CANDIDATE_SELECTION_LIMIT) ?? [];
  const hasDuplicateVisualIdentity = state.observation.reasons?.includes("resource_visual_identity_ambiguous") ?? false;

  return (
    <Popover className="relative">
      {({ close, open }) => (
        <>
          <CandidatePopoverHighlightSync highlighted={open} onChange={onHighlightChange} />
          <PopoverButton
            disabled={disabled}
            aria-label={triggerLabel}
            className={triggerClassName}
            onMouseEnter={() => onHighlightChange(true)}
            onMouseLeave={() => {
              if (!open) onHighlightChange(false);
            }}
          >
            {children}
          </PopoverButton>
          <PopoverPanel
            anchor="bottom"
            className="z-layer-navigation-menu w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-card shadow-xl [--anchor-gap:0.375rem]"
          >
            <div className="flex items-start justify-between gap-2 border-b border-border px-2.5 py-2.5">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    hasDuplicateVisualIdentity ? "text-destructive" : "text-foreground",
                  )}
                >
                  {hasDuplicateVisualIdentity ? "중복 감지" : "아이템 후보 선택"}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {hasDuplicateVisualIdentity
                    ? `이미지의 ${row}행 ${column}열에서 아이콘이 같은 아이템이 감지됐어요.`
                    : `이미지의 ${row}행 ${column}열과 비교해 아이템을 선택해 주세요.`}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="아이템 후보 닫기"
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <XMarkIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[min(24rem,60vh)] space-y-1.5 overflow-y-auto p-2">
              {candidates.map((candidate) => {
                const description = resourceDescriptions[candidate.uid];
                return (
                  <button
                    key={candidate.uid}
                    type="button"
                    aria-pressed={selectedItemUid === candidate.uid}
                    onClick={() => {
                      onSelect(candidate);
                      close();
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2.5 rounded-md border bg-card p-2 text-left outline-none transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/40",
                      selectedItemUid === candidate.uid ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <ResourceCard
                      itemUid={candidate.uid}
                      rarity={resourceRarities[candidate.uid]}
                      name={candidate.name}
                      size="md"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{candidate.name}</span>
                      {description ? (
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
                          {description}
                        </span>
                      ) : null}
                    </span>
                    {selectedItemUid === candidate.uid ? (
                      <span className="shrink-0 text-[10px] font-medium text-primary">선택됨</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {selectedItemUid && onClear ? (
              <div className="flex justify-end border-t border-border px-2.5 py-2">
                <Button
                  size="xs"
                  onClick={() => {
                    onClear();
                    close();
                  }}
                >
                  선택 해제
                </Button>
              </div>
            ) : null}
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

function CandidatePopoverHighlightSync({
  highlighted,
  onChange,
}: {
  highlighted: boolean;
  onChange: (highlighted: boolean) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!highlighted) return;
    onChangeRef.current(true);
    return () => onChangeRef.current(false);
  }, [highlighted]);

  return null;
}

function RecognizedResourceTile({
  item,
  currentQuantity,
  rarity,
  disabled,
  applied,
  onHighlightChange,
  onToggle,
  onQuantityChange,
}: {
  item: EditableItem;
  currentQuantity: number;
  rarity?: number;
  disabled: boolean;
  applied: boolean;
  onHighlightChange: (highlighted: boolean) => void;
  onToggle: () => void;
  onQuantityChange: (quantity: number | null) => void;
}) {
  const quantity = item.editedQuantity === "" ? null : Number(item.editedQuantity);

  return (
    <div className="flex w-12 justify-self-center flex-col items-center gap-0.5 rounded-md py-1 md:w-14">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={applied ? undefined : item.included}
        aria-label={
          applied
            ? `${item.resource_name} 반영된 인식 결과`
            : `${item.resource_name} ${item.included ? "결과에서 제외" : "결과에 포함"}`
        }
        onClick={onToggle}
        onMouseEnter={() => onHighlightChange(true)}
        onMouseLeave={() => onHighlightChange(false)}
        className={cn(
          "cursor-pointer rounded-lg outline-none transition-[opacity,filter] focus-visible:ring-2 focus-visible:ring-ring/40",
          !item.included && "opacity-35 grayscale",
          disabled && "cursor-default",
        )}
      >
        <ResourceCard itemUid={item.resource_uid} rarity={rarity} name={item.resource_name} size="lg" />
      </button>
      <span className="sr-only">{item.resource_name}</span>
      <div className="flex w-full items-center justify-between gap-1 px-0.5 text-[10px] leading-tight">
        <span className="shrink-0 whitespace-nowrap text-muted-foreground/70">현재</span>
        <span className="min-w-0 truncate font-bold tabular-nums text-foreground">
          {currentQuantity.toLocaleString()}
        </span>
      </div>
      <div className="w-full">
        <NumberInput
          nullable
          minValue={0}
          showDecrease={false}
          showIncrease={false}
          size="sm"
          disabled={disabled}
          value={Number.isFinite(quantity) ? quantity : null}
          inputProps={{ "aria-label": `${item.resource_name} 인식 수량` }}
          onChange={onQuantityChange}
        />
      </div>
      {item.status === "conflict" && item.observed_quantities.length > 0 ? (
        <p
          className="w-max whitespace-nowrap text-center text-[8px] leading-tight tracking-tight text-destructive sm:text-[9px] xl:text-[10px]"
          title="수량 인식 실패"
        >
          수량 인식 실패
        </p>
      ) : null}
    </div>
  );
}

function ManuallySelectedResourceTile({
  override,
  pickerState,
  currentQuantity,
  rarity,
  resourceRarities,
  resourceDescriptions,
  disabled,
  onHighlightChange,
  onSelectCandidate,
  onClearCandidate,
  onQuantityChange,
}: {
  override: CandidateOverride;
  pickerState: CandidatePickerState;
  currentQuantity: number;
  rarity?: number;
  resourceRarities: Record<string, number>;
  resourceDescriptions: Record<string, string>;
  disabled: boolean;
  onHighlightChange: (highlighted: boolean) => void;
  onSelectCandidate: (candidate: ResourceCandidate) => void;
  onClearCandidate: () => void;
  onQuantityChange: (quantity: number | null) => void;
}) {
  const quantity = override.editedQuantity === "" ? null : Number(override.editedQuantity);

  return (
    <div className="flex w-12 justify-self-center flex-col items-center gap-0.5 rounded-md py-1 md:w-14">
      <CandidatePopover
        state={pickerState}
        selectedItemUid={override.itemUid}
        resourceRarities={resourceRarities}
        resourceDescriptions={resourceDescriptions}
        disabled={disabled}
        triggerLabel={`${override.itemName} 후보 변경`}
        triggerClassName="cursor-pointer rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default"
        onHighlightChange={onHighlightChange}
        onSelect={onSelectCandidate}
        onClear={onClearCandidate}
      >
        <ResourceCard itemUid={override.itemUid} rarity={rarity} name={override.itemName} size="lg" />
      </CandidatePopover>
      <span className="sr-only">{override.itemName}</span>
      <div className="flex w-full items-center justify-between gap-1 px-0.5 text-[10px] leading-tight">
        <span className="shrink-0 whitespace-nowrap text-muted-foreground/70">현재</span>
        <span className="min-w-0 truncate font-bold tabular-nums text-foreground">
          {currentQuantity.toLocaleString()}
        </span>
      </div>
      <div className="w-full">
        <NumberInput
          nullable
          minValue={0}
          showDecrease={false}
          showIncrease={false}
          size="sm"
          disabled={disabled}
          value={Number.isFinite(quantity) ? quantity : null}
          inputProps={{ "aria-label": `${override.itemName} 인식 수량` }}
          onChange={onQuantityChange}
        />
      </div>
      {!override.editedQuantity.trim() ? (
        <p
          className="w-max whitespace-nowrap text-center text-[8px] leading-tight tracking-tight text-destructive sm:text-[9px] xl:text-[10px]"
          title="수량 인식 실패"
        >
          수량 인식 실패
        </p>
      ) : null}
    </div>
  );
}

function UnrecognizedResourceTile({
  position,
  pickerState,
  resourceRarities,
  resourceDescriptions,
  hasCandidates,
  hasDuplicateVisualIdentity,
  disabled,
  onHighlightChange,
  onSelectCandidate,
}: {
  position: number;
  pickerState: CandidatePickerState | null;
  resourceRarities: Record<string, number>;
  resourceDescriptions: Record<string, string>;
  hasCandidates: boolean;
  hasDuplicateVisualIdentity: boolean;
  disabled: boolean;
  onHighlightChange: (highlighted: boolean) => void;
  onSelectCandidate: (candidate: ResourceCandidate) => void;
}) {
  const row = Math.floor(position / 5) + 1;
  const column = (position % 5) + 1;
  const cardClassName =
    "flex size-12 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-lg font-medium text-muted-foreground md:size-14";
  const failureLabel = hasDuplicateVisualIdentity ? "중복 감지" : hasCandidates ? "후보 선택" : "인식 실패";

  return (
    <div className="flex w-12 justify-self-center flex-col items-center gap-1 rounded-md py-1 md:w-14">
      {hasCandidates && pickerState ? (
        <CandidatePopover
          state={pickerState}
          resourceRarities={resourceRarities}
          resourceDescriptions={resourceDescriptions}
          disabled={disabled}
          triggerLabel={`${row}행 ${column}열 아이템 후보 선택`}
          triggerClassName={cn(
            cardClassName,
            "cursor-pointer outline-none transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default",
          )}
          onHighlightChange={onHighlightChange}
          onSelect={onSelectCandidate}
        >
          <span aria-hidden="true">?</span>
        </CandidatePopover>
      ) : (
        <div className={cardClassName}>
          <span aria-hidden="true">?</span>
          <span className="sr-only">
            {row}행 {column}열
          </span>
        </div>
      )}
      <span
        className={cn(
          "whitespace-nowrap text-[10px] leading-tight",
          hasDuplicateVisualIdentity
            ? "font-medium text-destructive"
            : hasCandidates
              ? "font-medium text-primary"
              : "text-muted-foreground",
        )}
      >
        {failureLabel}
      </span>
    </div>
  );
}

function toEditableItems(job: JobStatus): EditableItem[] {
  return (job.result?.items ?? []).map((item) => ({
    ...item,
    included: item.status === "recognized" && item.quantity !== null,
    editedQuantity: item.quantity == null ? "" : String(item.quantity),
  }));
}

function candidateOverrideKey(imageFilename: string, observationId: string): string {
  return `${imageFilename}\0${observationId}`;
}

function isChangedQuantity(item: EditableItem, currentQuantity: number): boolean {
  return item.included && isValidChangedQuantity(item.editedQuantity, currentQuantity);
}

function isValidChangedQuantity(editedQuantity: string, currentQuantity: number): boolean {
  if (!editedQuantity.trim()) return false;
  const quantity = Number(editedQuantity);
  return Number.isInteger(quantity) && quantity >= 0 && quantity !== currentQuantity;
}

type ApplyPayloadItem = {
  itemUid: string;
  quantity: number;
  candidateSelection?: { imageFilename: string; observationId: string };
};

function mergeApplyItems(recognized: ApplyPayloadItem[], manuallySelected: ApplyPayloadItem[]): ApplyPayloadItem[] {
  const merged = new Map<string, ApplyPayloadItem>();
  for (const item of [...recognized, ...manuallySelected]) {
    const previous = merged.get(item.itemUid);
    if (!previous) {
      merged.set(item.itemUid, item);
      continue;
    }
    if (previous.quantity !== item.quantity) {
      throw new Error("같은 아이템에 서로 다른 수량이 입력되어 있어요");
    }
  }
  return [...merged.values()];
}
