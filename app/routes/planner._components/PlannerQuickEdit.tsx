import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/primitives";
import { createGuestRecord, type GuestPyroxeneRecord } from "~/domain/guest-pyroxene-planner";
import { DEFAULT_BUY_PYROXENE_QUANTITY } from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { updateGuestPyroxenePlanner } from "~/lib/guest-pyroxene-planner.client";

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
  initialKind?: PlannerQuickEditKind;
  initialEntry?: PlannerQuickEditEntry;
  onSaved?: () => void;
  onCancel?: () => void;
};

type SaveResponse = { success: boolean; error?: string; submissionId?: string };
export type PlannerQuickEditKind = "buy" | "other" | "package";
type PlannerPackageType = "half" | "full" | "ap";

export default function PlannerQuickEdit({
  date: selectedDate,
  timeZone,
  isSignedIn,
  guestStorageStatus,
  initialKind,
  initialEntry,
  onSaved,
  onCancel,
}: PlannerQuickEditProps) {
  const initialEntryId = initialEntry?.id ?? null;
  const initialEntryKind = initialEntry?.kind ?? null;
  const initialEntryDate = initialEntry?.date ?? null;
  const initialEntryDescription = initialEntry?.description ?? null;
  const initialEntryQuantity = initialEntry?.quantity ?? null;
  const initialEntryPyroxene = initialEntry?.resources.pyroxene ?? null;
  const initialEntryOneTimeTicket = initialEntry?.resources.oneTimeTicket ?? null;
  const initialEntryTenTimeTicket = initialEntry?.resources.tenTimeTicket ?? null;
  const initialEntrySnapshot = useMemo(() => {
    if (
      initialEntryId === null ||
      initialEntryKind === null ||
      initialEntryDate === null ||
      initialEntryDescription === null ||
      initialEntryQuantity === null ||
      initialEntryPyroxene === null ||
      initialEntryOneTimeTicket === null ||
      initialEntryTenTimeTicket === null
    ) {
      return null;
    }

    return {
      id: initialEntryId,
      kind: initialEntryKind,
      date: initialEntryDate,
      description: initialEntryDescription,
      quantity: initialEntryQuantity,
      resources: {
        pyroxene: initialEntryPyroxene,
        oneTimeTicket: initialEntryOneTimeTicket,
        tenTimeTicket: initialEntryTenTimeTicket,
      },
    };
  }, [
    initialEntryId,
    initialEntryKind,
    initialEntryDate,
    initialEntryDescription,
    initialEntryQuantity,
    initialEntryPyroxene,
    initialEntryOneTimeTicket,
    initialEntryTenTimeTicket,
  ]);
  const fetcher = useFetcher();
  const submissionIdRef = useRef<string | null>(null);
  const [kind, setKind] = useState<PlannerQuickEditKind>(() => initialEntrySnapshot?.kind ?? initialKind ?? "buy");
  const [packageType, setPackageType] = useState<PlannerPackageType>("half");
  const [editingId, setEditingId] = useState<string | null>(() => initialEntrySnapshot?.id ?? null);
  const [date, setDate] = useState(() => initialEntrySnapshot?.date ?? selectedDate);
  const [quantity, setQuantity] = useState(() =>
    String(initialEntrySnapshot?.quantity ?? DEFAULT_BUY_PYROXENE_QUANTITY),
  );
  const [description, setDescription] = useState(() => initialEntrySnapshot?.description ?? "");
  const [resources, setResources] = useState<PickupResources>(
    () => initialEntrySnapshot?.resources ?? { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
  );
  const [savingGuest, setSavingGuest] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const response = fetcher.data as SaveResponse | undefined;

  const resetForm = useCallback(
    (nextKind: PlannerQuickEditKind = kind) => {
      setEditingId(null);
      setKind(nextKind);
      setPackageType("half");
      setDate(selectedDate);
      setQuantity(String(DEFAULT_BUY_PYROXENE_QUANTITY));
      setDescription("");
      setResources({ pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 });
      setMessage("");
      setMessageIsError(false);
    },
    [kind, selectedDate],
  );

  useEffect(() => {
    const nextKind = initialEntrySnapshot?.kind ?? initialKind ?? "buy";
    setEditingId(initialEntrySnapshot?.id ?? null);
    setKind(nextKind);
    setPackageType("half");
    setDate(initialEntrySnapshot?.date ?? selectedDate);
    setQuantity(String(initialEntrySnapshot?.quantity ?? DEFAULT_BUY_PYROXENE_QUANTITY));
    setDescription(initialEntrySnapshot?.kind === "other" ? initialEntrySnapshot.description : "");
    setResources(initialEntrySnapshot?.resources ?? { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 });
    setMessage("");
    setMessageIsError(false);
  }, [initialEntrySnapshot, initialKind, selectedDate]);

  useEffect(() => {
    if (!isSignedIn || fetcher.state !== "idle" || !response || response.submissionId !== submissionIdRef.current) {
      return;
    }
    submissionIdRef.current = null;
    setMessage(response.success ? "저장했어요." : (response.error ?? "저장하지 못했어요."));
    setMessageIsError(!response.success);
    if (response.success) {
      resetForm(kind);
      setMessage("저장했어요.");
      onSaved?.();
    }
  }, [fetcher.state, isSignedIn, kind, onSaved, resetForm, response]);

  function handleCancel() {
    if (fetcher.state !== "idle" || savingGuest) return;
    if (onCancel) {
      onCancel();
      return;
    }
    resetForm(initialEntrySnapshot?.kind ?? initialKind ?? "buy");
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
    if (
      kind === "buy" &&
      (!Number.isSafeInteger(numericQuantity) || numericQuantity < 1 || numericQuantity > 10_000_000)
    ) {
      setMessage("구매 수량을 확인해주세요.");
      setMessageIsError(true);
      return;
    }
    if (
      kind === "other" &&
      (!description.trim() ||
        description.trim().length > 200 ||
        Object.values(numericResources).some(
          (value) => !Number.isSafeInteger(value) || value < 0 || value > 10_000_000,
        ) ||
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
      if (snapshot.status === "memory") {
        if (newRecord) setEditingId(newRecord.recordId);
        setMessage("현재 입력은 이 화면에서만 유지돼요. 브라우저 저장소에 기록되지 않아 나가면 사라질 수 있어요.");
        setMessageIsError(false);
        return;
      }
      setMessage("저장했어요.");
      setMessageIsError(false);
      resetForm(kind);
      setMessage("저장했어요.");
      onSaved?.();
    } catch {
      setMessage("청휘석 계획을 저장하지 못했어요. 입력을 보존했으니 다시 시도해주세요.");
      setMessageIsError(true);
    } finally {
      setSavingGuest(false);
    }
  }

  const pending = savingGuest || fetcher.state !== "idle";
  const guestCanSave = isSignedIn || guestStorageStatus === "ready" || guestStorageStatus === "memory";
  const formTitle = editingId
    ? kind === "buy"
      ? "청휘석 구매 수정"
      : "직접 입력 수정"
    : kind === "buy"
      ? "청휘석 구매"
      : kind === "other"
        ? "직접 재화 입력"
        : "패키지 시작";

  return (
    <section aria-labelledby="planner-quick-edit-title" className="space-y-4">
      <div>
        <h3 id="planner-quick-edit-title" className="text-base font-semibold">
          {formTitle}
        </h3>
      </div>

      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        {kind === "package" ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">패키지 상품</legend>
            <input type="hidden" name="packageType" value={packageType} />
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["half", "하프 패키지"],
                  ["full", "청휘석 패키지"],
                  ["ap", "AP 패키지"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  text={label}
                  variant={packageType === value ? "primary" : "secondary"}
                  size="sm"
                  fullWidth
                  pressed={packageType === value}
                  disabled={pending}
                  onClick={() => setPackageType(value)}
                  className="min-h-11 whitespace-normal"
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">반복 갱신은 상세 플래너에서 설정할 수 있어요.</p>
          </fieldset>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>{kind === "package" ? "시작일" : "날짜"}</span>
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
            {(
              [
                ["pyroxene", "청휘석"],
                ["oneTimeTicket", "1회 모집 티켓"],
                ["tenTimeTicket", "10회 모집 티켓"],
              ] as const
            ).map(([resource, label]) => (
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
        {!isSignedIn && !guestCanSave ? (
          <p className="text-sm text-destructive" role="alert">
            {guestStorageStatus === "loading"
              ? "브라우저 계획을 불러오는 중이에요."
              : "브라우저의 청휘석 계획을 읽지 못해 저장할 수 없어요."}
          </p>
        ) : null}
        {message ? (
          <p
            className={`text-sm ${messageIsError ? "text-destructive" : "text-muted-foreground"}`}
            role={messageIsError ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
        <div className="sticky bottom-0 z-layer-navigation flex flex-col-reverse gap-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            text="취소"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={handleCancel}
            fullWidth
            className="sm:w-fit"
          />
          <Button
            type="submit"
            text={pending ? "저장 중…" : editingId ? "수정 저장" : "저장"}
            variant="primary"
            size="sm"
            disabled={pending || !guestCanSave}
            fullWidth
            className="sm:w-fit"
          />
        </div>
      </form>
    </section>
  );
}
