import { ArchiveBoxIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useEffect, useMemo, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { Button, EmptyView, ResourceCard, Title } from "~/components/primitives";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";
import { getEquipmentResourceTierLabel } from "~/models/growth-resource";
import type { SyncDraft, SyncDraftType } from "~/models/sync-draft";
import type { ItemCatalogResource } from "~/repositories/item-catalog";

export type SyncDraftDisplayMetadata = {
  label: string;
  item?: ItemCatalogResource;
  studentUid?: string;
};

export type SyncDraftReviewActionData = {
  intent?: "save" | "apply" | "discard";
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

type SyncDraftReviewProps = {
  draft: SyncDraft;
  metadataByKey: Record<string, SyncDraftDisplayMetadata>;
  currentValues: Record<string, number>;
  actionData?: SyncDraftReviewActionData;
};

export default function SyncDraftReview({ draft, metadataByKey, currentValues, actionData }: SyncDraftReviewProps) {
  const navigation = useNavigation();
  const initialValues = useMemo(
    () => Object.fromEntries(draft.entries.map((entry) => [entry.entryKey, String(entry.value)])),
    [draft.entries],
  );
  const [proposedValues, setProposedValues] = useState(initialValues);
  const isPending = draft.status === "pending";
  const submittingIntent = navigation.formData?.get("intent");
  const isSaving = navigation.state === "submitting" && submittingIntent === "save";
  const isApplying = navigation.state === "submitting" && submittingIntent === "apply";
  const isDiscarding = navigation.state === "submitting" && submittingIntent === "discard";
  const rows = draft.entries.map((entry) => {
    const proposedValue = Number(proposedValues[entry.entryKey] ?? entry.value);
    const currentValue = currentValues[entry.entryKey] ?? 0;
    return {
      entry,
      metadata: metadataByKey[entry.entryKey],
      currentValue,
      proposedValue,
      delta: Number.isFinite(proposedValue) ? proposedValue - currentValue : 0,
      confidence: parseConfidence(entry.meta),
    };
  });
  const changedRows = rows.filter((row) => row.delta !== 0);
  const lowConfidenceRows = rows.filter((row) => row.confidence !== null && row.confidence < 0.7);

  useEffect(() => {
    setProposedValues(initialValues);
  }, [initialValues]);

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <Title
          text="연동 변경안 확인"
          description="현재 저장된 값과 도구가 제출한 값을 비교하고, 필요한 값을 수정한 뒤 반영합니다."
          className="my-0"
        />
        <Link to="/connect/drafts" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-300">
          변경안 목록으로 돌아가기
        </Link>
      </div>

      <section className="grid gap-2 md:grid-cols-4">
        <SummaryCell label="변경안 종류" value={syncDraftTypeLabel(draft.type)} />
        <SummaryCell label="변경안 상태" value={draftStatusLabel(draft.status)} />
        <SummaryCell label="검토할 항목" value={`${draft.entries.length.toLocaleString()}개`} />
        <SummaryCell label="실제 변경" value={`${changedRows.length.toLocaleString()}개`} />
      </section>

      {lowConfidenceRows.length > 0 ? (
        <div className="flex gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            인식 신뢰도가 낮은 항목이 {lowConfidenceRows.length.toLocaleString()}개 있어요. 반영 전에 값을 확인해주세요.
          </p>
        </div>
      ) : null}

      {actionData?.error ? (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.success ? (
        <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {actionData.success}
        </p>
      ) : null}

      <Form method="post" className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-6 border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span className="col-span-3">항목</span>
            <span className="text-right">현재값</span>
            <span className="text-right">반영할 값</span>
            <span className="text-right">변화</span>
          </div>
          {rows.length === 0 ? (
            <div className="p-8">
              <EmptyView Icon={ArchiveBoxIcon} text="검토할 항목이 없어요" />
            </div>
          ) : (
            <div className="overflow-auto">
              {rows.map(({ entry, metadata, currentValue, proposedValue, delta, confidence }) => {
                const fieldError = actionData?.fieldErrors?.[entry.entryKey];
                return (
                  <div
                    key={entry.uid}
                    className={cn(
                      "grid grid-cols-6 items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0",
                      delta !== 0 && "bg-blue-50/70 dark:bg-blue-950/20",
                      confidence !== null && confidence < 0.7 && "bg-amber-50/70 dark:bg-amber-950/20",
                    )}
                  >
                    <div className="col-span-3 flex min-w-0 items-center gap-2">
                      <DraftEntryIcon type={draft.type} entryKey={entry.entryKey} metadata={metadata} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{metadata?.label ?? "알 수 없는 항목"}</p>
                        {confidence !== null && confidence < 0.7 ? (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            인식 신뢰도 {Math.round(confidence * 100)}%
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {formatDraftValue(draft.type, currentValue)}
                    </span>
                    <div className="min-w-0 text-right">
                      <DraftValueEditor
                        type={draft.type}
                        name={`value:${entry.entryKey}`}
                        value={proposedValues[entry.entryKey] ?? String(entry.value)}
                        disabled={!isPending || navigation.state === "submitting"}
                        error={fieldError}
                        onChange={(value) =>
                          setProposedValues((values) => ({
                            ...values,
                            [entry.entryKey]: value,
                          }))
                        }
                      />
                    </div>
                    <span
                      className={cn(
                        "text-right text-xs font-semibold tabular-nums",
                        delta > 0 && "text-blue-600 dark:text-blue-300",
                        delta < 0 && "text-red-600 dark:text-red-300",
                        delta === 0 && "text-muted-foreground",
                      )}
                    >
                      {formatDelta(draft.type, delta)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isPending ? (
          <div className="flex flex-col gap-2 md:flex-row md:justify-end">
            <Button
              type="submit"
              name="intent"
              value="save"
              size="sm"
              variant="tint-blue"
              disabled={navigation.state === "submitting"}
            >
              {isSaving ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
              {isSaving ? "저장 중..." : "수정값 저장"}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="apply"
              size="sm"
              variant="primary"
              disabled={navigation.state === "submitting"}
            >
              {isApplying ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
              {isApplying ? "반영 중..." : "프로필에 반영"}
            </Button>
          </div>
        ) : null}
      </Form>

      {isPending ? (
        <div className="flex justify-end">
          <Form method="post">
            <Button
              type="submit"
              name="intent"
              value="discard"
              size="sm"
              variant="tint-red"
              disabled={navigation.state === "submitting"}
            >
              {isDiscarding ? "폐기 중..." : "변경안 폐기"}
            </Button>
          </Form>
        </div>
      ) : null}
    </div>
  );
}

function DraftEntryIcon({
  type,
  entryKey,
  metadata,
}: {
  type: SyncDraftType;
  entryKey: string;
  metadata?: SyncDraftDisplayMetadata;
}) {
  if (type === "student_tier") {
    return (
      <img
        src={studentImageUrl(metadata?.studentUid ?? entryKey)}
        alt="학생 이미지"
        className="size-10 shrink-0 rounded-md bg-muted object-cover"
        loading="lazy"
      />
    );
  }

  const resource = metadata?.item;
  if (!resource) {
    return <div className="size-10 shrink-0 rounded-md border border-border bg-muted" />;
  }

  return (
    <ResourceCard
      itemUid={resource.uid}
      resourceType={resource.type}
      rarity={resource.rarity}
      name={resource.name}
      label={getEquipmentResourceTierLabel(resource.uid) ?? undefined}
      size="md"
    />
  );
}

function DraftValueEditor({
  type,
  name,
  value,
  disabled,
  error,
  onChange,
}: {
  type: SyncDraftType;
  name: string;
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputClassName = cn(
    "ml-auto min-h-9 w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
    error && "border-destructive focus:border-destructive focus:ring-destructive/20",
  );

  return (
    <div className="flex flex-col items-end gap-1">
      {type === "student_tier" ? (
        <select
          name={name}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className={inputClassName}
          onChange={(event) => onChange(event.target.value)}
        >
          {Array.from({ length: 9 }, (_, index) => index + 1).map((tier) => (
            <option key={tier} value={tier}>
              {tier}성
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          name={name}
          min={0}
          step={1}
          inputMode="numeric"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className={cn(
            inputClassName,
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          )}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? <p className="max-w-40 text-right text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function syncDraftTypeLabel(type: SyncDraftType): string {
  switch (type) {
    case "student_tier":
      return "학생 보유 등급";
    default:
      return "아이템 보유 수량";
  }
}

function draftStatusLabel(status: SyncDraft["status"]): string {
  switch (status) {
    case "applied":
      return "반영됨";
    case "discarded":
      return "폐기됨";
    case "expired":
      return "만료됨";
    default:
      return "대기 중";
  }
}

function formatDraftValue(type: SyncDraftType, value: number): string {
  if (type === "student_tier") {
    return value > 0 ? `${value}성` : "-";
  }

  return value.toLocaleString();
}

function formatDelta(type: SyncDraftType, delta: number): string {
  if (delta === 0) {
    return "-";
  }

  const prefix = delta > 0 ? "+" : "";
  if (type === "student_tier") {
    return `${prefix}${delta}성`;
  }

  return `${prefix}${delta.toLocaleString()}`;
}

function parseConfidence(meta: string | null): number | null {
  if (!meta) {
    return null;
  }

  try {
    const parsed = JSON.parse(meta) as { confidence?: unknown };
    return typeof parsed.confidence === "number" ? parsed.confidence : null;
  } catch {
    return null;
  }
}
