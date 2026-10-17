import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import hangul from "hangul-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { studentImageUrl } from "~/models/assets";
import { StudentNameLines } from "~/components/v2/features/students/StudentNameLines";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import type { AllStudentsFavoriteItems } from "~/models/resource";
import {
  buildGiftPlanSavePayload,
  getSavedGiftPlanSnapshot,
  hasStudentGiftPlanChanges,
  type RelationshipGiftPlanPayload,
  type StudentItemsMap,
} from "~/domain/relationship-gift-plan";
import { isStaleStudentStateActionResult, STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";
import { cn } from "~/lib/utils";
import type { action } from "~/routes/utils.relationship";
import { useV2Page } from "../../layout/V2Page";
import { Button } from "../../primitives/Button";
import { NumberInput } from "../../primitives/NumberInput";
import { Popover } from "../../primitives/Popover";
import type { GiftPlanBreakdownEntry } from "./RelationshipGiftTile";

const formatNumber = (value: number) => value.toLocaleString("en-US");

export type RelationshipGiftStudent = {
  uid: string;
  name: string;
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
  items: Record<string, number>;
  order: number;
};

export function RelationshipGiftDetails({
  item,
  students,
  studentItemsMap,
  initialStudentItems,
  requiredQuantity,
  ownedQuantity,
  breakdown,
  writeMode,
  isAuthenticated,
  staleWriteBlocked,
  commonItemUids,
  onQuantityChange,
  onStaleWriteBlocked,
  onSaved,
}: {
  item: AllStudentsFavoriteItems;
  students: RelationshipGiftStudent[];
  studentItemsMap: StudentItemsMap;
  initialStudentItems: StudentItemsMap;
  requiredQuantity: number;
  ownedQuantity: number | null;
  breakdown: GiftPlanBreakdownEntry[];
  writeMode: "legacy" | "nullable";
  isAuthenticated: boolean;
  staleWriteBlocked: boolean;
  commonItemUids: string[];
  onQuantityChange: (studentUid: string, itemUid: string, quantity: number) => void;
  onStaleWriteBlocked: () => void;
  onSaved: (savedPlans: Array<{ studentUid: string; items: Record<string, number> }>) => void;
}) {
  const summaryRef = useRef<HTMLButtonElement>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const favoriteLevelEntries = Object.entries(item.favoriteLevels).sort((a, b) => Number(b[0]) - Number(a[0]));
  const insufficient = ownedQuantity !== null && ownedQuantity < requiredQuantity;
  const isCommonGift = commonItemUids.includes(item.itemUid);

  return (
    <section className="rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex flex-wrap items-center gap-3">
        {ownedQuantity !== null ? (
          <div className="relative flex shrink-0 items-center gap-1 text-sm tabular-nums text-v2-fg-secondary">
            <button
              ref={summaryRef}
              type="button"
              aria-expanded={breakdown.length > 0 ? summaryOpen : undefined}
              onClick={() => breakdown.length > 0 && setSummaryOpen((open) => !open)}
              className={cn(
                "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
                breakdown.length > 0 && "underline decoration-dotted underline-offset-2",
              )}
            >
              필요 {formatNumber(requiredQuantity)}
            </button>
            · 보유 {formatNumber(ownedQuantity)}
            {insufficient ? <span className="font-semibold text-v2-warning">부족</span> : null}
            <Popover
              open={summaryOpen && breakdown.length > 0}
              label="필요한 학생별 선물 수량"
              onClose={() => setSummaryOpen(false)}
              returnFocusRef={summaryRef}
            >
              <p className="mb-2 text-sm font-semibold text-v2-fg">필요한 학생</p>
              <div className="space-y-1 text-sm">
                {breakdown.map((entry) => (
                  <div key={entry.studentUid} className="flex items-center justify-between gap-4">
                    <span className="flex min-w-0 items-center gap-2">
                      <img
                        src={studentImageUrl(entry.studentUid)}
                        alt=""
                        loading="lazy"
                        className="size-6 shrink-0 rounded-md object-cover"
                      />
                      <span className="min-w-0 truncate text-v2-fg-secondary">{entry.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-v2-fg">{formatNumber(entry.quantity)}개</span>
                  </div>
                ))}
              </div>
            </Popover>
          </div>
        ) : null}
      </div>
      <div className="mt-3 space-y-5">
        {favoriteLevelEntries.map(([level, levelData]) => (
          <RelationshipGiftLevel
            key={level}
            favoriteLevel={Number(level)}
            exp={levelData.exp}
            levelStudents={levelData.students}
            item={item}
            students={students}
            studentItemsMap={studentItemsMap}
            initialStudentItems={initialStudentItems}
            isCommonGift={isCommonGift}
            isAuthenticated={isAuthenticated}
            writeMode={writeMode}
            staleWriteBlocked={staleWriteBlocked}
            onStaleWriteBlocked={onStaleWriteBlocked}
            onQuantityChange={onQuantityChange}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  );
}

type StudentInFavoriteLevel = { uid: string; name: string };

function RelationshipGiftLevel({
  favoriteLevel,
  exp,
  levelStudents,
  item,
  students,
  studentItemsMap,
  initialStudentItems,
  isCommonGift,
  isAuthenticated,
  writeMode,
  staleWriteBlocked,
  onStaleWriteBlocked,
  onQuantityChange,
  onSaved,
}: {
  favoriteLevel: number;
  exp: number;
  levelStudents: StudentInFavoriteLevel[];
  item: AllStudentsFavoriteItems;
  students: RelationshipGiftStudent[];
  studentItemsMap: StudentItemsMap;
  initialStudentItems: StudentItemsMap;
  isCommonGift: boolean;
  isAuthenticated: boolean;
  writeMode: "legacy" | "nullable";
  staleWriteBlocked: boolean;
  onStaleWriteBlocked: () => void;
  onQuantityChange: (studentUid: string, itemUid: string, quantity: number) => void;
  onSaved: (savedPlans: Array<{ studentUid: string; items: Record<string, number> }>) => void;
}) {
  const { stacked } = useV2Page();
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [manuallyAddedStudentUids, setManuallyAddedStudentUids] = useState<Set<string>>(new Set());
  const saveFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const [saveError, setSaveError] = useState<string | null>(null);
  const visibleSaveError = staleWriteBlocked ? STUDENT_STATE_STALE_MESSAGE : saveError;
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const saveBarRef = useRef<HTMLDivElement>(null);
  const retryPayloadRef = useRef<RelationshipGiftPlanPayload[] | null>(null);
  const lastSuccessRef = useRef<Set<string>>(new Set());
  const processedDataRef = useRef<typeof saveFetcher.data | null>(null);

  const changedStudents = useMemo(
    () =>
      levelStudents.filter((student) =>
        hasStudentGiftPlanChanges(studentItemsMap, initialStudentItems, student.uid, item.itemUid),
      ),
    [levelStudents, studentItemsMap, initialStudentItems, item.itemUid],
  );
  const visibleStudents = useMemo(
    () =>
      levelStudents.filter((student) => {
        const quantity = studentItemsMap.get(student.uid)?.items[item.itemUid] ?? 0;
        return quantity > 0 || manuallyAddedStudentUids.has(student.uid);
      }),
    [levelStudents, studentItemsMap, item.itemUid, manuallyAddedStudentUids],
  );
  const searchResults = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return [];
    const visibleUids = new Set(visibleStudents.map((student) => student.uid));
    return levelStudents
      .filter((student) => !visibleUids.has(student.uid) && hangul.search(student.name, query) >= 0)
      .slice(0, 8);
  }, [levelStudents, searchQuery, visibleStudents]);
  const totalCount = levelStudents.reduce(
    (total, student) => total + (studentItemsMap.get(student.uid)?.items[item.itemUid] ?? 0),
    0,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset transient edit state when the selected gift or preference group changes.
  useEffect(() => {
    setSearchQuery("");
    setManuallyAddedStudentUids(new Set());
    setEditing(false);
    setSaveError(null);
    setSaveSuccess(false);
    setRetryAvailable(false);
    retryPayloadRef.current = null;
  }, [item.itemUid, favoriteLevel]);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data || processedDataRef.current === saveFetcher.data) return;
    processedDataRef.current = saveFetcher.data;
    if (isStaleStudentStateActionResult(saveFetcher.data)) {
      setSaveError(STUDENT_STATE_STALE_MESSAGE);
      setSaveSuccess(false);
      setRetryAvailable(false);
      retryPayloadRef.current = null;
      onStaleWriteBlocked();
      return;
    }
    if (!saveFetcher.data.success) {
      setSaveError("error" in saveFetcher.data ? saveFetcher.data.error : "저장하지 못했어요");
      setSaveSuccess(false);
      setRetryAvailable("retryable" in saveFetcher.data && saveFetcher.data.retryable === true);
      return;
    }
    const savedPlans = getSavedGiftPlanSnapshot(retryPayloadRef.current ?? []);
    retryPayloadRef.current = null;
    setRetryAvailable(false);
    setSaveError(null);
    const savedStudentUids = new Set(savedPlans.map(({ studentUid }) => studentUid));
    const changedUids = [...savedStudentUids].filter((uid) => !lastSuccessRef.current.has(uid));
    if (changedUids.length > 0) {
      const changed = new Set(changedUids);
      const changedPlans = savedPlans.filter(({ studentUid }) => changed.has(studentUid));
      setSaveSuccess(true);
      onSaved(changedPlans);
      revalidator.revalidate();
      lastSuccessRef.current = savedStudentUids;
    }
  }, [saveFetcher.state, saveFetcher.data, onSaved, onStaleWriteBlocked, revalidator]);

  const buildPayload = () => {
    const changedUids = changedStudents.map((student) => student.uid);
    const payloads: RelationshipGiftPlanPayload[] = [];
    for (const studentUid of changedUids) {
      const student = students.find((candidate) => candidate.uid === studentUid);
      const studentItems = studentItemsMap.get(studentUid);
      if (!student || !studentItems) continue;
      payloads.push(
        writeMode === "nullable"
          ? buildGiftPlanSavePayload(studentUid, studentItems.items)
          : {
              studentId: studentUid,
              items: studentItems.items,
              currentLevel: student.currentLevel ?? 1,
              currentExp: student.currentExp,
              targetLevel: student.targetLevel ?? 50,
            },
      );
    }
    return payloads;
  };

  const handleSave = () => {
    if (!isAuthenticated || changedStudents.length === 0 || staleWriteBlocked) return;
    const payloads = buildPayload();
    if (payloads.length === 0) return;
    lastSuccessRef.current.clear();
    retryPayloadRef.current = payloads;
    setRetryAvailable(false);
    setSaveError(null);
    setSaveSuccess(false);
    processedDataRef.current = null;
    saveFetcher.submit(payloads, { method: "POST", encType: "application/json" });
  };

  const handleRetry = () => {
    if (!retryAvailable || staleWriteBlocked || !retryPayloadRef.current) return;
    setRetryAvailable(false);
    processedDataRef.current = null;
    saveFetcher.submit(retryPayloadRef.current, { method: "POST", encType: "application/json" });
  };

  const handleCancel = () => {
    for (const student of changedStudents) {
      onQuantityChange(student.uid, item.itemUid, initialStudentItems.get(student.uid)?.items[item.itemUid] ?? 0);
    }
    setEditing(false);
  };

  return (
    <div className="border-t border-v2-divider pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p
          role="img"
          aria-label={`선호 ${favoriteLevel}단계`}
          className="flex min-h-7 items-center gap-2 text-sm font-semibold text-v2-fg"
        >
          <img
            src={`https://assets.mollulog.net/assets/images/ui/gift-reaction-${favoriteLevel}.png`}
            alt=""
            className="size-6 object-contain"
          />
          +{formatNumber(exp)} EXP
        </p>
        <span className="shrink-0 text-sm tabular-nums text-v2-fg-secondary">{formatNumber(totalCount)}개</span>
      </div>
      {isCommonGift ? <p className="mt-2 text-xs text-v2-fg-tertiary">모든 학생이 선호해요</p> : null}
      {editing ? (
        <div className="mt-3 space-y-3">
          <label className="relative block">
            <MagnifyingGlassIcon
              className="absolute inset-y-0 left-3 my-auto size-4 text-v2-fg-tertiary"
              aria-hidden="true"
            />
            <span className="sr-only">학생 이름으로 찾기</span>
            <input
              type="search"
              value={searchQuery}
              placeholder="학생 이름으로 찾기"
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              className="min-h-9 w-full rounded-md border border-v2-control-border bg-v2-surface py-1.5 pr-3 pl-9 text-sm text-v2-fg placeholder:text-v2-fg-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus max-md:min-h-11"
            />
          </label>
          {searchQuery.trim() ? (
            <div className="rounded-md bg-v2-inset">
              {searchResults.length > 0 ? (
                searchResults.map((student) => (
                  <button
                    key={student.uid}
                    type="button"
                    onClick={() => {
                      setManuallyAddedStudentUids((current) => new Set(current).add(student.uid));
                      setSearchQuery("");
                    }}
                    className="flex min-h-v2-row-min w-full items-center gap-2 rounded-md px-v2-row-x text-left text-sm text-v2-fg hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                  >
                    <img src={studentImageUrl(student.uid)} alt="" className="size-8 rounded-md object-cover" />
                    <span className="min-w-0 flex-1 truncate">{student.name}</span>
                    <span className="text-xs text-v2-fg-tertiary">추가</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-center text-xs text-v2-fg-tertiary">검색 결과가 없어요</p>
              )}
            </div>
          ) : null}
          {visibleStudents.length > 0 ? (
            <fieldset
              aria-label="학생별 선물 수량"
              className="space-y-1"
              onFocus={(event) => {
                const row = (event.target as HTMLElement).closest("[data-gift-edit-row]");
                const bar = saveBarRef.current;
                if (!row || !bar) return;
                const scrollContainer = row.closest<HTMLElement>(".mllg-content-area");
                if (!scrollContainer) return;
                const overlap = row.getBoundingClientRect().bottom + 4 - bar.getBoundingClientRect().top;
                if (overlap > 0) scrollContainer.scrollBy({ top: overlap, behavior: "instant" });
              }}
            >
              {visibleStudents.map((student) => (
                <div key={student.uid} data-gift-edit-row className="flex min-h-10 items-center gap-2">
                  <img src={studentImageUrl(student.uid)} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm text-v2-fg">{student.name}</span>
                  <div className="w-33 shrink-0">
                    <NumberInput
                      size={stacked ? "md" : "sm"}
                      minValue={0}
                      value={studentItemsMap.get(student.uid)?.items[item.itemUid] ?? 0}
                      inputProps={{ "aria-label": `${student.name} ${item.itemName} 수량` }}
                      onChange={(quantity) => {
                        setManuallyAddedStudentUids((current) => new Set(current).add(student.uid));
                        onQuantityChange(student.uid, item.itemUid, quantity);
                      }}
                    />
                  </div>
                </div>
              ))}
            </fieldset>
          ) : (
            <p className="py-4 text-center text-sm text-v2-fg-tertiary">입력된 학생이 없어요</p>
          )}
          <div
            ref={saveBarRef}
            className={cn(
              "sticky z-10 flex min-h-10 items-center justify-between gap-2 border-t border-v2-divider bg-v2-inset p-0.5 max-md:min-h-12",
              stacked
                ? "bottom-[calc(var(--mobile-bottom-offset)+4rem)]"
                : "bottom-[var(--mobile-bottom-offset)] lg:bottom-0",
            )}
          >
            <div className="min-w-0 flex-1">
              {visibleSaveError ? (
                <div className="flex flex-wrap items-center gap-2" role="alert">
                  <span className="text-xs text-v2-warning">{visibleSaveError}</span>
                  {staleWriteBlocked ? (
                    <Button onClick={() => window.location.reload()} className="min-h-8 px-2 text-xs">
                      새로고침
                    </Button>
                  ) : retryAvailable ? (
                    <Button onClick={handleRetry} className="min-h-8 px-2 text-xs">
                      다시 시도
                    </Button>
                  ) : null}
                </div>
              ) : saveSuccess ? (
                <span role="status" className="text-xs text-v2-success">
                  저장됨
                </span>
              ) : saveFetcher.state !== "idle" ? (
                <span role="status" className="text-xs text-v2-fg-secondary">
                  저장 중
                </span>
              ) : (
                <span className="text-xs text-v2-fg-tertiary">{changedStudents.length}명 변경됨</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="text" onClick={handleCancel} className="min-h-9 px-2 text-xs max-md:min-h-11">
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={changedStudents.length === 0 || saveFetcher.state !== "idle" || staleWriteBlocked}
                className="min-h-9 px-2 text-xs max-md:min-h-11"
              >
                변경 사항 저장
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {levelStudents.map((student) => {
              const quantity = studentItemsMap.get(student.uid)?.items[item.itemUid] ?? 0;
              if (isCommonGift && quantity <= 0) return null;
              const { name, variant } = splitVisibleStudentName(student.name);
              return (
                <span key={student.uid} className="flex w-14 flex-col items-center gap-1">
                  <span className="relative block size-12 overflow-hidden rounded-md bg-v2-inset">
                    <img src={studentImageUrl(student.uid)} alt="" loading="lazy" className="size-full object-cover" />
                    {quantity > 0 ? (
                      <span className="absolute inset-x-0 bottom-0 bg-v2-scrim px-1 text-center text-xs font-medium tabular-nums text-v2-on-media">
                        {formatNumber(quantity)}개
                      </span>
                    ) : null}
                  </span>
                  <StudentNameLines name={name} variant={variant} />
                </span>
              );
            })}
          </div>
          {isAuthenticated ? (
            <div className="mt-3 flex justify-end">
              <Button onClick={() => setEditing(true)} className="min-h-9 px-3 text-xs">
                선물 개수 입력
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
