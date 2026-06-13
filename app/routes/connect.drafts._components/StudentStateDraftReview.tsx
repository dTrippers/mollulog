import type { ReactNode } from "react";
import { ArchiveBoxIcon, ExclamationTriangleIcon, StarIcon as StarIconOutline } from "@heroicons/react/24/outline";
import { ArrowPathIcon, StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Form, Link, useNavigation } from "react-router";
import { Button, EmptyView, Title } from "~/components/primitives";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";
import type {
  StudentStateDraftCurrentValue,
  StudentStateDraftTargetValue,
  StudentStateDraftValue,
} from "~/models/student-state-draft-value";
import type { SyncDraft } from "~/models/sync-draft";
import type { SyncDraftDisplayMetadata, SyncDraftReviewActionData } from "./SyncDraftReview";

export type StudentStateCurrentValues = Record<string, StudentStateStoredValue>;

export type StudentStateStoredValue = {
  current: StudentStateStoredCurrentValue;
  target: StudentStateStoredTargetValue;
};

export type StudentStateStoredCurrentValue = Omit<StudentStateDraftCurrentValue, "tier"> & {
  tier: number | null;
};

export type StudentStateStoredTargetValue = Omit<StudentStateDraftTargetValue, "targetTier"> & {
  targetTier: number | null;
};

export type StudentStateProposedValues = Record<
  string,
  { value: StudentStateDraftValue | null; error: string | null }
>;

type StudentStateDraftReviewProps = {
  draft: SyncDraft;
  metadataByKey: Record<string, SyncDraftDisplayMetadata>;
  currentValues: StudentStateCurrentValues;
  proposedValues: StudentStateProposedValues;
  actionData?: SyncDraftReviewActionData;
};

const currentFields = [
  ["tier", "등급", formatTier],
  ["level", "레벨", formatPlainValue],
  ["weaponLevel", "고유무기", formatPlainValue],
  ["skillEx", "EX", formatPlainValue],
  ["skillNormal", "기본", formatPlainValue],
  ["skillEnhanced", "강화", formatPlainValue],
  ["skillSub", "서브", formatPlainValue],
  ["equip1", "장비 1", formatPlainValue],
  ["equip2", "장비 2", formatPlainValue],
  ["equip3", "장비 3", formatPlainValue],
  ["equipSpecial", "애용품", formatPlainValue],
  ["abilityHp", "능력 HP", formatPlainValue],
  ["abilityAtk", "능력 공격", formatPlainValue],
  ["abilityHeal", "능력 치유", formatPlainValue],
  ["bond", "인연", formatPlainValue],
] as const satisfies readonly [
  keyof StudentStateStoredCurrentValue,
  string,
  (value: number | null) => ReactNode,
][];

const targetFields = [
  ["targetTier", "목표 등급", formatTier],
  ["targetLevel", "목표 레벨", formatPlainValue],
  ["targetSkillEx", "목표 EX", formatPlainValue],
  ["targetSkillNormal", "목표 기본", formatPlainValue],
  ["targetSkillEnhanced", "목표 강화", formatPlainValue],
  ["targetSkillSub", "목표 서브", formatPlainValue],
  ["targetEquip1", "목표 장비 1", formatPlainValue],
  ["targetEquip2", "목표 장비 2", formatPlainValue],
  ["targetEquip3", "목표 장비 3", formatPlainValue],
  ["targetEquipSpecial", "목표 애용품", formatPlainValue],
] as const satisfies readonly [
  keyof StudentStateStoredTargetValue,
  string,
  (value: number | null) => ReactNode,
][];

export default function StudentStateDraftReview({
  draft,
  metadataByKey,
  currentValues,
  proposedValues,
  actionData,
}: StudentStateDraftReviewProps) {
  const navigation = useNavigation();
  const isPending = draft.status === "pending";
  const submittingIntent = navigation.formData?.get("intent");
  const isApplying = navigation.state === "submitting" && submittingIntent === "apply";
  const isDiscarding = navigation.state === "submitting" && submittingIntent === "discard";
  const rows = draft.entries.map((entry) => {
    const proposed = proposedValues[entry.uid] ?? {
      value: null,
      error: "학생 상태 변경안 데이터를 찾을 수 없어요",
    };
    const currentValue = currentValues[entry.entryKey] ?? emptyStoredValue();
    const currentChanged =
      proposed.value?.current != null &&
      currentFields.some(([field]) => currentValue.current[field] !== proposed.value?.current?.[field]);
    const targetChanged =
      proposed.value?.target != null &&
      targetFields.some(([field]) => currentValue.target[field] !== proposed.value?.target?.[field]);

    return {
      entry,
      metadata: metadataByKey[entry.entryKey],
      currentValue,
      proposed,
      changed: currentChanged || targetChanged,
      confidence: parseConfidence(entry.meta),
    };
  });
  const changedRows = rows.filter((row) => row.changed);
  const errorRows = rows.filter((row) => row.proposed.error);
  const lowConfidenceRows = rows.filter((row) => row.confidence !== null && row.confidence < 0.7);

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <Title
          text="학생 상태 변경안 확인"
          description="현재 저장된 학생 상태와 가져온 값을 비교하고, 확인 후 프로필에 반영합니다."
          className="my-0"
        />
        <Link to="/connect/drafts" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-300">
          변경안 목록으로 돌아가기
        </Link>
      </div>

      <section className="grid gap-2 md:grid-cols-4">
        <SummaryCell label="변경안 종류" value="학생 현재 상태/육성 목표" />
        <SummaryCell label="변경안 상태" value={draftStatusLabel(draft.status)} />
        <SummaryCell label="검토할 학생" value={`${draft.entries.length.toLocaleString()}명`} />
        <SummaryCell label="실제 변경" value={`${changedRows.length.toLocaleString()}명`} />
      </section>

      {errorRows.length > 0 ? (
        <div className="flex gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>읽을 수 없는 항목이 {errorRows.length.toLocaleString()}개 있어요. 해당 항목은 반영할 수 없어요.</p>
        </div>
      ) : null}

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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-8">
            <EmptyView Icon={ArchiveBoxIcon} text="검토할 항목이 없어요" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(({ entry, metadata, currentValue, proposed, changed, confidence }) => (
              <article
                key={entry.uid}
                className={cn(
                  "space-y-4 p-5",
                  changed && "bg-blue-50/70 dark:bg-blue-950/20",
                  confidence !== null && confidence < 0.7 && "bg-amber-50/70 dark:bg-amber-950/20",
                  proposed.error && "bg-red-50/70 dark:bg-red-950/20",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={studentImageUrl(metadata?.studentUid ?? entry.entryKey)}
                    alt="학생 이미지"
                    className="size-12 shrink-0 rounded-md bg-muted object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{metadata?.label ?? "알 수 없는 학생"}</p>
                    {confidence !== null && confidence < 0.7 ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        인식 신뢰도 {Math.round(confidence * 100)}%
                      </p>
                    ) : null}
                  </div>
                </div>

                {proposed.error ? (
                  <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {proposed.error}
                  </p>
                ) : (
                  <div className="space-y-5">
                    <ComparisonSection
                      title="현재 상태"
                      currentStatus={currentValue.current.tier == null ? "미모집" : "모집됨"}
                      proposedStatus={proposed.value?.current == null ? "미모집" : "모집됨"}
                    >
                      {proposed.value?.current == null ? null : (
                        <FieldGrid
                          fields={currentFields}
                          currentValue={currentValue.current}
                          proposedValue={proposed.value.current}
                        />
                      )}
                    </ComparisonSection>

                    {proposed.value?.target != null ? (
                      <ComparisonSection title="육성 목표">
                        <FieldGrid
                          fields={targetFields}
                          currentValue={currentValue.target}
                          proposedValue={proposed.value.target}
                        />
                      </ComparisonSection>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2 md:flex-row md:justify-end">
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
          <Form method="post">
            <Button
              type="submit"
              name="intent"
              value="apply"
              size="sm"
              variant="primary"
              disabled={navigation.state === "submitting" || errorRows.length > 0}
            >
              {isApplying ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
              {isApplying ? "반영 중..." : "프로필에 반영"}
            </Button>
          </Form>
        </div>
      ) : null}
    </div>
  );
}

function FieldGrid<T extends Record<string, number | null>>({
  fields,
  currentValue,
  proposedValue,
}: {
  fields: readonly (readonly [keyof T, string, (value: number | null) => ReactNode])[];
  currentValue: T;
  proposedValue: T;
}) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([field, label, formatter]) => {
        const current = currentValue[field];
        const proposed = proposedValue[field];
        const fieldChanged = current !== proposed;
        return (
          <div
            key={String(field)}
            className={cn(
              "rounded-md border border-border bg-background px-3 py-2",
              fieldChanged && "border-blue-500/20 bg-blue-500/10",
            )}
          >
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1 flex items-center justify-between gap-2 text-sm">
              <span className="tabular-nums text-muted-foreground">{formatter(current)}</span>
              <span className="text-muted-foreground">→</span>
              <span
                className={cn(
                  "font-semibold tabular-nums text-foreground",
                  fieldChanged && "text-blue-700 dark:text-blue-300",
                )}
              >
                {formatter(proposed)}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ComparisonSection({
  title,
  currentStatus,
  proposedStatus,
  children,
}: {
  title: string;
  currentStatus?: string;
  proposedStatus?: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {currentStatus && proposedStatus ? (
          <p className="text-xs font-medium text-muted-foreground">
            {currentStatus} <span className="mx-1">→</span>
            <span className={cn(currentStatus !== proposedStatus && "text-blue-700 dark:text-blue-300")}>
              {proposedStatus}
            </span>
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function emptyStoredValue(): StudentStateStoredValue {
  return {
    current: {
      level: null,
      tier: null,
      weaponLevel: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
      bond: null,
    },
    target: {
      targetLevel: null,
      targetTier: null,
      targetSkillEx: null,
      targetSkillNormal: null,
      targetSkillEnhanced: null,
      targetSkillSub: null,
      targetEquip1: null,
      targetEquip2: null,
      targetEquip3: null,
      targetEquipSpecial: null,
    },
  };
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
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

function formatTier(value: number | null): ReactNode {
  return value == null ? "-" : <TierStars tier={value} />;
}

function formatPlainValue(value: number | null): ReactNode {
  return value == null ? "-" : value.toLocaleString();
}

function TierStars({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center" aria-label={`${tier}성`}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((eachTier) => {
        const Icon = eachTier <= tier ? StarIconSolid : StarIconOutline;
        return (
          <Icon
            key={eachTier}
            className={cn(
              "size-4",
              eachTier <= 5 ? "text-yellow-500" : "text-teal-500",
              eachTier === 5 && "mr-1",
              eachTier > tier && "opacity-25",
            )}
          />
        );
      })}
    </span>
  );
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
