import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import Decimal from "decimal.js";
import { useId, useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { Button } from "~/components/v2/primitives/Button";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { CurrencyIcon, formatCount, Segmented, ShopSection, ShopSectionHeader } from "./shop-ui";

type BonusItem = EventShopPlanContext["eventRewardBonus"][number];
type RoleFilter = "all" | "striker" | "special" | "recruited";

const noFavorite = { visible: false, icon: "unfavorited" as const, countText: null, accessibleName: "관심 학생" };

function percent(value: Decimal) {
  return value.mul(100).toFixed(0);
}

export function ShopBonusSection({ plan }: { plan: EventShopPlanContext }) {
  const bonusItems = plan.eventRewardBonus.filter(({ rewardBonuses }) => rewardBonuses.length > 0);
  const students = bonusStudents(bonusItems);
  const mode = plan.state.bonusStudentSelectionMode;
  // Shared mode opens one picker under the cards; per-currency mode opens the picker of the chosen currency.
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const pickerId = useId();
  if (bonusItems.length === 0) return null;
  const itemUids = bonusItems.map(({ uid }) => uid);
  const sharedSelected = students.filter(({ uid }) => plan.state.selectedBonusStudentUids.includes(uid)).length;
  const hasSelection =
    plan.state.selectedBonusStudentUids.length > 0 ||
    Object.values(plan.state.selectedBonusStudentUidsByItem).some((uids) => uids.length > 0);

  const chooseAll = () => {
    const uids = students.map(({ uid }) => uid);
    plan.actions.setBonusStudents(uids);
    if (mode === "perItem") plan.actions.setBonusStudentsForItems(itemUids, uids);
  };
  const clear = () => {
    plan.actions.setBonusStudents([]);
    if (mode === "perItem") plan.actions.setBonusStudentsForItems(itemUids, []);
  };
  const applyRecruited = () => {
    plan.actions.setBonusStudents([...new Set([...plan.state.selectedBonusStudentUids, ...plan.recruitedStudentUids])]);
    if (mode === "perItem") {
      for (const studentUid of plan.recruitedStudentUids)
        plan.actions.setBonusStudentForItems(itemUids, studentUid, true);
    }
  };
  const pickerItem = mode === "perItem" ? bonusItems.find(({ uid }) => uid === openPicker) : undefined;

  return (
    <ShopSection id="student-bonus-title" region="student-bonus">
      <ShopSectionHeader
        id="student-bonus-title"
        title="학생 보너스"
        actions={
          <Segmented
            label="보너스 학생 고르는 방식"
            value={mode}
            options={[
              { value: "shared", label: "모든 재화 같은 학생" },
              { value: "perItem", label: "재화마다 따로" },
            ]}
            onChange={(next) => {
              setOpenPicker(null);
              plan.actions.setBonusStudentSelectionMode(next, itemUids);
            }}
          />
        }
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {bonusItems.map((item) => {
          const summary = plan.bonusSummary?.find(({ uid }) => uid === item.uid);
          const applied = summary ? summary.appliedStrikerRatio.plus(summary.appliedSpecialRatio) : new Decimal(0);
          const maximum = summary ? summary.maxStrikerRatio.plus(summary.maxSpecialRatio) : new Decimal(0);
          const selectedForItem = selectedUidsForItem(plan, item.uid);
          const itemStudentCount = item.rewardBonuses.length;
          const itemSelectedCount = item.rewardBonuses.filter(({ student }) =>
            selectedForItem.includes(student.uid),
          ).length;
          const pickerOpen = openPicker === item.uid;
          return (
            <div key={item.uid} className="flex min-w-0 flex-col gap-2.5 rounded-lg bg-v2-surface p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ResourceThumb
                  itemUid={item.uid}
                  resourceType={ResourceTypeEnum.Item}
                  name={item.name}
                  rarity={1}
                  size="drop"
                  tooltip
                />
                <div className="min-w-0 grow">
                  <p className="truncate text-sm font-semibold text-v2-fg">{item.name}</p>
                  <p className="flex items-baseline gap-1.5 tabular-nums">
                    <span
                      className={cn(
                        "text-lg font-bold",
                        summary && applied.gte(maximum) && maximum.gt(0) ? "text-v2-success" : "text-v2-fg",
                      )}
                    >
                      {summary ? `${percent(applied)}%` : "—"}
                    </span>
                    <span className="text-xs text-v2-fg-tertiary">최대 {summary ? `${percent(maximum)}%` : "—"}</span>
                  </p>
                </div>
              </div>
              {mode === "perItem" ? (
                <Button
                  size="sm"
                  className="w-full"
                  aria-expanded={pickerOpen}
                  aria-controls={pickerOpen ? pickerId : undefined}
                  onClick={() => setOpenPicker(pickerOpen ? null : item.uid)}
                >
                  학생 선택 · {formatCount(itemSelectedCount)} / {formatCount(itemStudentCount)}
                  {pickerOpen ? (
                    <ChevronUpIcon className="size-4" aria-hidden="true" />
                  ) : (
                    <ChevronDownIcon className="size-4" aria-hidden="true" />
                  )}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-v2-fg-tertiary">
        재화마다 보너스가 높은 학생부터 스트라이커 4명, 스페셜 2명까지 적용돼요.
      </p>
      {mode === "shared" && openPicker === "shared" ? (
        <BonusStudentPicker id={pickerId} plan={plan} bonusItems={bonusItems} students={students} />
      ) : pickerItem ? (
        <BonusStudentPicker
          id={pickerId}
          plan={plan}
          bonusItems={[pickerItem]}
          students={bonusStudents([pickerItem])}
          item={pickerItem}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "shared" ? (
          <Button
            size="sm"
            aria-expanded={openPicker === "shared"}
            aria-controls={openPicker === "shared" ? pickerId : undefined}
            onClick={() => setOpenPicker(openPicker === "shared" ? null : "shared")}
          >
            {openPicker === "shared" ? (
              <>
                접기
                <ChevronUpIcon className="size-4" aria-hidden="true" />
              </>
            ) : (
              <>
                학생 선택 · {formatCount(sharedSelected)} / {formatCount(students.length)}
                <ChevronDownIcon className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            disabled={!plan.signedIn || plan.recruitedStudentUids.length === 0}
            onClick={applyRecruited}
          >
            보유 학생 반영
          </Button>
          <Button size="sm" onClick={chooseAll}>
            모두 선택
          </Button>
          <Button size="sm" variant="danger-subtle" disabled={!hasSelection} onClick={clear}>
            초기화
          </Button>
        </div>
      </div>
    </ShopSection>
  );
}

function BonusStudentPicker({
  id,
  plan,
  bonusItems,
  students,
  item,
}: {
  id: string;
  plan: EventShopPlanContext;
  bonusItems: BonusItem[];
  students: { uid: string; name: string; role: string }[];
  // Per-currency mode picks for this currency only.
  item?: BonusItem;
}) {
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [ratioItemUid, setRatioItemUid] = useState(bonusItems[0]?.uid ?? "");
  const ratioItem = item ?? bonusItems.find(({ uid }) => uid === ratioItemUid) ?? bonusItems[0];
  const ratioByStudent = new Map(ratioItem?.rewardBonuses.map(({ student, ratio }) => [student.uid, ratio]) ?? []);
  const visible = students
    .filter(({ uid, role }) => {
      if (filter === "recruited") return plan.recruitedStudentUids.includes(uid);
      if (filter === "all") return true;
      return role.toLowerCase() === filter;
    })
    .sort((a, b) => Number(ratioByStudent.get(b.uid) ?? 0) - Number(ratioByStudent.get(a.uid) ?? 0));
  const selectedUids = item ? selectedUidsForItem(plan, item.uid) : plan.state.selectedBonusStudentUids;
  const filters: { value: RoleFilter; label: string }[] = [
    { value: "all", label: `전체 ${formatCount(students.length)}` },
    { value: "striker", label: "스트라이커" },
    { value: "special", label: "스페셜" },
    ...(plan.signedIn ? [{ value: "recruited" as const, label: "모집한 학생" }] : []),
  ];

  return (
    <div id={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((option) => (
            <ToggleChip
              key={option.value}
              pressed={filter === option.value}
              onPressedChange={() => setFilter(option.value)}
            >
              {option.label}
            </ToggleChip>
          ))}
        </div>
        {!item && bonusItems.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-v2-fg-tertiary">보너스 재화</span>
            {bonusItems.map((bonusItem) => (
              <ToggleChip
                key={bonusItem.uid}
                pressed={ratioItem?.uid === bonusItem.uid}
                onPressedChange={() => setRatioItemUid(bonusItem.uid)}
                className="gap-1.5"
              >
                <CurrencyIcon uid={bonusItem.uid} name={bonusItem.name} />
                {bonusItem.name}
              </ToggleChip>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-x-2.5 gap-y-2 rounded-lg bg-v2-surface p-3 md:grid-cols-[repeat(auto-fill,3.5rem)]">
        {visible.map(({ uid, name }) => {
          const selected = selectedUids.includes(uid);
          const recruited = plan.recruitedStudentUids.includes(uid);
          const ratio = ratioByStudent.get(uid);
          return (
            <div key={uid} className="min-w-0">
              <StudentThumb
                studentUid={uid}
                name={name}
                variant={null}
                recruitmentLabel={recruited ? "모집" : ""}
                isNew={false}
                favorite={noFavorite}
                onSelect={() => {
                  if (item) plan.actions.toggleBonusStudentForItem(item.uid, uid);
                  else if (plan.state.bonusStudentSelectionMode === "shared") plan.actions.toggleBonusStudent(uid);
                }}
                selected={selected}
                selectedIndicatorSize="small"
                fluid
                captionPlacement="overlay"
                grayscaleWhenUnselected
                showRecruitmentLabel={recruited}
              />
              <p className="mt-1 text-center text-xs font-semibold leading-none tabular-nums text-v2-perk">
                {ratio ? `+${new Decimal(ratio).mul(100).toFixed(0)}%` : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function bonusStudents(items: BonusItem[]) {
  const students = new Map<string, { uid: string; name: string; role: string }>();
  for (const bonus of items) {
    for (const { student } of bonus.rewardBonuses) students.set(student.uid, student);
  }
  return [...students.values()];
}

function selectedUidsForItem(plan: EventShopPlanContext, itemUid: string) {
  return plan.state.bonusStudentSelectionMode === "shared"
    ? plan.state.selectedBonusStudentUids
    : (plan.state.selectedBonusStudentUidsByItem[itemUid] ?? plan.state.selectedBonusStudentUids);
}
