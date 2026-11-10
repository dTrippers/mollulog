import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { TierInput } from "~/components/v2/features/students/TierInput";
import { useV2Page } from "~/components/v2/layout/V2Page";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { useNumberInputFlowNavigation } from "~/components/v2/primitives/use-number-input-flow-navigation";
import { getEquipmentResourceTierLabel } from "~/domain/growth-resource";
import { cn } from "~/lib/utils";
import type { SyncDraft, SyncDraftType } from "~/models/sync-draft";
import { ConnectStateMessage } from "../connect._components/ConnectStateMessage";
import { parseConfidence, syncDraftTypeLabel } from "../connect._components/sync-draft-labels";
import {
  DraftApplyBar,
  ReviewLegend,
  ReviewWarningMark,
  reviewChangedClassName,
  SelectionCheckbox,
  type SyncDraftDisplayMetadata,
  type SyncDraftReviewActionData,
  TierFace,
} from "./review-shared";

type SyncDraftReviewProps = {
  draft: SyncDraft;
  metadataByKey: Record<string, SyncDraftDisplayMetadata>;
  currentValues: Record<string, number>;
  actionData?: SyncDraftReviewActionData;
};

type Filter = "all" | "changed" | "review";

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const NO_FAVORITE_LABEL = { visible: false, icon: "unfavorited", countText: null, accessibleName: "" } as const;

/** The review of a student-tier or an item-inventory draft: one value per entry, applied per selected entry. */
export default function SyncDraftReview({ draft, metadataByKey, currentValues, actionData }: SyncDraftReviewProps) {
  const { stacked } = useV2Page();
  const navigation = useNavigation();
  const flow = useNumberInputFlowNavigation();
  const formId = "sync-draft-review-form";
  const isTier = draft.type === "student_tier";
  const subject = isTier ? "학생" : "아이템";
  const initialValues = useMemo(
    () => Object.fromEntries(draft.entries.map((entry) => [entry.entryKey, String(entry.value)])),
    [draft.entries],
  );
  const [proposedValues, setProposedValues] = useState(initialValues);
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("changed");
  const submitting = navigation.state === "submitting";

  useEffect(() => {
    setProposedValues(initialValues);
    setDeselected(new Set());
  }, [initialValues]);

  const rows = draft.entries.flatMap((entry) => {
    const metadata = metadataByKey[entry.entryKey];
    if (!metadata) return [];
    const raw = proposedValues[entry.entryKey] ?? String(entry.value);
    const proposedValue = raw.trim() === "" ? Number.NaN : Number(raw);
    const currentValue = currentValues[entry.entryKey] ?? 0;
    const delta = Number.isFinite(proposedValue) ? proposedValue - currentValue : 0;
    const confidence = parseConfidence(entry.meta);
    const reasons: string[] = [];
    if (confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD) reasons.push("인식 신뢰도가 낮아요.");
    if (delta < 0) reasons.push(isTier ? "성급이 지금 값보다 낮아져요." : "보유 수량이 지금 값보다 낮아져요.");
    return [
      { entry, metadata, raw, proposedValue, currentValue, delta, reasons, valid: Number.isFinite(proposedValue) },
    ];
  });
  type Row = (typeof rows)[number];

  const isChanged = (row: Row) => row.delta !== 0 || !row.valid;
  const counts = {
    all: rows.length,
    changed: rows.filter(isChanged).length,
    review: rows.filter((row) => row.reasons.length > 0).length,
  };
  const visibleRows = rows.filter((row) =>
    filter === "all" ? true : filter === "changed" ? isChanged(row) : row.reasons.length > 0,
  );
  const selectedRows = rows.filter((row) => isChanged(row) && !deselected.has(row.entry.entryKey));
  const unselectedCount = rows.filter((row) => isChanged(row) && deselected.has(row.entry.entryKey)).length;
  const visibleSelectable = visibleRows.filter(isChanged);
  const selectedVisibleCount = visibleSelectable.filter((row) => !deselected.has(row.entry.entryKey)).length;
  const allVisibleSelected = visibleSelectable.length > 0 && selectedVisibleCount === visibleSelectable.length;
  const fieldErrors = actionData?.fieldErrors ?? {};

  const toggleRow = (entryKey: string, selected: boolean) =>
    setDeselected((current) => {
      const next = new Set(current);
      if (selected) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  const toggleVisible = (selected: boolean) =>
    setDeselected((current) => {
      const next = new Set(current);
      for (const row of visibleSelectable) {
        if (selected) next.delete(row.entry.entryKey);
        else next.add(row.entry.entryKey);
      }
      return next;
    });
  const setValue = (entryKey: string, value: string) =>
    setProposedValues((values) => ({ ...values, [entryKey]: value }));

  const headerLabel = isTier ? "학생" : "아이템";
  return (
    <div className={cn("flex flex-col gap-v2-block-gap", stacked && "pb-28")}>
      <SectionTabs
        items={[{ id: draft.type, label: `${syncDraftTypeLabel(draft.type)} ${rows.length.toLocaleString("ko-KR")}` }]}
        selectedId={draft.type}
        onChange={() => {}}
        label="가져온 데이터 종류"
      />
      <fieldset className="m-0 min-w-0 border-0 p-0 flex flex-wrap items-center gap-2" aria-label="검토 필터">
        <ToggleChip pressed={filter === "all"} onPressedChange={() => setFilter("all")}>
          전체 {counts.all.toLocaleString("ko-KR")}
        </ToggleChip>
        <ToggleChip pressed={filter === "changed"} onPressedChange={() => setFilter("changed")}>
          바뀌는 {subject}만 {counts.changed.toLocaleString("ko-KR")}
        </ToggleChip>
        <ToggleChip pressed={filter === "review"} onPressedChange={() => setFilter("review")}>
          확인 필요 {counts.review.toLocaleString("ko-KR")}
        </ToggleChip>
        {stacked ? null : (
          <span className="ml-auto text-xs text-v2-fg-tertiary">화살표 키로 입력칸 사이를 이동할 수 있어요.</span>
        )}
      </fieldset>
      <ReviewLegend showCurrentHint={false} />
      <Form method="post" id={formId} className="flex flex-col gap-v2-block-gap">
        {selectedRows.map((row) => (
          <input key={row.entry.uid} type="hidden" name="selected" value={row.entry.entryKey} />
        ))}
        {/* Every row submits its value, whatever the display filter hides, so a selected row out of view still applies. */}
        {rows.map((row) => (
          <input key={row.entry.uid} type="hidden" name={`value:${row.entry.entryKey}`} value={row.raw} />
        ))}
        {visibleRows.length === 0 ? (
          <div className="rounded-lg bg-v2-surface">
            {rows.length === 0 ? (
              <ConnectStateMessage Icon={ArchiveBoxIcon} title="검토할 항목이 없어요" />
            ) : (
              <ConnectStateMessage
                Icon={ArchiveBoxIcon}
                title="바뀌는 값이 없어요"
                description={`가져온 값이 모두 지금 값과 같아요. 전체를 눌러 모든 ${subject}을 볼 수 있어요.`}
              />
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-v2-surface py-1">
            {stacked ? null : (
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_5rem] items-center gap-3 px-v2-block-p py-2 text-xs font-medium text-v2-fg-tertiary">
                <span className="inline-flex items-center gap-2">
                  <SelectionCheckbox
                    checked={allVisibleSelected}
                    mixed={selectedVisibleCount > 0 && !allVisibleSelected}
                    disabled={visibleSelectable.length === 0}
                    label={`보이는 ${subject} 모두 선택`}
                    onCheckedChange={toggleVisible}
                  />
                  {headerLabel}
                </span>
                <span className="text-right">{isTier ? "지금 값" : "보유 수량"}</span>
                <span className="text-center">반영할 값</span>
                <span className="text-right">변화</span>
              </div>
            )}
            <ul>
              {visibleRows.map((row) => {
                const selectable = isChanged(row);
                const selected = selectable && !deselected.has(row.entry.entryKey);
                const fieldError = fieldErrors[row.entry.entryKey];
                const label = row.metadata.label;
                return (
                  <li
                    key={row.entry.uid}
                    className={cn(
                      "border-t border-v2-divider px-v2-block-p py-2 first:border-t-0",
                      stacked
                        ? "flex flex-col gap-2"
                        : "grid grid-cols-[minmax(0,1fr)_5rem_8rem_5rem] items-center gap-3",
                      selectable && !selected && "opacity-60",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <SelectionCheckbox
                        checked={selected}
                        disabled={!selectable}
                        label={`${label} 반영`}
                        onCheckedChange={(next) => toggleRow(row.entry.entryKey, next)}
                      />
                      <EntryIdentity type={draft.type} entryKey={row.entry.entryKey} metadata={row.metadata} />
                      <ReviewWarningMark reasons={row.reasons} />
                    </div>
                    <div className={cn(stacked ? "flex items-center gap-3 pl-6" : "contents")}>
                      <span className={cn("text-sm tabular-nums text-v2-fg-secondary", stacked ? "" : "text-right")}>
                        {stacked ? <span className="mr-1 text-xs text-v2-fg-tertiary">지금 값</span> : null}
                        {isTier ? <TierFace tier={row.currentValue} /> : row.currentValue.toLocaleString("ko-KR")}
                      </span>
                      <div className={cn("flex flex-col gap-0.5", stacked ? "w-32" : "")}>
                        {isTier ? (
                          <TierInput
                            label={label}
                            value={row.valid ? row.proposedValue : null}
                            initialTier={row.metadata.initialTier ?? 1}
                            min={1}
                            max={9}
                            disabled={submitting}
                            warning={row.delta < 0}
                            compact
                            flowProps={flow.getInputProps({ disabled: submitting })}
                            onChange={(tier) => setValue(row.entry.entryKey, String(tier))}
                            className={row.delta !== 0 ? reviewChangedClassName : undefined}
                          />
                        ) : (
                          <NumberInput
                            {...flow.getInputProps({ disabled: submitting })}
                            compact
                            formatThousands
                            min={0}
                            value={row.raw}
                            disabled={submitting}
                            warning={row.delta < 0}
                            aria-label={`${label} 반영할 값`}
                            aria-invalid={fieldError ? true : undefined}
                            className={cn(row.delta !== 0 && reviewChangedClassName, fieldError && "border-v2-danger")}
                            onChange={(event) => setValue(row.entry.entryKey, event.currentTarget.value)}
                          />
                        )}
                        {fieldError ? <span className="text-xs text-v2-danger">{fieldError}</span> : null}
                      </div>
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          stacked ? "" : "text-right",
                          row.delta < 0 ? "text-v2-danger" : row.delta > 0 ? "text-v2-fg" : "text-v2-fg-tertiary",
                        )}
                      >
                        {formatDelta(draft.type, row.delta)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Form>
      <DraftApplyBar
        applyFormId={formId}
        summary={
          isTier
            ? `학생 ${selectedRows.length.toLocaleString("ko-KR")}명`
            : `아이템 ${selectedRows.length.toLocaleString("ko-KR")}개`
        }
        discardNote={
          unselectedCount > 0
            ? `선택하지 않은 ${isTier ? "학생" : "아이템"} ${unselectedCount.toLocaleString("ko-KR")}${isTier ? "명" : "개"}의 값은 반영되지 않고 삭제돼요.`
            : `선택하지 않은 ${isTier ? "학생" : "아이템"}의 값은 반영되지 않고 삭제돼요.`
        }
        canApply={!submitting && selectedRows.length > 0}
        actionData={actionData}
        invalidInputCount={Object.keys(fieldErrors).length}
      />
    </div>
  );
}

function EntryIdentity({
  type,
  entryKey,
  metadata,
}: {
  type: SyncDraftType;
  entryKey: string;
  metadata: SyncDraftDisplayMetadata;
}) {
  if (type === "student_tier") {
    const { name, variant } = splitVisibleStudentName(metadata.label);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="block shrink-0">
          <StudentThumb
            studentUid={metadata.studentUid ?? entryKey}
            name={metadata.label}
            variant={null}
            recruitmentLabel=""
            isNew={false}
            favorite={NO_FAVORITE_LABEL}
            compact
            showCaption={false}
          />
        </span>
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-v2-fg">{name}</span>
          {variant ? <span className="block truncate text-xs text-v2-fg-tertiary">{variant}</span> : null}
        </div>
      </div>
    );
  }

  const resource = metadata.item;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {resource ? (
        <ResourceThumb
          itemUid={resource.uid}
          resourceType={resource.type}
          rarity={resource.rarity}
          name={resource.name}
          label={getEquipmentResourceTierLabel(resource.uid) ?? undefined}
          size="md"
        />
      ) : null}
      <span className="truncate text-sm font-medium text-v2-fg">{metadata.label}</span>
    </div>
  );
}

function formatDelta(type: SyncDraftType, delta: number): string {
  if (delta === 0) return "";
  const sign = delta > 0 ? "+" : "-";
  const amount = Math.abs(delta).toLocaleString("ko-KR");
  return type === "student_tier" ? `${sign}${amount}단계` : `${sign}${amount}개`;
}
