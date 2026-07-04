import { GiftIcon } from "@heroicons/react/24/outline";
import hangul from "hangul-js";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Await, useFetcher, useRevalidator } from "react-router";
import { ResourceInventoryTile } from "~/components/features/growth";
import {
  BottomSheet,
  Button,
  ClickableSurface,
  HoverTooltip,
  Input,
  LoadingSkeleton,
  NumberInput,
  ProfileImage,
  ResourceCard,
  SubTitle,
} from "~/components/primitives";
import { cn } from "~/lib/utils";
import { COMMON_FAVORITE_ITEM_UIDS, type AllStudentsFavoriteItems } from "~/models/resource";
import type { action } from "~/routes/utils.relationship";
import { type ItemQuantityBreakdownEntry, QuantityBreakdownTooltipContent } from "./QuantityBreakdownTooltip";

// Common types
type StudentWithRelationship = {
  uid: string;
  name: string;
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
  items: Record<string, number>;
};

type StudentItemsMap = Map<string, { uid: string; items: Record<string, number> }>;
type ItemQuantityComparison = {
  requiredQuantity: number;
  ownedQuantity: number;
  isInsufficient: boolean;
};

type FavoritedItemSelectorProps = {
  items: Promise<AllStudentsFavoriteItems[]>;
  students: StudentWithRelationship[];
  isAuthenticated: boolean;
  ownedQuantities: Record<string, number> | null;
};

const INSUFFICIENT_QUANTITY_CLASS = "text-red-600 dark:text-red-400";

export default function FavoritedItemSelector({
  items,
  students,
  isAuthenticated,
  ownedQuantities,
}: FavoritedItemSelectorProps) {
  const [activeItem, setActiveItem] = useState<AllStudentsFavoriteItems | null>(null);
  const [studentItemsState, setStudentItemsState] = useState<StudentItemsMap>(new Map());
  const [initialStudentItems, setInitialStudentItems] = useState<StudentItemsMap>(new Map());
  const showMobileSheet = useIsRelationshipGiftSheetViewport();

  // Initialize state from props
  useEffect(() => {
    const map = new Map<string, { uid: string; items: Record<string, number> }>();
    const initialMap = new Map<string, { uid: string; items: Record<string, number> }>();
    for (const student of students) {
      const studentData = { uid: student.uid, items: { ...student.items } };
      map.set(student.uid, studentData);
      initialMap.set(student.uid, { uid: student.uid, items: { ...student.items } });
    }
    setStudentItemsState(map);
    setInitialStudentItems(initialMap);
  }, [students]);

  const itemCounts = useMemo(() => {
    const _itemCounts = new Map<string, number>();
    for (const studentItem of studentItemsState.values()) {
      for (const [itemUid, count] of Object.entries(studentItem.items)) {
        if (count <= 0) {
          continue;
        }
        _itemCounts.set(itemUid, (_itemCounts.get(itemUid) ?? 0) + count);
      }
    }
    return _itemCounts;
  }, [studentItemsState]);

  const itemQuantityBreakdowns = useMemo(() => {
    if (!isAuthenticated) {
      return null;
    }

    return buildItemQuantityBreakdowns(students, studentItemsState);
  }, [isAuthenticated, students, studentItemsState]);

  const handleQuantityChange = (studentUid: string, itemUid: string, value: number) => {
    setStudentItemsState((prev) => {
      const newMap = new Map(prev);
      const student = newMap.get(studentUid);
      if (student) {
        newMap.set(studentUid, { ...student, items: { ...student.items, [itemUid]: value } });
      } else {
        newMap.set(studentUid, { uid: studentUid, items: { [itemUid]: value } });
      }
      return newMap;
    });
  };

  const handleSave = (studentUids: string[]) => {
    // Update initial state for saved students
    setInitialStudentItems((prev) => {
      const newMap = new Map(prev);
      for (const studentUid of studentUids) {
        const current = studentItemsState.get(studentUid);
        if (current) {
          newMap.set(studentUid, { uid: studentUid, items: { ...current.items } });
        }
      }
      return newMap;
    });
  };

  return (
    <>
      <Suspense fallback={<LoadingSkeleton />}>
        <Await resolve={items}>
          {(items) => {
            const gridCount = Object.keys(activeItem?.favoriteLevels ?? {}).length ?? 0;
            let gridClass = "lg:grid-cols-2";
            if (gridCount === 1) {
              gridClass = "lg:grid-cols-1";
            } else if (gridCount === 3) {
              gridClass = "lg:grid-cols-3";
            }
            return (
              <>
                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] 2xl:items-start">
                  <ItemSelector
                    items={items}
                    activeItemUid={activeItem?.itemUid ?? null}
                    itemCounts={itemCounts}
                    itemQuantityBreakdowns={itemQuantityBreakdowns}
                    ownedQuantities={ownedQuantities}
                    onSelectItem={(itemUid) => setActiveItem(items.find((item) => item.itemUid === itemUid) ?? null)}
                  />
                  <div className="hidden min-w-0 2xl:sticky 2xl:top-4 2xl:block">
                    {activeItem ? (
                      <GiftDetailCards
                        activeItem={activeItem}
                        gridClass={gridClass}
                        itemCounts={itemCounts}
                        itemQuantityBreakdowns={itemQuantityBreakdowns}
                        ownedQuantities={ownedQuantities}
                        studentItemsState={studentItemsState}
                        initialStudentItems={initialStudentItems}
                        students={students}
                        isAuthenticated={isAuthenticated}
                        onQuantityChange={handleQuantityChange}
                        onSave={handleSave}
                      />
                    ) : (
                      <GiftDetailEmptyState />
                    )}
                  </div>
                </div>
                {activeItem && showMobileSheet && (
                  <BottomSheet
                    Icon={GiftIcon}
                    title="선물 정보"
                    description="선물을 선호하는 학생을 확인하고 각 학생에게 선물할 수량을 정리해보세요"
                    onClose={() => setActiveItem(null)}
                  >
                    <GiftDetailCards
                      activeItem={activeItem}
                      gridClass="grid-cols-1"
                      surface="sheet"
                      itemCounts={itemCounts}
                      itemQuantityBreakdowns={itemQuantityBreakdowns}
                      ownedQuantities={ownedQuantities}
                      studentItemsState={studentItemsState}
                      initialStudentItems={initialStudentItems}
                      students={students}
                      isAuthenticated={isAuthenticated}
                      onQuantityChange={handleQuantityChange}
                      onSave={handleSave}
                    />
                  </BottomSheet>
                )}
              </>
            );
          }}
        </Await>
      </Suspense>
    </>
  );
}

type ItemSelectorProps = {
  items: {
    itemUid: string;
    itemName: string;
    itemRarity: number;
  }[];
  activeItemUid: string | null;
  itemCounts: Map<string, number>;
  itemQuantityBreakdowns: Record<string, ItemQuantityBreakdownEntry[]> | null;
  ownedQuantities: Record<string, number> | null;
  onSelectItem: (itemUid: string) => void;
};

function ItemSelector({
  items,
  activeItemUid,
  itemCounts,
  itemQuantityBreakdowns,
  ownedQuantities,
  onSelectItem,
}: ItemSelectorProps) {
  return (
    <div>
      <SubTitle text="선물 목록" description="선물을 선호하는 학생을 확인하고 필요한 개수를 계산할 수 있어요" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] justify-items-center gap-x-1 gap-y-1 sm:grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))]">
        {items.map(({ itemUid, itemName, itemRarity }) => {
          const quantityComparison = getItemQuantityComparison(itemUid, itemCounts, ownedQuantities);
          const breakdown = itemQuantityBreakdowns?.[itemUid];
          const isDimmed = quantityComparison?.requiredQuantity === 0;
          const active = activeItemUid === itemUid;
          return (
            <ClickableSurface
              key={itemUid}
              className={cn(
                "rounded-md transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-blue-50 ring-2 ring-blue-400/80 dark:bg-blue-950/30 dark:ring-blue-500/80",
              )}
              onClick={() => onSelectItem(itemUid)}
            >
              <ResourceInventoryTile
                className="w-16 sm:w-18"
                tooltipFocusable={false}
                resource={{
                  itemUid,
                  rarity: itemRarity,
                  name: itemName,
                  label: quantityComparison ? undefined : itemCounts.get(itemUid),
                }}
                metrics={
                  quantityComparison
                    ? [
                        {
                          label: "필요",
                          value: quantityComparison.requiredQuantity.toLocaleString(),
                          tooltip:
                            breakdown && breakdown.length > 0 ? (
                              <QuantityBreakdownTooltipContent breakdown={breakdown} />
                            ) : undefined,
                          dimmed: isDimmed,
                        },
                        {
                          label: "보유",
                          value: quantityComparison.ownedQuantity.toLocaleString(),
                          valueClassName: quantityComparison.isInsufficient ? INSUFFICIENT_QUANTITY_CLASS : undefined,
                          dimmed: isDimmed,
                        },
                      ]
                    : undefined
                }
              />
            </ClickableSurface>
          );
        })}
      </div>
    </div>
  );
}

type GiftDetailCardsProps = {
  activeItem: AllStudentsFavoriteItems;
  gridClass: string;
  surface?: "card" | "sheet";
  itemCounts: Map<string, number>;
  itemQuantityBreakdowns: Record<string, ItemQuantityBreakdownEntry[]> | null;
  ownedQuantities: Record<string, number> | null;
  studentItemsState: StudentItemsMap;
  initialStudentItems: StudentItemsMap;
  onQuantityChange: (studentUid: string, itemUid: string, value: number) => void;
  students: StudentWithRelationship[];
  isAuthenticated: boolean;
  onSave: (studentUids: string[]) => void;
};

function GiftDetailCards({
  activeItem,
  gridClass,
  surface = "card",
  itemCounts,
  itemQuantityBreakdowns,
  ownedQuantities,
  studentItemsState,
  initialStudentItems,
  onQuantityChange,
  students,
  isAuthenticated,
  onSave,
}: GiftDetailCardsProps) {
  const favoriteLevelEntries = Object.entries(activeItem.favoriteLevels).sort((a, b) => Number(b[0]) - Number(a[0]));
  const showDividers = surface === "sheet" && favoriteLevelEntries.length > 1;

  return (
    <div className={cn("grid grid-cols-1 2xl:grid-cols-1", gridClass, surface === "sheet" ? "gap-0" : "gap-4")}>
      {favoriteLevelEntries.map(([favoriteLevel, { exp, students: levelStudents }], index) => (
        <div key={favoriteLevel}>
          {showDividers && index > 0 ? <div className="my-4 border-t border-border/60" /> : null}
          <FavoriteLevelCard
            favoriteLevel={favoriteLevel}
            exp={exp}
            levelStudents={levelStudents}
            activeItem={activeItem}
            surface={surface}
            quantityComparison={getItemQuantityComparison(activeItem.itemUid, itemCounts, ownedQuantities)}
            itemQuantityBreakdown={itemQuantityBreakdowns?.[activeItem.itemUid]}
            studentItemsMap={studentItemsState}
            initialStudentItems={initialStudentItems}
            onQuantityChange={onQuantityChange}
            students={students}
            isAuthenticated={isAuthenticated}
            onSave={onSave}
          />
        </div>
      ))}
    </div>
  );
}

function useIsRelationshipGiftSheetViewport() {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1535px)");
    const update = () => setMatches(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return matches;
}

function GiftDetailEmptyState() {
  return (
    <div className="hidden rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center 2xl:block">
      <p className="text-sm font-semibold text-foreground">선물을 선택해 주세요</p>
      <p className="mt-1 text-xs text-muted-foreground">선호 학생과 입력 수량을 여기에서 확인할 수 있어요.</p>
    </div>
  );
}

type UseSaveStudentItemsParams = {
  studentItemsMap: StudentItemsMap;
  initialStudentItems: StudentItemsMap;
  levelStudents: Array<{ uid: string; name: string }>;
  students: StudentWithRelationship[];
  activeItem: AllStudentsFavoriteItems;
  isAuthenticated: boolean;
  onSave: (studentUids: string[]) => void;
};

function useSaveStudentItems({
  studentItemsMap,
  initialStudentItems,
  levelStudents,
  students,
  activeItem,
  isAuthenticated,
  onSave,
}: UseSaveStudentItemsParams) {
  const revalidator = useRevalidator();
  const saveFetcher = useFetcher<typeof action>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const lastSuccessRef = useRef<Set<string>>(new Set());

  // Get changed students for this level (memoized to prevent unnecessary effect re-runs)
  const changedStudents = useMemo(() => {
    const hasChanged = (studentUid: string, itemUid: string): boolean => {
      const current = studentItemsMap.get(studentUid)?.items[itemUid] ?? 0;
      const initial = initialStudentItems.get(studentUid)?.items[itemUid] ?? 0;
      return current !== initial;
    };

    return levelStudents.filter((student) => hasChanged(student.uid, activeItem.itemUid)).map((student) => student.uid);
  }, [levelStudents, studentItemsMap, initialStudentItems, activeItem.itemUid]);

  const hasChanges = changedStudents.length > 0;
  const isSaving = saveFetcher.state !== "idle";

  useEffect(() => {
    if (saveFetcher.state === "idle" && saveFetcher.data?.success) {
      const savedStudentUids = new Set(changedStudents);
      const diff = Array.from(savedStudentUids).filter((uid) => !lastSuccessRef.current.has(uid));
      if (diff.length > 0) {
        setSaveSuccess(true);
        revalidator.revalidate();
        onSave(diff);
        lastSuccessRef.current = savedStudentUids;
      }
    }
    if (saveFetcher.state === "submitting") {
      lastSuccessRef.current.clear();
      setSaveSuccess(false);
    }
  }, [saveFetcher.state, saveFetcher.data, revalidator, onSave, changedStudents]);

  const handleSave = () => {
    setSaveError(null);
    setSaveSuccess(false);

    if (!isAuthenticated) {
      setSaveError("로그인이 필요해요");
      return;
    }

    if (changedStudents.length === 0) {
      return;
    }

    const studentsToSave: Array<{
      studentId: string;
      currentLevel: number;
      currentExp: number | null;
      targetLevel: number;
      items: Record<string, number>;
    }> = [];

    for (const studentUid of changedStudents) {
      const studentData = students.find((s) => s.uid === studentUid);
      const studentItems = studentItemsMap.get(studentUid);
      if (studentData && studentItems) {
        studentsToSave.push({
          studentId: studentUid,
          currentLevel: studentData.currentLevel ?? 1,
          currentExp: studentData.currentExp,
          targetLevel: studentData.targetLevel ?? 50,
          items: studentItems.items,
        });
      }
    }

    if (studentsToSave.length === 0) {
      return;
    }

    lastSuccessRef.current.clear();
    saveFetcher.submit(studentsToSave, { method: "POST", encType: "application/json" });
  };

  return {
    saveError,
    saveSuccess,
    isSaving,
    hasChanges,
    changedStudents,
    handleSave,
  };
}

type FavoriteLevelCardProps = {
  favoriteLevel: string;
  exp: number;
  levelStudents: Array<{ uid: string; name: string }>;
  activeItem: AllStudentsFavoriteItems;
  surface?: "card" | "sheet";
  quantityComparison: ItemQuantityComparison | null;
  itemQuantityBreakdown: ItemQuantityBreakdownEntry[] | undefined;
  studentItemsMap: StudentItemsMap;
  initialStudentItems: StudentItemsMap;
  onQuantityChange: (studentUid: string, itemUid: string, value: number) => void;
  students: StudentWithRelationship[];
  isAuthenticated: boolean;
  onSave: (studentUids: string[]) => void;
};

type FavoriteLevelCardEditModeProps = {
  levelStudents: Array<{ uid: string; name: string }>;
  activeItem: AllStudentsFavoriteItems;
  studentItemsMap: StudentItemsMap;
  onQuantityChange: (studentUid: string, itemUid: string, value: number) => void;
  saveError: string | null;
  saveSuccess: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  changedStudentCount: number;
  onSave: () => void;
  onCancel: () => void;
};

function FavoriteLevelCardEditMode({
  levelStudents,
  activeItem,
  studentItemsMap,
  onQuantityChange,
  saveError,
  saveSuccess,
  isSaving,
  hasChanges,
  changedStudentCount,
  onSave,
  onCancel,
}: FavoriteLevelCardEditModeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [manuallyAddedStudentUids, setManuallyAddedStudentUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSearchQuery("");
    setManuallyAddedStudentUids(new Set());
  }, []);

  const visibleStudents = useMemo(() => {
    return levelStudents.filter((student) => {
      const quantity = studentItemsMap.get(student.uid)?.items[activeItem.itemUid] ?? 0;
      return quantity > 0 || manuallyAddedStudentUids.has(student.uid);
    });
  }, [levelStudents, studentItemsMap, activeItem.itemUid, manuallyAddedStudentUids]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return [];
    }

    const visibleStudentUids = new Set(visibleStudents.map((student) => student.uid));
    return levelStudents
      .filter((student) => !visibleStudentUids.has(student.uid) && hangul.search(student.name, query) >= 0)
      .slice(0, 8);
  }, [levelStudents, searchQuery, visibleStudents]);

  const handleQuantityChange = (studentUid: string, value: number) => {
    setManuallyAddedStudentUids((prev) => {
      const next = new Set(prev);
      next.add(studentUid);
      return next;
    });
    onQuantityChange(studentUid, activeItem.itemUid, value);
  };

  const handleAddStudent = (studentUid: string) => {
    setManuallyAddedStudentUids((prev) => {
      const next = new Set(prev);
      next.add(studentUid);
      return next;
    });
    setSearchQuery("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3">
        <Input
          size="sm"
          value={searchQuery}
          placeholder="학생 이름으로 찾기"
          className="max-w-none"
          containerClassName="space-y-0"
          onChange={setSearchQuery}
        />

        {searchQuery.trim() ? (
          <div className="rounded-md border border-border bg-muted/20">
            {searchResults.length > 0 ? (
              <div className="divide-y divide-border">
                {searchResults.map((student) => (
                  <button
                    key={student.uid}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => handleAddStudent(student.uid)}
                  >
                    <ProfileImage studentUid={student.uid} imageSize={8} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{student.name}</span>
                    <span className="text-xs font-medium text-muted-foreground">추가</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">검색 결과가 없어요</p>
            )}
          </div>
        ) : null}

        {visibleStudents.length > 0 ? (
          <div className="space-y-1">
            {visibleStudents.map((student) => (
              <div key={student.uid} className="flex items-center gap-2 rounded-md px-1 py-1">
                <div className="shrink-0">
                  <ProfileImage studentUid={student.uid} imageSize={8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{student.name}</p>
                </div>
                <div className="w-24 shrink-0">
                  <NumberInput
                    value={studentItemsMap.get(student.uid)?.items[activeItem.itemUid] ?? 0}
                    onChange={(value) => handleQuantityChange(student.uid, value)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-8 text-center">
            <p className="text-sm font-medium text-foreground">입력된 학생이 없어요</p>
            <p className="mt-1 text-xs text-muted-foreground">학생 이름을 검색해서 추가해 주세요.</p>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
            {saveSuccess && <p className="text-xs text-green-600 dark:text-green-400">저장 완료</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="xs" text="취소" onClick={onCancel} />
            <Button
              size="xs"
              text={isSaving ? "저장 중..." : "변경 사항 저장"}
              onClick={onSave}
              variant="primary"
              disabled={!hasChanges || isSaving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type FavoriteLevelCardViewModeProps = {
  levelStudents: Array<{ uid: string; name: string }>;
  activeItem: AllStudentsFavoriteItems;
  studentItemsMap: StudentItemsMap;
  isAuthenticated: boolean;
  onEnterEditMode: () => void;
};

function FavoriteLevelCardViewMode({
  levelStudents,
  activeItem,
  studentItemsMap,
  isAuthenticated,
  onEnterEditMode,
}: FavoriteLevelCardViewModeProps) {
  const isCommonFavoriteItem = COMMON_FAVORITE_ITEM_UIDS.includes(activeItem.itemUid);
  const studentsWithQuantity = isCommonFavoriteItem
    ? levelStudents.filter((student) => (studentItemsMap.get(student.uid)?.items[activeItem.itemUid] ?? 0) > 0)
    : levelStudents;

  return (
    <>
      <div className="flex-1">
        {isCommonFavoriteItem && studentsWithQuantity.length === 0 ? (
          <div className="py-8 flex-1">
            <p className="text-sm text-center text-neutral-500 dark:text-neutral-400">모든 학생이 선호해요</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 items-start">
              {studentsWithQuantity.map((student) => {
                const quantity = studentItemsMap.get(student.uid)?.items[activeItem.itemUid] ?? 0;
                return (
                  <div key={student.uid} className="relative">
                    <ProfileImage studentUid={student.uid} imageSize={12} />
                    {quantity > 0 && (
                      <div className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-xs font-medium text-white dark:border-neutral-900">
                        {quantity}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isCommonFavoriteItem && <p className="text-xs text-muted-foreground">그 외 모든 학생이 선호해요</p>}
          </div>
        )}
      </div>
      {isAuthenticated && (
        <div className="mt-4 flex justify-end">
          <Button size="xs" text="선물 개수 입력" onClick={onEnterEditMode} />
        </div>
      )}
    </>
  );
}

function FavoriteLevelCard({
  favoriteLevel,
  exp,
  levelStudents,
  activeItem,
  surface = "card",
  quantityComparison,
  itemQuantityBreakdown,
  studentItemsMap,
  initialStudentItems,
  onQuantityChange,
  students,
  isAuthenticated,
  onSave,
}: FavoriteLevelCardProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const isSheetSurface = surface === "sheet";
  const { saveError, saveSuccess, isSaving, hasChanges, changedStudents, handleSave } = useSaveStudentItems({
    studentItemsMap,
    initialStudentItems,
    levelStudents,
    students,
    activeItem,
    isAuthenticated,
    onSave,
  });

  const totalCount = levelStudents
    .map((student) => studentItemsMap.get(student.uid)?.items[activeItem.itemUid] ?? 0)
    .reduce((acc, count) => acc + count, 0);

  const handleCancelEdit = () => {
    for (const studentUid of changedStudents) {
      const initialQuantity = initialStudentItems.get(studentUid)?.items[activeItem.itemUid] ?? 0;
      onQuantityChange(studentUid, activeItem.itemUid, initialQuantity);
    }
    setIsEditMode(false);
  };

  const handleEnterEditMode = () => {
    setIsEditMode(true);
  };

  return (
    <div
      className={cn(
        "flex flex-col 2xl:mt-0",
        surface === "card" ? "rounded-lg border border-border bg-card p-4" : "bg-transparent",
      )}
    >
      <div className={cn("mb-4 flex items-center gap-3 pb-3", !isSheetSurface && "border-b border-border")}>
        <ResourceCard
          rarity={activeItem.itemRarity}
          itemUid={activeItem.itemUid}
          favoriteLevel={Number.parseInt(favoriteLevel)}
        />
        <div className="flex-1 min-w-0">
          <p className="truncate font-medium">{activeItem.itemName}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">+{exp} EXP</p>
          {!isSheetSurface && quantityComparison ? (
            <ItemQuantitySummary
              comparison={quantityComparison}
              breakdown={itemQuantityBreakdown}
              className="mt-1 justify-start text-left"
            />
          ) : null}
        </div>
        {!isSheetSurface && (
          <div className="shrink-0">
            <span className="text-sm">{totalCount}개</span>
          </div>
        )}
      </div>
      {isEditMode ? (
        <FavoriteLevelCardEditMode
          levelStudents={levelStudents}
          activeItem={activeItem}
          studentItemsMap={studentItemsMap}
          onQuantityChange={onQuantityChange}
          saveError={saveError}
          saveSuccess={saveSuccess}
          isSaving={isSaving}
          hasChanges={hasChanges}
          changedStudentCount={changedStudents.length}
          onSave={handleSave}
          onCancel={handleCancelEdit}
        />
      ) : (
        <FavoriteLevelCardViewMode
          levelStudents={levelStudents}
          activeItem={activeItem}
          studentItemsMap={studentItemsMap}
          isAuthenticated={isAuthenticated}
          onEnterEditMode={handleEnterEditMode}
        />
      )}
    </div>
  );
}

function getItemQuantityComparison(
  itemUid: string,
  itemCounts: Map<string, number>,
  ownedQuantities: Record<string, number> | null,
): ItemQuantityComparison | null {
  if (ownedQuantities === null) {
    return null;
  }

  const requiredQuantity = itemCounts.get(itemUid) ?? 0;
  const ownedQuantity = ownedQuantities[itemUid] ?? 0;

  return {
    requiredQuantity,
    ownedQuantity,
    isInsufficient: ownedQuantity < requiredQuantity,
  };
}

function ItemQuantitySummary({
  comparison,
  breakdown,
  className,
}: {
  comparison: ItemQuantityComparison;
  breakdown?: ItemQuantityBreakdownEntry[];
  className?: string;
}) {
  const isDimmed = comparison.requiredQuantity === 0;
  const hasBreakdown = breakdown && breakdown.length > 0;

  const requiredEntry = (
    <span>
      <span className={cn(hasBreakdown && "underline decoration-dotted underline-offset-2")}>필요</span>{" "}
      <span className="font-semibold tabular-nums text-foreground">{comparison.requiredQuantity.toLocaleString()}</span>
    </span>
  );

  return (
    <div
      className={cn(
        "mt-1 flex flex-wrap justify-center gap-x-1.5 gap-y-px text-center text-xs leading-tight text-muted-foreground",
        className,
      )}
    >
      <span className={cn(isDimmed && "opacity-40")}>
        {hasBreakdown ? (
          <HoverTooltip
            as="span"
            focusable
            content={<QuantityBreakdownTooltipContent breakdown={breakdown} />}
            className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            contentClassName="px-3 py-2"
          >
            {requiredEntry}
          </HoverTooltip>
        ) : (
          requiredEntry
        )}
      </span>
      <span className={cn(isDimmed && "opacity-40")}>
        보유{" "}
        <span
          className={cn(
            "font-semibold tabular-nums text-foreground",
            comparison.isInsufficient && INSUFFICIENT_QUANTITY_CLASS,
          )}
        >
          {comparison.ownedQuantity.toLocaleString()}
        </span>
      </span>
    </div>
  );
}

function buildItemQuantityBreakdowns(
  students: StudentWithRelationship[],
  studentItemsMap: StudentItemsMap,
): Record<string, ItemQuantityBreakdownEntry[]> {
  const studentsByUid = new Map(students.map((student) => [student.uid, student]));
  const breakdowns: Record<string, ItemQuantityBreakdownEntry[]> = {};

  for (const studentItem of studentItemsMap.values()) {
    const student = studentsByUid.get(studentItem.uid);
    if (!student) {
      continue;
    }

    for (const [itemUid, quantity] of Object.entries(studentItem.items)) {
      if (quantity <= 0) {
        continue;
      }

      breakdowns[itemUid] = [
        ...(breakdowns[itemUid] ?? []),
        {
          studentUid: student.uid,
          name: student.name,
          quantity,
        },
      ];
    }
  }

  for (const entries of Object.values(breakdowns)) {
    entries.sort((a, b) => {
      if (a.quantity !== b.quantity) {
        return b.quantity - a.quantity;
      }
      return a.name.localeCompare(b.name, "ko");
    });
  }

  return breakdowns;
}
