import { ArrowPathIcon, CheckCircleIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout, Input, SubTitle } from "~/components/primitives";
import { OCR_ALLOWED_CONTENT_TYPES, OCR_MAX_IMAGE_BYTES, OCR_MAX_IMAGES, OCR_MAX_JOB_BYTES } from "~/domain/ocr";
import { cn } from "~/lib/utils";

type JobStatus = {
  uid: string;
  status: string;
  progress: { completed: number; failed: number; total: number };
  result: { items?: BatchItem[]; components?: Array<{ positions?: Array<{ status?: string }> }> } | null;
  versions: { model: string; catalog: string; schema: string } | null;
};

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
const LAST_OCR_JOB_KEY = "mollulog::resources::last-ocr-job";

export default function ResourceScanner() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"idle" | "uploading" | "waiting" | "review" | "drafting">("idle");
  const [job, setJob] = useState<JobStatus | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const jobUid = new URLSearchParams(window.location.search).get("job") ?? localStorage.getItem(LAST_OCR_JOB_KEY);
    if (!jobUid) return;
    requestJson<JobStatus>(`/api/ocr/jobs/${jobUid}`)
      .then((savedJob) => {
        setJob(savedJob);
        if (savedJob.status === "review_ready") {
          setItems(toEditableItems(savedJob));
          setPhase("review");
        } else if (["queued", "processing", "finalizing"].includes(savedJob.status)) {
          setPhase("waiting");
        }
      })
      .catch(() => localStorage.removeItem(LAST_OCR_JOB_KEY));
  }, []);

  useEffect(() => {
    if (!job || !["queued", "processing", "finalizing"].includes(job.status)) return;
    const delay = job.progress.completed === 0 ? 2000 : 3500;
    const timer = window.setTimeout(async () => {
      try {
        const next = await requestJson<JobStatus>(`/api/ocr/jobs/${job.uid}`);
        setJob(next);
        if (next.status === "review_ready") {
          setItems(toEditableItems(next));
          setPhase("review");
        } else if (["failed", "cancelled", "expired"].includes(next.status)) {
          setError("인식 작업을 완료하지 못했어요. 실패한 이미지를 확인하고 다시 시도해 주세요.");
          setPhase("idle");
        }
      } catch (pollError) {
        setError(toErrorMessage(pollError));
        setJob((current) => (current ? { ...current } : current));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [job]);

  const unknownCount = useMemo(
    () =>
      job?.result?.components?.reduce(
        (count, component) =>
          count + (component.positions ?? []).filter((position) => position.status !== "recognized").length,
        0,
      ) ?? 0,
    [job],
  );

  function addFiles(candidates: File[]) {
    if (phase !== "idle" || candidates.length === 0) return;

    const nextFiles = [...files];
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

    setFiles(nextFiles);
    setError(null);
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (phase !== "idle" || !event.dataTransfer.types.includes("Files")) return;
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
      localStorage.setItem(LAST_OCR_JOB_KEY, created.jobUid);
      window.history.replaceState(null, "", `${window.location.pathname}?job=${encodeURIComponent(created.jobUid)}`);
      setJob(submitted);
      setPhase("waiting");
    } catch (startError) {
      setError(toErrorMessage(startError));
      setPhase("idle");
    }
  }

  async function createDraft() {
    if (!job) return;
    setError(null);
    setPhase("drafting");
    try {
      const selected = items
        .filter((item) => item.included)
        .map((item) => {
          const quantity = Number(item.editedQuantity);
          if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`${item.resource_name} 수량을 확인해주세요`);
          return {
            itemUid: item.resource_uid,
            quantity,
            meta: {
              reviewReasons: item.status === "conflict" ? ["quantity_conflict"] : [],
              quantityExact: item.quantity_exact,
              observedQuantities: item.observed_quantities,
              sourceImages: item.source_images,
              modelVersion: job.versions?.model,
              catalogVersion: job.versions?.catalog,
            },
          };
        });
      const draft = await requestJson<{ reviewUrl: string }>(`/api/ocr/jobs/${job.uid}/draft`, {
        method: "POST",
        body: JSON.stringify({ items: selected }),
      });
      window.location.assign(draft.reviewUrl);
    } catch (draftError) {
      setError(toErrorMessage(draftError));
      setPhase("review");
    }
  }

  return (
    <div className="space-y-8 pb-12 pt-6 lg:pt-2">
      <section>
        <SubTitle
          text="스크린샷 첨부"
          description={'게임의 "아이템" 화면이 보이는 원본 스크린샷을 첨부해 주세요. 여러 장이 서로 겹쳐도 괜찮아요.'}
        />
        <div className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <div className="focus-within:rounded-lg focus-within:ring-2 focus-within:ring-ring/30">
            <input
              id="resource-scanner-files"
              type="file"
              accept={OCR_ALLOWED_CONTENT_TYPES.join(",")}
              multiple
              disabled={phase !== "idle"}
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
                phase !== "idle" && "cursor-not-allowed opacity-60",
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
                    disabled={phase !== "idle"}
                    onRemove={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}
          <Button variant="primary" disabled={files.length === 0 || phase !== "idle"} onClick={startRecognition}>
            {phase === "uploading" ? "업로드 중..." : "인식 시작"}
          </Button>
        </div>
      </section>

      {error ? <Callout tone="destructive" title="처리하지 못했어요" description={error} /> : null}

      {job && phase === "waiting" ? (
        <Callout
          tone="info"
          Icon={ArrowPathIcon}
          title="스크린샷을 인식하고 있어요"
          description={`${job.progress.total}장 중 ${job.progress.completed + job.progress.failed}장 인식 완료 · 페이지를 닫아도 작업은 계속돼요.`}
        />
      ) : null}

      {phase === "review" || phase === "drafting" ? (
        <section>
          <SubTitle
            text="인식 결과 확인"
            description="인식된 재화와 수량을 확인한 뒤, 실제 반영 전 변경 내역을 한 번 더 검토해요."
          />
          <div className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
            {unknownCount > 0 ? (
              <Callout
                tone="warning"
                title={`재화 또는 수량을 확인하지 못한 항목이 ${unknownCount}개 있어요`}
                description="확실하게 인식하지 못한 항목은 자동으로 반영하지 않아요."
              />
            ) : null}
            {items.length === 0 ? (
              <Callout
                tone="warning"
                title="인식된 재화가 없어요"
                description={'스크린샷에 "아이템" 화면이 선명하게 보이는지 확인한 뒤 다시 시도해 주세요.'}
              />
            ) : null}
            <div className="divide-y divide-border">
              {items.map((item, index) => (
                <div
                  key={item.resource_uid}
                  className="flex flex-col gap-3 py-4 first:pt-0 md:flex-row md:items-center"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((value, itemIndex) =>
                            itemIndex === index ? { ...value, included: event.target.checked } : value,
                          ),
                        )
                      }
                    />
                    <span>
                      <span className="block font-medium text-foreground">{item.resource_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.status === "conflict"
                          ? `스크린샷마다 수량이 달라요: ${item.observed_quantities.join(", ")}`
                          : item.source_images.length > 1
                            ? `${item.source_images.length}장의 스크린샷에서 같은 수량을 확인했어요`
                            : "1장의 스크린샷에서 확인했어요"}
                      </span>
                    </span>
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={item.editedQuantity}
                    disabled={!item.included}
                    aria-label={`${item.resource_name} 수량`}
                    onChange={(value) =>
                      setItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index ? { ...entry, editedQuantity: value } : entry,
                        ),
                      )
                    }
                    containerClassName="md:w-40"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={phase === "drafting" || !items.some((item) => item.included)}
                onClick={createDraft}
              >
                {phase === "drafting" ? (
                  <ArrowPathIcon className="size-4 animate-spin" />
                ) : (
                  <CheckCircleIcon className="size-4" />
                )}
                변경안 검토하기
              </Button>
            </div>
          </div>
        </section>
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
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:pointer-events-none disabled:opacity-50"
      >
        <XMarkIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
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
