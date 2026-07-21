import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  CheckCircleIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout, HorizontalScroll, NumberInput, ResourceCard, SubTitle } from "~/components/primitives";
import {
  OCR_ALLOWED_CONTENT_TYPES,
  OCR_CANDIDATE_SELECTION_LIMIT,
  OCR_MAX_IMAGE_BYTES,
  OCR_MAX_IMAGES,
  OCR_MAX_JOB_BYTES,
} from "~/domain/ocr";
import { cn } from "~/lib/utils";
import { buildImageReviewSlots, type ReviewLayoutComponent } from "./resource-review-layout";

type JobStatus = {
  uid: string;
  status: string;
  progress: { completed: number; failed: number; total: number };
  images: Array<{ uid: string; filename: string; status: string }>;
  result: { items?: BatchItem[]; components?: ReviewLayoutComponent[]; images?: BatchImageResult[] } | null;
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

type JobSummary = Pick<
  JobStatus,
  "uid" | "status" | "progress" | "application" | "createdAt" | "updatedAt" | "expiresAt"
>;

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

export default function ResourceScanner() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"idle" | "uploading" | "waiting" | "review" | "applying" | "applied">("idle");
  const [job, setJob] = useState<JobStatus | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [highlightedSources, setHighlightedSources] = useState<string[]>([]);
  const [highlightedReviewPosition, setHighlightedReviewPosition] = useState<number | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [candidateOverrides, setCandidateOverrides] = useState<Record<string, CandidateOverride>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const dragDepthRef = useRef(0);

  const showJob = useCallback((next: JobStatus) => {
    setJob(next);
    setSelectedSource(next.images[0]?.filename ?? null);
    setHighlightedSources([]);
    setHighlightedReviewPosition(null);
    setIsImageExpanded(false);
    setCandidateOverrides({});
    if (next.status === "review_ready") {
      setItems(toEditableItems(next));
      setPhase(next.application?.status === "applied" ? "applied" : "review");
      setError(null);
    } else if (["queued", "processing", "finalizing"].includes(next.status)) {
      setItems([]);
      setPhase("waiting");
      setError(null);
    } else {
      setItems([]);
      setPhase("idle");
    }
  }, []);

  useEffect(() => {
    requestJson<{ jobs: JobSummary[] }>("/api/ocr/jobs")
      .then(({ jobs }) => setRecentJobs(jobs))
      .catch((loadError) => setError(toErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    const jobUid = new URLSearchParams(window.location.search).get("job");
    if (!jobUid) {
      setJob(null);
      setItems([]);
      setSelectedSource(null);
      setHighlightedSources([]);
      setHighlightedReviewPosition(null);
      setCandidateOverrides({});
      setPhase("idle");
      return;
    }
    requestJson<JobStatus>(`/api/ocr/jobs/${jobUid}`)
      .then((savedJob) => {
        showJob(savedJob);
      })
      .catch((loadError) => {
        window.history.replaceState(null, "", window.location.pathname);
        setError(toErrorMessage(loadError));
      });
  }, [showJob]);

  useEffect(() => {
    if (!job || !["queued", "processing", "finalizing"].includes(job.status)) return;
    const delay = job.progress.completed === 0 ? 2000 : 3500;
    const timer = window.setTimeout(async () => {
      try {
        const next = await requestJson<JobStatus>(`/api/ocr/jobs/${job.uid}`);
        showJob(next);
        setRecentJobs((current) => upsertJobSummary(current, next));
        if (["failed", "cancelled", "expired"].includes(next.status)) {
          setError("인식 작업을 완료하지 못했어요. 실패한 이미지를 확인하고 다시 시도해 주세요.");
        }
      } catch (pollError) {
        setError(toErrorMessage(pollError));
        setJob((current) => (current ? { ...current } : current));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [job, showJob]);

  const unknownCount = useMemo(
    () =>
      job?.result?.components?.reduce(
        (count, component) =>
          count + (component.positions ?? []).filter((position) => position.status !== "recognized").length,
        0,
      ) ?? 0,
    [job],
  );

  const reviewSlots = useMemo(
    () => buildImageReviewSlots(job?.result?.components, items, selectedSource),
    [items, job, selectedSource],
  );

  const recognizedSlotCount = useMemo(
    () => reviewSlots.filter((slot) => slot.itemIndex !== null).length,
    [reviewSlots],
  );

  const selectedImage = useMemo(
    () => job?.images.find((image) => image.filename === selectedSource) ?? job?.images[0] ?? null,
    [job, selectedSource],
  );

  const selectedResultImage = useMemo(
    () => job?.result?.images?.find((image) => image.filename === selectedSource) ?? null,
    [job, selectedSource],
  );

  const highlightedObservation =
    highlightedReviewPosition === null
      ? null
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

  const hasChanges = useMemo(
    () =>
      items.some((item) => isChangedQuantity(item, job?.currentQuantities[item.resource_uid] ?? 0)) ||
      Object.values(candidateOverrides).some((override) =>
        isValidChangedQuantity(override.editedQuantity, job?.currentQuantities[override.itemUid] ?? 0),
      ),
    [items, candidateOverrides, job],
  );

  const isUploadLocked = phase === "uploading" || phase === "applying";

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

  async function selectJob(jobUid: string) {
    setError(null);
    setSuccess(null);
    try {
      const selectedJob = await requestJson<JobStatus>(`/api/ocr/jobs/${jobUid}`);
      window.history.replaceState(null, "", `${window.location.pathname}?job=${encodeURIComponent(jobUid)}`);
      showJob(selectedJob);
    } catch (selectError) {
      setError(toErrorMessage(selectError));
    }
  }

  function clearSelectedJob() {
    window.history.replaceState(null, "", window.location.pathname);
    setJob(null);
    setItems([]);
    setSelectedSource(null);
    setHighlightedSources([]);
    setHighlightedReviewPosition(null);
    setIsImageExpanded(false);
    setCandidateOverrides({});
    setError(null);
    setSuccess(null);
    setPhase("idle");
  }

  function addFiles(candidates: File[]) {
    if (isUploadLocked || candidates.length === 0) return;

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
    if (nextFiles.reduce((total, file) => total + file.size, 0) > OCR_MAX_JOB_BYTES) {
      setError("첨부한 스크린샷의 전체 용량은 120MB를 넘을 수 없어요.");
      return;
    }

    if (job) clearSelectedJob();
    setFiles(nextFiles);
    setError(null);
    setSuccess(null);
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (isUploadLocked || !event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function startRecognition() {
    if (files.length === 0) return;
    setError(null);
    setSuccess(null);
    setPhase("uploading");
    try {
      const descriptors = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
          sha256: await sha256Hex(file),
        })),
      );
      const created = await requestJson<{
        jobUid: string;
        images: Array<{ imageUid: string; filename: string; uploadUrl: string }>;
      }>("/api/ocr/jobs", { method: "POST", body: JSON.stringify({ images: descriptors }) });
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
      const submitted = await requestJson<JobStatus>(`/api/ocr/jobs/${created.jobUid}/submit`, { method: "POST" });
      window.history.replaceState(null, "", `${window.location.pathname}?job=${encodeURIComponent(created.jobUid)}`);
      setJob({
        ...submitted,
        currentQuantities: {},
        resourceRarities: {},
        resourceDescriptions: {},
        application: null,
      });
      setFiles([]);
      setRecentJobs((current) => upsertJobSummary(current, { ...submitted, application: null }));
      setPhase("waiting");
    } catch (startError) {
      setError(toErrorMessage(startError));
      setPhase("idle");
    }
  }

  async function applyResult() {
    if (!job) return;
    setError(null);
    setSuccess(null);
    setPhase("applying");
    try {
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
      const applied = await requestJson<{ application: NonNullable<JobApplication> }>(
        `/api/ocr/jobs/${job.uid}/apply`,
        {
          method: "POST",
          body: JSON.stringify({ items: selected }),
        },
      );
      setRecentJobs((current) =>
        current.map((recentJob) =>
          recentJob.uid === job.uid ? { ...recentJob, application: applied.application } : recentJob,
        ),
      );
      window.history.replaceState(null, "", window.location.pathname);
      setJob(null);
      setItems([]);
      setSelectedSource(null);
      setHighlightedSources([]);
      setHighlightedReviewPosition(null);
      setIsImageExpanded(false);
      setCandidateOverrides({});
      setPhase("idle");
      setSuccess("아이템 수량을 반영했어요.");
    } catch (applyError) {
      setError(toErrorMessage(applyError));
      setPhase("review");
    }
  }

  return (
    <div className="space-y-8 pb-12 pt-6 lg:pt-2">
      <section>
        <SubTitle text="스크린샷 업로드" description="게임 내 [메뉴] > [아이템] 페이지의 스크린샷을 첨부해주세요" />
        <div className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <div className="focus-within:rounded-lg focus-within:ring-2 focus-within:ring-ring/30">
            <input
              id="resource-scanner-files"
              type="file"
              accept={OCR_ALLOWED_CONTENT_TYPES.join(",")}
              multiple
              disabled={isUploadLocked}
              aria-describedby="resource-scanner-file-help"
              className="sr-only"
              onChange={(event) => {
                addFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <label
              htmlFor="resource-scanner-files"
              onDragEnter={handleDragEnter}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-8 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40",
                isUploadLocked && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <PhotoIcon className="size-6" aria-hidden="true" />
              </span>
              <span className="mt-3 font-medium text-foreground">
                {files.length > 0 ? "스크린샷 더 추가하기" : "스크린샷을 선택하거나 이곳에 끌어다 놓으세요"}
              </span>
              <span id="resource-scanner-file-help" className="mt-1 text-sm text-muted-foreground">
                PNG, JPEG, WebP · 장당 10MB · 전체 120MB · 최대 30장
              </span>
            </label>
          </div>

          {files.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="sr-only">선택한 스크린샷</legend>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-medium text-foreground">선택한 스크린샷</p>
                <p className="text-muted-foreground" aria-live="polite">
                  {files.length}장 · {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
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
          <Button variant="primary" disabled={files.length === 0 || isUploadLocked} onClick={startRecognition}>
            {phase === "uploading" ? "업로드 중..." : "인식 시작"}
          </Button>
        </div>
      </section>

      {recentJobs.length > 0 ? (
        <section>
          <SubTitle text="진행 상황 확인" description="인식 결과는 최대 7일동안 확인할 수 있어요" />
          <div className="space-y-4 rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recentJobs.map((recentJob) => (
                <button
                  key={recentJob.uid}
                  type="button"
                  onClick={() => selectJob(recentJob.uid)}
                  aria-current={job?.uid === recentJob.uid ? "true" : undefined}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30",
                    job?.uid === recentJob.uid ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {formatJobDate(recentJob.createdAt)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {recentJob.progress.total}장 · {formatJobStatus(recentJob)}
                    </span>
                  </span>
                  <span className={cn("size-2 shrink-0 rounded-full", jobStatusDotClass(recentJob))} />
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {success ? <Callout tone="success" Icon={CheckCircleIcon} title={success} /> : null}

      {error ? <Callout tone="destructive" title="처리 중 오류가 발생했어요" description={error} /> : null}

      {job && phase === "waiting" ? (
        <Callout
          tone="info"
          Icon={ArrowPathIcon}
          title="스크린샷을 인식하고 있어요"
          description={`${job.progress.total}장 중 ${job.progress.completed + job.progress.failed}장 인식 완료 · 페이지를 닫아도 작업은 계속돼요.`}
        />
      ) : null}

      {phase === "review" || phase === "applying" || phase === "applied" ? (
        <section>
          <SubTitle text="결과 검토" description="인식 결과를 검토 후 반영 여부를 선택해주세요" />
          <div className="space-y-4 rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5">
            {phase === "applied" ? (
              <Callout
                tone="success"
                Icon={CheckCircleIcon}
                title="이미 반영이 완료되었어요"
                description="보유 수량을 갱신하려면 새로운 이미지를 업로드해주세요"
              />
            ) : null}
            {unknownCount > 0 ? (
              <Callout
                tone="warning"
                title={`자동으로 인식하지 못한 항목이 ${unknownCount}개 있어요`}
                description="후보가 있는 항목은 해당 셀에서 직접 아이템을 선택할 수 있어요"
              />
            ) : null}
            {items.length === 0 && reviewSlots.length === 0 ? (
              <Callout
                tone="warning"
                title="인식된 아이템이 없어요"
                description={'스크린샷에 "아이템" 화면이 선명하게 보이는지 확인한 뒤 다시 시도해 주세요.'}
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
                      <p className="text-sm font-medium text-foreground">인식한 스크린샷</p>
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
                      src={`/api/ocr/jobs/${encodeURIComponent(job.uid)}/images/${encodeURIComponent(selectedImage.uid)}`}
                      alt={`${selectedImage.filename} 원본`}
                      imageWidth={selectedResultImage?.width}
                      imageHeight={selectedResultImage?.height}
                      highlightedBox={highlightedObservation?.bbox}
                    />
                    <span className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ArrowsPointingOutIcon className="size-5" aria-hidden="true" />
                    </span>
                  </button>
                  <HorizontalScroll
                    itemWidth={{ mobile: "w-24", desktop: "w-24" }}
                    gap="gap-2"
                    showArrowsOnMobile
                    fadeEdges
                    className="pb-1"
                    previousButtonLabel="이전 스크린샷 보기"
                    nextButtonLabel="다음 스크린샷 보기"
                  >
                    {job.images.map((image, index) => (
                      <SourceImagePreview
                        key={image.uid}
                        jobUid={job.uid}
                        image={image}
                        number={index + 1}
                        selected={selectedImage.uid === image.uid}
                        highlighted={highlightedSources.includes(image.filename)}
                        selectionRequiredCount={selectionRequiredCountByFilename[image.filename] ?? 0}
                        onSelect={() => {
                          setHighlightedSources([]);
                          setHighlightedReviewPosition(null);
                          setSelectedSource(image.filename);
                        }}
                      />
                    ))}
                  </HorizontalScroll>
                </div>
              ) : null}

              <div className="min-w-0 space-y-3">
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
                              disabled={phase === "applying" || phase === "applied"}
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
                            disabled={phase === "applying" || phase === "applied"}
                            onHighlightChange={(highlighted) => setReviewPositionHighlight(slot.position, highlighted)}
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
                          disabled={phase === "applying" || phase === "applied"}
                          applied={phase === "applied"}
                          onHighlightChange={(highlighted) => setReviewPositionHighlight(slot.position, highlighted)}
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
              </div>
            </div>
            {phase !== "applied" ? (
              <div className="flex justify-end">
                <Button variant="primary" disabled={phase === "applying" || !hasChanges} onClick={applyResult}>
                  {phase === "applying" ? "반영 중..." : "수량 반영"}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {job && selectedImage ? (
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
        <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(file.size)}</p>
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
      <img src={src} alt={alt} className="size-full object-contain" />
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

function upsertJobSummary(current: JobSummary[], job: JobSummary): JobSummary[] {
  return [job, ...current.filter((entry) => entry.uid !== job.uid)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function formatJobDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatJobStatus(job: JobSummary): string {
  if (job.application?.status === "applied") return "반영 완료";
  if (job.status === "review_ready") return "인식 완료";
  if (["queued", "processing", "finalizing"].includes(job.status)) {
    return `${job.progress.completed + job.progress.failed}/${job.progress.total}장 처리`;
  }
  if (job.status === "failed") return "인식 실패";
  if (job.status === "cancelled") return "취소됨";
  if (job.status === "expired") return "만료됨";
  return "처리 중";
}

function jobStatusDotClass(job: JobSummary): string {
  if (job.application?.status === "applied" || job.status === "review_ready") return "bg-emerald-500";
  if (["queued", "processing", "finalizing"].includes(job.status)) return "bg-blue-500";
  return "bg-destructive";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "요청을 처리하지 못했어요");
  return body;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했어요";
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
