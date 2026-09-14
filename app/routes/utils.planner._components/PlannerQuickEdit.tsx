import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFetcher } from "react-router";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import { createGuestRecord, type GuestPyroxeneRecord } from "~/domain/guest-pyroxene-planner";
import { updateGuestPyroxenePlanner } from "~/lib/guest-pyroxene-planner.client";
import dayjs from "~/lib/dayjs";

export type PlannerQuickEditEntry = {
  id: string;
  kind: "buy" | "other";
  date: string;
  description: string;
  quantity: number;
  resources: PickupResources;
};

type PlannerQuickEditProps = {
  date: string;
  timeZone: string;
  entries: readonly PlannerQuickEditEntry[];
  isSignedIn: boolean;
  guestStorageStatus: "ready" | "memory" | "corrupt" | "loading";
};

type SaveResponse = { success: boolean; error?: string; submissionId?: string };
type PlannerQuickEditKind = "buy" | "other" | "package";
type PlannerPackageType = "half" | "full" | "ap";

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export default function PlannerQuickEdit({
  date: selectedDate,
  timeZone,
  entries,
  isSignedIn,
  guestStorageStatus,
}: PlannerQuickEditProps) {
  const fetcher = useFetcher();
  const submissionIdRef = useRef<string | null>(null);
  const [kind, setKind] = useState<PlannerQuickEditKind>("buy");
  const [packageType, setPackageType] = useState<PlannerPackageType>("half");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(selectedDate);
  const [quantity, setQuantity] = useState("6600");
  const [description, setDescription] = useState("");
  const [resources, setResources] = useState<PickupResources>({ pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 });
  const [savingGuest, setSavingGuest] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const response = fetcher.data as SaveResponse | undefined;

  useEffect(() => {
    if (!isSignedIn || fetcher.state !== "idle" || !response || response.submissionId !== submissionIdRef.current) {
      return;
    }
    submissionIdRef.current = null;
    setMessage(response.success ? "저장했어요." : (response.error ?? "저장하지 못했어요."));
    setMessageIsError(!response.success);
    if (response.success) {
      setEditingId(null);
      setKind("buy");
      setPackageType("half");
      setDate(selectedDate);
      setQuantity("6600");
      setDescription("");
      setResources({ pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 });
    }
  }, [fetcher.state, isSignedIn, response, selectedDate]);

  function resetForm() {
    setEditingId(null);
    setKind("buy");
    setPackageType("half");
    setDate(selectedDate);
    setQuantity("6600");
    setDescription("");
    setResources({ pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 });
    setMessage("");
    setMessageIsError(false);
  }

  function editEntry(entry: PlannerQuickEditEntry) {
    setEditingId(entry.id);
    setKind(entry.kind);
    setDate(entry.date);
    setQuantity(String(entry.quantity || 6600));
    setDescription(entry.kind === "other" ? entry.description : "");
    setResources(entry.resources);
    setMessage("");
    setMessageIsError(false);
  }

  function beginNewEntry(nextKind: PlannerQuickEditKind) {
    resetForm();
    setKind(nextKind);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (isSignedIn && fetcher.state !== "idle") return;
    if (!isSignedIn && savingGuest) return;
    if (!isSignedIn && guestStorageStatus !== "ready" && guestStorageStatus !== "memory") {
      setMessage("브라우저의 청휘석 계획을 읽지 못해 저장할 수 없어요.");
      setMessageIsError(true);
      return;
    }

    const numericQuantity = Number(quantity);
    const numericResources: PickupResources = {
      pyroxene: Number(resources.pyroxene),
      oneTimeTicket: Number(resources.oneTimeTicket),
      tenTimeTicket: Number(resources.tenTimeTicket),
    };
    if (kind === "buy" && (!Number.isSafeInteger(numericQuantity) || numericQuantity < 1 || numericQuantity > 10_000_000)) {
      setMessage("구매 수량을 확인해주세요.");
      setMessageIsError(true);
      return;
    }
    if (
      kind === "other" &&
      (!description.trim() || description.trim().length > 200 ||
        Object.values(numericResources).some((value) => !Number.isSafeInteger(value) || value < 0 || value > 10_000_000) ||
        Object.values(numericResources).every((value) => value === 0))
    ) {
      setMessage("이름과 입력할 재화 수량을 확인해주세요.");
      setMessageIsError(true);
      return;
    }

    const dateAtDisplayNoon = dayjs.tz(`${date}T12:00:00`, timeZone);
    if (!dateAtDisplayNoon.isValid()) {
      setMessage("입력한 날짜를 확인해주세요.");
      setMessageIsError(true);
      return;
    }
    const dateInstant = dateAtDisplayNoon.toISOString();
    const submissionId = crypto.randomUUID();
    const formData = new FormData(form);
    formData.set("intent", editingId ? "update" : kind === "package" ? "create-package" : "create");
    formData.set("kind", kind);
    formData.set("dateInstant", dateInstant);
    formData.set("submissionId", submissionId);
    if (editingId) formData.set("uid", editingId);
    if (kind === "package") formData.set("packageType", packageType);

    if (isSignedIn) {
      submissionIdRef.current = submissionId;
      setMessage("");
      fetcher.submit(formData, { method: "post" });
      return;
    }

    setSavingGuest(true);
    setMessage("");
    let changed = false;
    try {
      const newRecord: GuestPyroxeneRecord | null = editingId
        ? null
        : kind === "buy"
          ? (createGuestRecord({
              kind: "buy",
              quantity: numericQuantity,
              date: dateInstant,
              repeatType: "fixed_days",
              monthlyCount: 1,
            }) as GuestPyroxeneRecord)
          : kind === "other"
            ? (createGuestRecord({
                kind: "other",
                resources: numericResources,
                description: description.trim(),
                date: dateInstant,
              }) as GuestPyroxeneRecord)
            : packageType === "ap"
              ? (createGuestRecord({
                  kind: "apPackage",
                  startDate: dateInstant,
                  autoRepurchase: false,
                }) as GuestPyroxeneRecord)
              : (createGuestRecord({
                  kind: "monthlyPackage",
                  startDate: dateInstant,
                  packageType,
                  autoRepurchase: false,
                }) as GuestPyroxeneRecord);
      const snapshot = await updateGuestPyroxenePlanner((current) => {
        if (!editingId && newRecord) {
          changed = true;
          return { ...current, records: [...current.records, newRecord] };
        }
        const records = current.records.map((record) => {
          if (record.recordId !== editingId) return record;
          if (kind === "buy" && record.kind === "buy") {
            changed = true;
            return {
              ...record,
              date: dateInstant,
              quantity: numericQuantity,
              repeatType: "fixed_days" as const,
              monthlyCount: 1,
            };
          }
          if (kind === "other" && record.kind === "other") {
            changed = true;
            return { ...record, date: dateInstant, description: description.trim(), resources: numericResources };
          }
          return record;
        });
        return changed ? { ...current, records } : current;
      });

      if (snapshot.status === "corrupt") {
        setMessage("브라우저의 청휘석 계획을 읽지 못해 저장하지 않았어요.");
        setMessageIsError(true);
        return;
      }
      if (!changed) {
        setMessage("수정할 항목을 찾지 못했어요. 새로고침한 뒤 다시 확인해주세요.");
        setMessageIsError(true);
        return;
      }
      setMessage(
        snapshot.status === "memory"
          ? "현재 화면에는 저장했지만 브라우저 저장소를 사용할 수 없어 나가면 사라질 수 있어요."
          : "저장했어요.",
      );
      setMessageIsError(false);
      resetForm();
    } catch {
      setMessage("청휘석 계획을 저장하지 못했어요. 입력을 보존했으니 다시 시도해주세요.");
      setMessageIsError(true);
    } finally {
      setSavingGuest(false);
    }
  }

  const pending = savingGuest || fetcher.state !== "idle";
  const guestCanSave = isSignedIn || guestStorageStatus === "ready" || guestStorageStatus === "memory";

  return (
    <section aria-labelledby="planner-quick-edit-title" className="space-y-3">
      <div>
        <h3 id="planner-quick-edit-title" className="text-sm font-semibold">청휘석 빠른 입력</h3>
        <p className="mt-1 text-sm text-muted-foreground">구매와 직접 입력을 추가하거나, 반복되지 않는 기존 항목을 수정할 수 있어요.</p>
      </div>

      {entries.length > 0 ? (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
              <p className="min-w-0 truncate text-sm">
                {entry.kind === "buy"
                  ? `청휘석 구매 · ${formatQuantity(entry.quantity)}`
                  : `${entry.description} · ${formatQuantity(entry.resources.pyroxene)} 청휘석`}
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => editEntry(entry)}
              >
                수정
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={kind === "buy" && editingId === null}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => beginNewEntry("buy")}
        >
          청휘석 구매 추가
        </button>
        <button
          type="button"
          aria-pressed={kind === "other" && editingId === null}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => beginNewEntry("other")}
        >
          직접 입력 추가
        </button>
        <button
          type="button"
          aria-pressed={kind === "package" && editingId === null}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => beginNewEntry("package")}
        >
          패키지 시작 추가
        </button>
        {editingId ? (
          <button
            type="button"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={resetForm}
          >
            수정 취소
          </button>
        ) : null}
      </div>

      <form className="space-y-3 rounded-md border border-border p-3" onSubmit={(event) => void handleSubmit(event)}>
        <p className="text-sm font-medium">
          {editingId ? "기존 항목 수정" : kind === "buy" ? "청휘석 구매" : kind === "other" ? "직접 입력" : "패키지 시작"}
        </p>
        {kind === "package" ? (
          <label className="block space-y-1 text-sm">
            <span>패키지 종류</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              name="packageType"
              value={packageType}
              required
              onChange={(event) => setPackageType(event.currentTarget.value as PlannerPackageType)}
            >
              <option value="half">하프 패키지</option>
              <option value="full">청휘석 패키지</option>
              <option value="ap">AP 패키지</option>
            </select>
            <span className="block text-xs text-muted-foreground">시작 날짜를 저장해요. 갱신과 반복 설정은 상세 플래너에서 조정할 수 있어요.</span>
          </label>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>{kind === "package" ? "시작 날짜" : "날짜"}</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="date"
              name="date"
              value={date}
              required
              onChange={(event) => setDate(event.currentTarget.value)}
            />
          </label>
          {kind === "buy" ? (
            <label className="block space-y-1 text-sm">
              <span>청휘석 수량</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                name="quantity"
                min={1}
                max={10_000_000}
                step={1}
                value={quantity}
                required
                onChange={(event) => setQuantity(event.currentTarget.value)}
              />
            </label>
          ) : kind === "other" ? (
            <label className="block space-y-1 text-sm">
              <span>항목 이름</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="text"
                name="description"
                maxLength={200}
                value={description}
                required
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </label>
          ) : (
            <div className="hidden sm:block" aria-hidden="true" />
          )}
        </div>
        {kind === "other" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["pyroxene", "청휘석"],
              ["oneTimeTicket", "1회 모집 티켓"],
              ["tenTimeTicket", "10회 모집 티켓"],
            ] as const).map(([resource, label]) => (
              <label key={resource} className="block space-y-1 text-sm">
                <span>{label}</span>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  type="number"
                  name={resource}
                  min={0}
                  max={10_000_000}
                  step={1}
                  value={resources[resource]}
                  required
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    setResources((current) => ({ ...current, [resource]: value }));
                  }}
                />
              </label>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !guestCanSave}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "저장 중…" : editingId ? "수정 저장" : "계획 추가"}
          </button>
          {message ? (
            <p className={`text-sm ${messageIsError ? "text-destructive" : "text-muted-foreground"}`} role={messageIsError ? "alert" : "status"}>
              {message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
