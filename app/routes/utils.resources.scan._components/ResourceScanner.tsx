import { ArrowPathIcon, CheckCircleIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { Button, Callout, Input, SubTitle } from "~/components/primitives";

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
          setError("인식 작업을 완료하지 못했어요. 실패한 이미지를 확인하고 다시 시도해주세요.");
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
    <div className="space-y-8 pb-12">
      <section>
        <SubTitle
          text="인벤토리 스크린샷 제출"
          description="화면 비율이나 정렬을 바꾸지 않고 원본 스크린샷을 여러 장 선택하세요."
        />
        <div className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            label="스크린샷"
            description="PNG, JPEG, WebP · 장당 12MB · 최대 30장"
            disabled={phase !== "idle"}
            onChange={() => undefined}
            onInput={(event) => setFiles(Array.from(event.currentTarget.files ?? []))}
            className="max-w-none"
          />
          {files.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {files.length}장 · {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
            </p>
          ) : null}
          <Button variant="primary" disabled={files.length === 0 || phase !== "idle"} onClick={startRecognition}>
            {phase === "uploading" ? (
              <ArrowPathIcon className="size-4 animate-spin" />
            ) : (
              <PhotoIcon className="size-4" />
            )}
            {phase === "uploading" ? "업로드 중..." : "인식 시작"}
          </Button>
        </div>
      </section>

      {error ? <Callout tone="destructive" title="처리하지 못했어요" description={error} /> : null}

      {job && phase === "waiting" ? (
        <Callout
          tone="info"
          Icon={ArrowPathIcon}
          title="서버에서 인식하고 있어요"
          description={`${job.progress.completed + job.progress.failed}/${job.progress.total}장 처리됨 · 페이지를 닫아도 작업은 계속됩니다.`}
        />
      ) : null}

      {phase === "review" || phase === "drafting" ? (
        <section>
          <SubTitle text="인식 결과 보정" description="반영할 항목과 수량을 확인한 뒤 변경안 검토 단계로 이동합니다." />
          <div className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
            {unknownCount > 0 ? (
              <Callout
                tone="warning"
                title={`${unknownCount}개 위치는 자동 확정하지 않았어요`}
                description="불명확한 위치는 변경안에 포함하지 않습니다."
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
                          ? `수량 충돌: ${item.observed_quantities.join(", ")}`
                          : `${item.source_images.length}개 이미지에서 확인`}
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
