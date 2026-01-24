import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Await, useFetcher, useRevalidator } from "react-router";
import { NumberInput } from "~/components/atoms/form";
import { ResourceCard } from "~/components/atoms/item";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { ProfileImage } from "~/components/atoms/student";
import { SubTitle } from "~/components/atoms/typography";
import { MiniButton } from "~/components/ui";
import { COMMON_FAVORITE_ITEM_UIDS, type AllStudentsFavoriteItems } from "~/models/resource";
import type { action } from "~/routes/utils.relationship";

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

type FavoritedItemSelectorProps = {
  items: Promise<AllStudentsFavoriteItems[]>;
  students: StudentWithRelationship[];
  isAuthenticated: boolean;
};

export default function FavoritedItemSelector({ items, students, isAuthenticated }: FavoritedItemSelectorProps) {
  const [activeItem, setActiveItem] = useState<AllStudentsFavoriteItems | null>(null);
  const [studentItemsState, setStudentItemsState] = useState<StudentItemsMap>(new Map());
  const [initialStudentItems, setInitialStudentItems] = useState<StudentItemsMap>(new Map());

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
      Object.entries(studentItem.items).forEach(([itemUid, count]) => {
        _itemCounts.set(itemUid, (_itemCounts.get(itemUid) ?? 0) + count);
      });
    }
    return _itemCounts;
  }, [studentItemsState]);

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
            let gridClass = "xl:grid-cols-2";
            if (gridCount === 1) {
              gridClass = "xl:grid-cols-1";
            } else if (gridCount === 3) {
              gridClass = "xl:grid-cols-3";
            }

            return (
              <>
                <ItemSelector
                  items={items}
                  itemCounts={itemCounts}
                  onSelectItem={(itemUid) => setActiveItem(items.find((item) => item.itemUid === itemUid) ?? null)}
                />
                {activeItem && (
                  <div className={`grid grid-cols-1 ${gridClass} gap-4`}>
                    {Object.entries(activeItem.favoriteLevels)
                      .sort((a, b) => Number(b[0]) - Number(a[0]))
                      .map(([favoriteLevel, { exp, students: levelStudents }]) => (
                        <FavoriteLevelCard
                          key={favoriteLevel}
                          favoriteLevel={favoriteLevel}
                          exp={exp}
                          levelStudents={levelStudents}
                          activeItem={activeItem}
                          studentItemsMap={studentItemsState}
                          initialStudentItems={initialStudentItems}
                          onQuantityChange={handleQuantityChange}
                          students={students}
                          isAuthenticated={isAuthenticated}
                          onSave={handleSave}
                        />
                      ))}
                  </div>
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
  itemCounts: Map<string, number>;
  onSelectItem: (itemUid: string) => void;
};

function ItemSelector({ items, itemCounts, onSelectItem }: ItemSelectorProps) {
  return (
    <div>
      <SubTitle
        text="선물 목록"
        description="선물을 선호하는 학생을 확인하고 필요한 개수를 계산할 수 있어요"
      />
      <div className="flex flex-wrap gap-1">
        {items.map(({ itemUid, itemName, itemRarity }) => {
          return (
            <div key={itemUid} className="hover:scale-105 cursor-pointer transition" onClick={() => onSelectItem(itemUid)}>
              <ResourceCard rarity={itemRarity} itemUid={itemUid} name={itemName} size="lg" label={itemCounts.get(itemUid)} />
            </div>
          );
        })}
      </div>
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

function useSaveStudentItems({ studentItemsMap, initialStudentItems, levelStudents, students, activeItem, isAuthenticated, onSave }: UseSaveStudentItemsParams) {
  const revalidator = useRevalidator();
  const saveFetcher = useFetcher<typeof action>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const lastSuccessRef = useRef<Set<string>>(new Set());

  // Check if student's items have changed from initial state
  const hasChanged = (studentUid: string, itemUid: string): boolean => {
    const current = studentItemsMap.get(studentUid)?.items[itemUid] ?? 0;
    const initial = initialStudentItems.get(studentUid)?.items[itemUid] ?? 0;
    return current !== initial;
  };

  // Get changed students for this level (memoized to prevent unnecessary effect re-runs)
  const changedStudents = useMemo(() => {
    return levelStudents
      .filter((student) => hasChanged(student.uid, activeItem.itemUid))
      .map((student) => student.uid);
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
  onSave: () => void;
  onCancel: () => void;
};

function FavoriteLevelCardEditMode({ levelStudents, activeItem, studentItemsMap, onQuantityChange, saveError, saveSuccess, isSaving, hasChanges, onSave, onCancel }: FavoriteLevelCardEditModeProps) {
  return (
    <>
      <div className="flex-1 space-y-1">
        {levelStudents.map((student) => (
          <div key={student.uid} className="flex items-center gap-2">
            <div className="shrink-0">
              <ProfileImage studentUid={student.uid} imageSize={8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{student.name}</p>
            </div>
            <div className="shrink-0 w-20">
              <NumberInput
                value={studentItemsMap.get(student.uid)?.items[activeItem.itemUid] ?? 0}
                onChange={(value) => onQuantityChange(student.uid, activeItem.itemUid, value)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
            {saveSuccess && <p className="text-xs text-green-600 dark:text-green-400">저장 완료</p>}
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <MiniButton
                text={isSaving ? "저장 중..." : "변경 사항 저장"}
                onClick={onSave}
                color="blue"
              />
            )}
            <MiniButton text="닫기" onClick={onCancel} color="default" />
          </div>
        </div>
      </div>
    </>
  );
}

type FavoriteLevelCardViewModeProps = {
  levelStudents: Array<{ uid: string; name: string }>;
  activeItem: AllStudentsFavoriteItems;
  studentItemsMap: StudentItemsMap;
  isAuthenticated: boolean;
  onEnterEditMode: () => void;
};

function FavoriteLevelCardViewMode({ levelStudents, activeItem, studentItemsMap, isAuthenticated, onEnterEditMode }: FavoriteLevelCardViewModeProps) {
  return (
    <>
      <div className="flex-1">
        {COMMON_FAVORITE_ITEM_UIDS.includes(activeItem.itemUid) ? (
          <div className="py-8 flex-1">
            <p className="text-sm text-center text-neutral-500 dark:text-neutral-400">모든 학생</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 items-start">
            {levelStudents.map((student) => {
              const quantity = studentItemsMap.get(student.uid)?.items[activeItem.itemUid] ?? 0;
              return (
                <div key={student.uid} className="relative">
                  <ProfileImage studentUid={student.uid} imageSize={12} />
                  {quantity > 0 && (
                    <div className="absolute -bottom-1 -right-1 bg-red-500 text-white text-xs font-medium rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1 border-2 border-white dark:border-neutral-900">
                      {quantity}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {isAuthenticated && (
        <div className="mt-4 flex justify-end">
          <MiniButton text="선물 개수 입력" onClick={onEnterEditMode} color="default" />
        </div>
      )}
    </>
  );
}

function FavoriteLevelCard({ favoriteLevel, exp, levelStudents, activeItem, studentItemsMap, initialStudentItems, onQuantityChange, students, isAuthenticated, onSave }: FavoriteLevelCardProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const { saveError, saveSuccess, isSaving, hasChanges, handleSave } = useSaveStudentItems({
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

  return (
    <div className="mt-8 bg-neutral-100 dark:bg-neutral-900 rounded-lg p-4 flex flex-col">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-700">
        <ResourceCard rarity={activeItem.itemRarity} itemUid={activeItem.itemUid} favoriteLevel={parseInt(favoriteLevel)} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{activeItem.itemName}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">+{exp} EXP</p>
        </div>
        <div className="shrink-0">
          <span className="text-sm">{totalCount}개</span>
        </div>
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
          onSave={handleSave}
          onCancel={() => setIsEditMode(false)}
        />
      ) : (
        <FavoriteLevelCardViewMode
          levelStudents={levelStudents}
          activeItem={activeItem}
          studentItemsMap={studentItemsMap}
          isAuthenticated={isAuthenticated}
          onEnterEditMode={() => setIsEditMode(true)}
        />
      )}
    </div>
  );
}
