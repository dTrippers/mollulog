import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { EmptyView, ResourceCard } from "~/components/primitives";
import { getEquipmentResourceTierLabel } from "~/domain/growth-resource";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";
import type { SyncDraft, SyncDraftType } from "~/models/sync-draft";
import DraftReviewView, {
  DraftReviewActions,
  parseConfidence,
  type SyncDraftDisplayMetadata,
  type SyncDraftReviewActionData,
} from "./DraftReviewView";

type SyncDraftReviewProps = {
  draft: SyncDraft;
  metadataByKey: Record<string, SyncDraftDisplayMetadata>;
  currentValues: Record<string, number>;
  actionData?: SyncDraftReviewActionData;
};

export default function SyncDraftReview({ draft, metadataByKey, currentValues, actionData }: SyncDraftReviewProps) {
  const navigation = useNavigation();
  const draftFormId = "sync-draft-review-form";
  const initialValues = useMemo(
    () => Object.fromEntries(draft.entries.map((entry) => [entry.entryKey, String(entry.value)])),
    [draft.entries],
  );
  const [proposedValues, setProposedValues] = useState(initialValues);
  const isPending = draft.status === "pending";
  const rows = draft.entries.flatMap((entry) => {
    const metadata = metadataByKey[entry.entryKey];
    if (!metadata) {
      return [];
    }

    const proposedValue = Number(proposedValues[entry.entryKey] ?? entry.value);
    const currentValue = currentValues[entry.entryKey] ?? 0;
    return [
      {
        entry,
        metadata,
        currentValue,
        proposedValue,
        delta: Number.isFinite(proposedValue) ? proposedValue - currentValue : 0,
        confidence: parseConfidence(entry.meta),
      },
    ];
  });
  const lowConfidenceRows = rows.filter((row) => row.confidence !== null && row.confidence < 0.7);

  useEffect(() => {
    setProposedValues(initialValues);
  }, [initialValues]);

  return (
    <DraftReviewView
      lowConfidenceCount={lowConfidenceRows.length}
      actionData={actionData}
      actions={isPending ? <DraftReviewActions draftFormId={draftFormId} /> : null}
    >
      <Form method="post" id={draftFormId}>
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
                        <p className="truncate font-medium text-foreground">{metadata.label}</p>
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
      </Form>
    </DraftReviewView>
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
    "ml-auto min-h-9 w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
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

function formatDraftValue(type: SyncDraftType, value: number): string {
  if (type === "student_tier" || type === "student_state") {
    return value > 0 ? `${value}성` : "-";
  }

  return value.toLocaleString();
}

function formatDelta(type: SyncDraftType, delta: number): string {
  if (delta === 0) {
    return "-";
  }

  const prefix = delta > 0 ? "+" : "";
  if (type === "student_tier" || type === "student_state") {
    return `${prefix}${delta}성`;
  }

  return `${prefix}${delta.toLocaleString()}`;
}
