import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import {
  convertRelationshipShortfall,
  getAvailableOwnedGiftQuantities,
  getOwnedGiftPlanQuantities,
  getRelationshipLevelForExp,
  getRelationshipShortfallSummary,
  groupStudentGiftsByExp,
  type RelationshipGiftQuantityBreakdown,
} from "~/domain/relationship-gifts";
import type { RelationshipStudent } from "~/components/v2/features/relationship/RelationshipStudentPicker";
import { RelationshipResultBlock } from "~/components/v2/features/relationship/RelationshipResultBlock";
import { RelationshipGiftTile } from "~/components/v2/features/relationship/RelationshipGiftTile";
import { getAccumulatedRelationshipExpForLevel } from "~/domain/relationship-level";
import type { NumberInputFlowNavigationInputProps } from "~/components/v2/primitives/useNumberInputFlowNavigation";
import { useNumberInputFlowNavigation } from "~/components/v2/primitives/useNumberInputFlowNavigation";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Button } from "~/components/v2/primitives/Button";
import { Switch } from "~/components/v2/primitives/Switch";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { studentImageUrl } from "~/models/assets";
import { STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";
import { cn } from "~/lib/utils";
import { useRelationshipStudentItems } from "./use-relationship-student-items";
import type { RelationshipGiftCalculationMode } from "./relationship-types";

type RelationshipState = {
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
  items: Record<string, number>;
};

type ScreenStudent = RelationshipStudent & { currentExp: number | null; targetLevel: number | null };

const formatNumber = (value: number) => value.toLocaleString("en-US");

export function RelationshipStudentScreen({
  student,
  isAuthenticated,
  nullableSemantics,
  relationship,
  giftCalculationMode,
  onGiftCalculationModeChange,
  saveState,
  saveError,
  saveSuccess,
  staleWriteBlocked,
  onRetry,
  requiredQuantities,
  quantityBreakdowns,
  ownedQuantities,
  onRelationshipChange,
  onDelete,
  onSignIn,
  onChooseAnotherStudent,
}: {
  student: ScreenStudent;
  isAuthenticated: boolean;
  nullableSemantics: boolean;
  relationship: RelationshipState;
  giftCalculationMode: RelationshipGiftCalculationMode;
  onGiftCalculationModeChange: (mode: RelationshipGiftCalculationMode) => void;
  saveState: "idle" | "pending" | "submitting" | "loading";
  saveError: string | null;
  saveSuccess: boolean;
  staleWriteBlocked: boolean;
  onRetry: (() => void) | null;
  requiredQuantities: Record<string, number>;
  quantityBreakdowns: RelationshipGiftQuantityBreakdown["breakdowns"];
  ownedQuantities: Record<string, number> | null;
  onRelationshipChange: Dispatch<SetStateAction<RelationshipState>>;
  onDelete: () => void;
  onSignIn: () => void;
  onChooseAnotherStudent: () => void;
}) {
  const favoriteItemsState = useRelationshipStudentItems(student.uid);
  const [excludeOtherStudents, setExcludeOtherStudents] = useState(false);
  const [filterFavorited, setFilterFavorited] = useState(true);
  const [useCurrentExp, setUseCurrentExp] = useState(relationship.currentExp !== null);
  const inputNavigation = useNumberInputFlowNavigation();
  const manualModeRef = useRef<HTMLButtonElement>(null);
  const ownedModeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setUseCurrentExp(relationship.currentExp !== null), [relationship.currentExp]);

  const currentExp =
    relationship.currentExp ??
    (relationship.currentLevel == null ? null : getAccumulatedRelationshipExpForLevel(relationship.currentLevel));
  const { favoriteItems } = favoriteItemsState.status === "ready" ? favoriteItemsState : { favoriteItems: [] };
  const availableOwnedQuantities = useMemo(
    () =>
      getOwnedGiftPlanQuantities(
        favoriteItems,
        getAvailableOwnedGiftQuantities(ownedQuantities ?? {}, quantityBreakdowns, student.uid, excludeOtherStudents),
      ),
    [favoriteItems, ownedQuantities, quantityBreakdowns, student.uid, excludeOtherStudents],
  );
  const quantities = giftCalculationMode === "owned" ? availableOwnedQuantities : relationship.items;
  const itemExp = useMemo(
    () => favoriteItems.reduce((total, gift) => total + gift.exp * (quantities[gift.item.uid] ?? 0), 0),
    [favoriteItems, quantities],
  );
  const giftCount = favoriteItems.reduce((total, gift) => total + (quantities[gift.item.uid] ?? 0), 0);
  const allocatedCount = excludeOtherStudents
    ? favoriteItems.reduce(
        (total, gift) =>
          total +
          (quantityBreakdowns[gift.item.uid] ?? [])
            .filter((entry) => entry.studentUid !== student.uid)
            .reduce((quantity, entry) => quantity + entry.quantity, 0),
        0,
      )
    : 0;
  const hasOtherStudentAllocation =
    excludeOtherStudents &&
    favoriteItems.some((gift) =>
      (quantityBreakdowns[gift.item.uid] ?? []).some((entry) => entry.studentUid !== student.uid && entry.quantity > 0),
    );
  const hasOwnedGift = favoriteItems.some((gift) => (ownedQuantities?.[gift.item.uid] ?? 0) > 0);
  const noAvailableGiftsAfterExclusion =
    giftCalculationMode === "owned" &&
    excludeOtherStudents &&
    giftCount === 0 &&
    hasOwnedGift &&
    hasOtherStudentAllocation;
  const result =
    favoriteItemsState.status === "ready"
      ? getRelationshipShortfallSummary({
          currentLevel: relationship.currentLevel,
          currentExp,
          targetLevel: relationship.targetLevel,
          giftExp: itemExp,
        })
      : null;
  const giftGroups = useMemo(() => groupStudentGiftsByExp(favoriteItems), [favoriteItems]);
  const shortfallRows = result ? convertRelationshipShortfall(result.remainingExp, giftGroups) : [];
  const visibleGifts = useMemo(() => {
    const allGifts = favoriteItems.filter((gift) =>
      giftCalculationMode === "owned"
        ? (ownedQuantities?.[gift.item.uid] ?? 0) > 0
        : filterFavorited
          ? gift.favorited
          : true,
    );
    return allGifts.sort(
      (a, b) =>
        b.item.rarity - a.item.rarity || b.favoriteLevel - a.favoriteLevel || Number(a.item.uid) - Number(b.item.uid),
    );
  }, [favoriteItems, filterFavorited, giftCalculationMode, ownedQuantities]);
  const isLoading = favoriteItemsState.status === "loading";
  const hasGiftError = favoriteItemsState.status === "error";
  const missingInputNames = [
    relationship.currentLevel == null ? "현재 랭크" : null,
    relationship.targetLevel == null ? "목표 랭크" : null,
  ].filter((name): name is string => name !== null);
  const pendingMessage =
    missingInputNames.length > 1
      ? `${missingInputNames[0]}와 ${missingInputNames[1]}를 입력하면 계산할 수 있어요.`
      : missingInputNames.length === 1
        ? `${missingInputNames[0]}를 입력하면 계산할 수 있어요.`
        : "계산할 수 없어요.";
  const hasGiftPlan = Object.values(relationship.items).some((quantity) => quantity > 0);

  const chooseGiftMode = (mode: "manual" | "owned") => {
    if (mode === "owned" && !isAuthenticated) {
      onSignIn();
      return;
    }
    onGiftCalculationModeChange(mode);
  };

  const handleGiftCalculationModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();

    const nextMode = giftCalculationMode === "manual" ? "owned" : "manual";
    if (nextMode === "owned" && !isAuthenticated) {
      chooseGiftMode(nextMode);
      return;
    }

    chooseGiftMode(nextMode);
    (nextMode === "manual" ? manualModeRef : ownedModeRef).current?.focus();
  };

  const handleSaveOwnedPlan = () => {
    if (giftCount <= 0) return;
    if (hasGiftPlan && !window.confirm("현재 학생의 기존 선물 계획을 보유 선물 수량으로 변경할까요?")) return;
    onRelationshipChange((previous) => ({ ...previous, items: availableOwnedQuantities }));
    onGiftCalculationModeChange("manual");
  };

  const handleCurrentExpChange = (exp: number | null) => {
    onRelationshipChange((previous) => ({
      ...previous,
      currentExp: exp,
      currentLevel: exp == null ? previous.currentLevel : getRelationshipLevelForExp(exp),
    }));
  };

  const updateQuantity = (itemUid: string, quantity: number) => {
    onRelationshipChange((previous) => ({ ...previous, items: { ...previous.items, [itemUid]: quantity } }));
  };

  return (
    <div className="min-w-0 space-y-v2-block-gap">
      <header className="flex min-w-0 items-center gap-3">
        <img src={studentImageUrl(student.uid)} alt="" className="size-10 shrink-0 rounded-md object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-v2-fg">{student.name}</p>
          {saveState !== "idle" ? (
            <p role="status" className="text-xs text-v2-fg-tertiary">
              저장 중
            </p>
          ) : saveSuccess ? (
            <p role="status" className="text-xs text-v2-success">
              저장됨
            </p>
          ) : !isAuthenticated ? (
            <p role="status" className="text-xs text-v2-fg-tertiary">
              로그인하면 입력한 내용이 저장돼요
            </p>
          ) : null}
        </div>
        <Button variant="text" onClick={onChooseAnotherStudent} className="shrink-0 px-2 text-xs">
          다른 학생
        </Button>
      </header>
      {saveError || staleWriteBlocked ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-v2-warning">
          <span>{staleWriteBlocked ? STUDENT_STATE_STALE_MESSAGE : saveError}</span>
          {staleWriteBlocked ? (
            <Button onClick={() => window.location.reload()} className="min-h-9 px-2 text-xs">
              새로고침
            </Button>
          ) : onRetry ? (
            <Button onClick={onRetry} className="min-h-9 px-2 text-xs">
              다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}

      <RelationshipResultBlock
        state={isLoading ? "loading" : hasGiftError ? "error" : "ready"}
        result={result}
        targetLevel={relationship.targetLevel}
        shortfallRows={shortfallRows}
        inventoryMode={giftCalculationMode === "owned"}
        excludeOtherStudents={excludeOtherStudents}
        pendingMessage={pendingMessage}
        onRetry={favoriteItemsState.retry}
        rankInputs={
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-v2-fg">인연 랭크</h2>
              <Switch
                id="relationship-current-exp"
                checked={useCurrentExp}
                onCheckedChange={setUseCurrentExp}
                label="현재 EXP로 입력"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                {useCurrentExp ? (
                  nullableSemantics ? (
                    <NumberInput
                      label="현재 EXP"
                      size="md"
                      value={currentExp}
                      nullable
                      minValue={0}
                      inputProps={{ "aria-label": `${student.name} 현재 EXP` }}
                      onChange={handleCurrentExpChange}
                    />
                  ) : (
                    <NumberInput
                      label="현재 EXP"
                      size="md"
                      value={currentExp ?? 0}
                      minValue={0}
                      inputProps={{ "aria-label": `${student.name} 현재 EXP` }}
                      onChange={(value) => handleCurrentExpChange(value)}
                    />
                  )
                ) : nullableSemantics ? (
                  <NumberInput
                    label="현재 랭크"
                    size="md"
                    value={relationship.currentLevel}
                    nullable
                    minValue={1}
                    maxValue={100}
                    inputProps={{ "aria-label": `${student.name} 현재 랭크` }}
                    onChange={(value) =>
                      onRelationshipChange((previous) => ({ ...previous, currentLevel: value, currentExp: null }))
                    }
                  />
                ) : (
                  <NumberInput
                    label="현재 랭크"
                    size="md"
                    value={relationship.currentLevel ?? 1}
                    minValue={1}
                    maxValue={100}
                    inputProps={{ "aria-label": `${student.name} 현재 랭크` }}
                    onChange={(value) =>
                      onRelationshipChange((previous) => ({ ...previous, currentLevel: value, currentExp: null }))
                    }
                  />
                )}
                {relationship.currentLevel == null && nullableSemantics ? (
                  <p className="mt-1 text-xs text-v2-fg-tertiary">현재 랭크를 입력하면 계산할 수 있어요.</p>
                ) : (
                  <p className="mt-1 truncate text-xs text-v2-fg-tertiary">
                    {useCurrentExp
                      ? `랭크 ${formatNumber(getRelationshipLevelForExp(currentExp ?? 0))}`
                      : `누적 ${formatNumber(getAccumulatedRelationshipExpForLevel(relationship.currentLevel ?? 1))} EXP`}
                  </p>
                )}
              </div>
              <div>
                {nullableSemantics ? (
                  <NumberInput
                    label="목표 랭크"
                    size="md"
                    value={relationship.targetLevel}
                    nullable
                    minValue={1}
                    maxValue={100}
                    inputProps={{ "aria-label": `${student.name} 목표 랭크` }}
                    onChange={(value) => onRelationshipChange((previous) => ({ ...previous, targetLevel: value }))}
                  />
                ) : (
                  <NumberInput
                    label="목표 랭크"
                    size="md"
                    value={relationship.targetLevel ?? 50}
                    minValue={1}
                    maxValue={100}
                    inputProps={{ "aria-label": `${student.name} 목표 랭크` }}
                    onChange={(value) => onRelationshipChange((previous) => ({ ...previous, targetLevel: value }))}
                  />
                )}
              </div>
            </div>
          </div>
        }
      />

      <section className="rounded-lg bg-v2-surface p-v2-block-p">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-v2-fg">선물</h2>
          <div role="radiogroup" aria-label="계산 방식" className="inline-flex rounded-md bg-v2-inset p-0.5">
            {/* biome-ignore lint/a11y/useSemanticElements: Segmented radio buttons retain the existing roving focus and arrow-key behavior. */}
            <button
              ref={manualModeRef}
              type="button"
              role="radio"
              aria-checked={giftCalculationMode === "manual"}
              tabIndex={giftCalculationMode === "manual" ? 0 : -1}
              onClick={() => chooseGiftMode("manual")}
              onKeyDown={handleGiftCalculationModeKeyDown}
              className={cn(
                "inline-flex min-h-7 items-center rounded-[5px] px-2.5 text-xs",
                v2FocusRing,
                giftCalculationMode === "manual"
                  ? "bg-v2-surface text-v2-fg font-medium"
                  : "text-v2-fg-secondary hover:bg-v2-hover",
              )}
            >
              직접 입력
            </button>
            {/* biome-ignore lint/a11y/useSemanticElements: Segmented radio buttons retain the existing roving focus and arrow-key behavior. */}
            <button
              ref={ownedModeRef}
              type="button"
              role="radio"
              aria-checked={giftCalculationMode === "owned"}
              tabIndex={giftCalculationMode === "owned" ? 0 : -1}
              onClick={() => chooseGiftMode("owned")}
              onKeyDown={handleGiftCalculationModeKeyDown}
              className={cn(
                "inline-flex min-h-7 items-center rounded-[5px] px-2.5 text-xs",
                v2FocusRing,
                giftCalculationMode === "owned"
                  ? "bg-v2-surface text-v2-fg font-medium"
                  : "text-v2-fg-secondary hover:bg-v2-hover",
              )}
            >
              보유 선물 기준
            </button>
          </div>
        </div>
        {giftCalculationMode === "owned" ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip pressed={!excludeOtherStudents} onPressedChange={() => setExcludeOtherStudents(false)}>
                전체 보유
              </ToggleChip>
              <ToggleChip pressed={excludeOtherStudents} onPressedChange={() => setExcludeOtherStudents(true)}>
                다른 학생 배정분 제외
              </ToggleChip>
            </div>
            <Button
              onClick={handleSaveOwnedPlan}
              disabled={giftCount <= 0 || staleWriteBlocked}
              className="min-h-9 px-2 text-xs"
            >
              선물 계획으로 저장
            </Button>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Switch
              id="relationship-favorite-only"
              checked={filterFavorited}
              onCheckedChange={setFilterFavorited}
              label="좋아하는 선물만"
            />
            <p className="text-xs tabular-nums text-v2-fg-secondary">
              {formatNumber(giftCount)}개 · +{formatNumber(itemExp)} EXP
            </p>
          </div>
        )}
        {giftCalculationMode === "owned" ? (
          <p className="mb-3 text-right text-xs tabular-nums text-v2-fg-secondary">
            {formatNumber(giftCount)}개 · +{formatNumber(itemExp)} EXP
            {excludeOtherStudents ? ` · ${formatNumber(allocatedCount)}개 제외` : ""}
          </p>
        ) : null}
        {noAvailableGiftsAfterExclusion && visibleGifts.length > 0 ? (
          <p className="mb-3 text-sm text-v2-fg-secondary">다른 학생 배정분을 제외하면 남은 선물이 없어요.</p>
        ) : null}
        {isLoading ? (
          <GiftGridSkeleton />
        ) : hasGiftError ? (
          <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
            <p className="text-sm text-v2-fg-secondary">선물 목록을 불러오지 못했어요.</p>
            <Button onClick={favoriteItemsState.retry} className="min-h-9">
              다시 시도
            </Button>
          </div>
        ) : favoriteItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-v2-fg-secondary">선물 정보가 없어요.</p>
        ) : visibleGifts.length === 0 ? (
          <p className="py-6 text-center text-sm text-v2-fg-secondary">
            {giftCalculationMode === "owned"
              ? noAvailableGiftsAfterExclusion
                ? "다른 학생 배정분을 제외하면 남은 선물이 없어요."
                : "재화 플래너에 등록된 보유 선물이 없어요."
              : "표시할 선물이 없어요."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,6.5rem)]">
            {visibleGifts.map((gift) => {
              const breakdown = quantityBreakdowns[gift.item.uid] ?? [];
              const allocatedToOthers = breakdown
                .filter((entry) => entry.studentUid !== student.uid)
                .reduce((total, entry) => total + entry.quantity, 0);
              const originalOwned = ownedQuantities?.[gift.item.uid] ?? 0;
              const quantity = quantities[gift.item.uid] ?? 0;
              const inputProps: NumberInputFlowNavigationInputProps = inputNavigation.getInputProps({
                disabled: staleWriteBlocked,
              });
              return (
                <RelationshipGiftTile
                  key={gift.item.uid}
                  gift={gift}
                  quantity={quantity}
                  ownedMode={giftCalculationMode === "owned"}
                  excludeOtherStudents={excludeOtherStudents}
                  requiredQuantity={requiredQuantities[gift.item.uid] ?? 0}
                  ownedQuantity={originalOwned}
                  allocatedQuantity={allocatedToOthers}
                  breakdown={breakdown}
                  showQuantityComparison={ownedQuantities !== null}
                  inputProps={inputProps}
                  disabled={staleWriteBlocked}
                  onQuantityChange={
                    giftCalculationMode === "manual"
                      ? (nextQuantity) => updateQuantity(gift.item.uid, nextQuantity)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {student.hasSavedState ? (
        <div className="flex justify-end">
          <Button variant="danger" onClick={onDelete}>
            초기화
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function GiftGridSkeleton() {
  return (
    <section
      className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,6.5rem)]"
      aria-label="선물 목록 불러오는 중"
    >
      {[1, 2, 3, 4, 5, 6].map((slot) => (
        <div key={slot} className="flex w-full min-w-0 flex-col items-center gap-1.5 text-center">
          <Skeleton className="size-13 md:size-16" />
          <Skeleton className="h-8 w-full" />
          <div className="mt-0.5 flex w-full flex-col items-center">
            <Skeleton className="h-4.5 w-12" />
            <Skeleton className="h-4.5 w-16" />
          </div>
        </div>
      ))}
    </section>
  );
}
