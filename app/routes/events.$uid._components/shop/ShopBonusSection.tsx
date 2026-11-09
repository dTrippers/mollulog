import Decimal from "decimal.js";
import { useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { Button } from "~/components/v2/primitives/Button";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { ShopSection, ShopSectionHeader } from "./shop-ui";

type BonusItem = EventShopPlanContext["eventRewardBonus"][number];
type BonusStudent = BonusItem["rewardBonuses"][number]["student"];

const noFavorite = { visible: false, icon: "unfavorited" as const, countText: null, accessibleName: "관심 학생" };
const STUDENT_PICK_GRID = "grid grid-cols-7 gap-v2-block-gap md:grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))]";

function percent(value: Decimal) {
  return value.mul(100).toFixed(0);
}

// The student bonus, read two ways like the earlier calculator: by student, one pick for every currency with the
// applied bonus summed up below, or by currency, where each currency lists its strikers and specials with their bonus
// and can keep its own picks.
export function ShopBonusSection({ plan }: { plan: EventShopPlanContext }) {
  const [view, setView] = useState<"student" | "item">("student");
  const bonusItems = plan.eventRewardBonus.filter(({ rewardBonuses }) => rewardBonuses.length > 0);
  if (bonusItems.length === 0) return null;
  const students = bonusStudents(bonusItems);
  const mode = plan.state.bonusStudentSelectionMode;
  const itemUids = bonusItems.map(({ uid }) => uid);
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

  return (
    <ShopSection id="student-bonus-title" region="student-bonus">
      <ShopSectionHeader
        id="student-bonus-title"
        title="학생 보너스"
        description="재화마다 보너스가 높은 학생부터 스트라이커 4명, 스페셜 2명까지 적용돼요."
      />
      <div>
        <SectionTabs
          label="학생 보너스 보기"
          selectedId={view}
          onChange={(id) => setView(id as "student" | "item")}
          items={[
            { id: "student", label: "학생별" },
            { id: "item", label: "재화별" },
          ]}
        />
        {view === "student" ? (
          <>
            {mode === "perItem" ? (
              <p className="my-3 rounded-md bg-v2-surface p-v2-tile-p text-sm text-v2-fg-secondary">
                재화마다 서로 다른 보너스 학생을 선택했어요. 재화별 탭에서 확인해주세요.
              </p>
            ) : null}
            <div className={cn(STUDENT_PICK_GRID, mode === "perItem" ? null : "mt-4")}>
              {students.map((student) => {
                const selected =
                  mode === "shared"
                    ? plan.state.selectedBonusStudentUids.includes(student.uid)
                    : bonusItems.every(({ uid }) => selectedUidsForItem(plan, uid).includes(student.uid));
                return (
                  <BonusStudentThumb
                    key={student.uid}
                    student={student}
                    plan={plan}
                    selected={selected}
                    onSelect={() => {
                      if (mode === "shared") plan.actions.toggleBonusStudent(student.uid);
                      else plan.actions.setBonusStudentForItems(itemUids, student.uid, !selected);
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-4">
              <BonusSummary plan={plan} bonusItems={bonusItems} />
            </div>
          </>
        ) : (
          <div className="mt-4">
            <ItemBonusView plan={plan} bonusItems={bonusItems} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button size="sm" disabled={!plan.signedIn || plan.recruitedStudentUids.length === 0} onClick={applyRecruited}>
          보유 학생 반영
        </Button>
        <Button size="sm" onClick={chooseAll}>
          모두 선택
        </Button>
        <Button size="sm" variant="danger-subtle" disabled={!hasSelection} onClick={clear}>
          초기화
        </Button>
      </div>
    </ShopSection>
  );
}

function BonusSummary({ plan, bonusItems }: { plan: EventShopPlanContext; bonusItems: BonusItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-v2-block-gap rounded-md bg-v2-surface p-v2-tile-p md:grid-cols-3">
      {bonusItems.map((item) => {
        const ratios = bonusRatios(plan, item.uid);
        return (
          <div key={item.uid} className="flex min-w-0 items-center gap-2 text-sm tabular-nums">
            <ResourceThumb
              itemUid={item.uid}
              resourceType={ResourceTypeEnum.Item}
              name={item.name}
              rarity={1}
              tooltip
            />
            <div className="min-w-0">
              <p>적용 {ratios ? `${ratios.applied}%` : "—"}</p>
              <p className="text-v2-fg-tertiary">최대 {ratios ? `${ratios.maximum}%` : "—"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemBonusView({ plan, bonusItems }: { plan: EventShopPlanContext; bonusItems: BonusItem[] }) {
  const itemUids = bonusItems.map(({ uid }) => uid);
  return (
    <div className="flex flex-col gap-v2-group-gap">
      <div className="flex flex-wrap gap-v2-block-gap">
        <ToggleChip
          pressed={plan.state.bonusStudentSelectionMode === "shared"}
          onPressedChange={(pressed) => pressed && plan.actions.setBonusStudentSelectionMode("shared", itemUids)}
        >
          모든 재화 동일
        </ToggleChip>
        <ToggleChip
          pressed={plan.state.bonusStudentSelectionMode === "perItem"}
          onPressedChange={(pressed) => pressed && plan.actions.setBonusStudentSelectionMode("perItem", itemUids)}
        >
          재화마다 다르게
        </ToggleChip>
      </div>
      {bonusItems.map((item) => {
        const ratios = bonusRatios(plan, item.uid);
        return (
          <section key={item.uid} aria-label={item.name} className="flex flex-col gap-v2-block-gap">
            <div className="flex min-w-0 items-center gap-2">
              <ResourceThumb
                itemUid={item.uid}
                resourceType={ResourceTypeEnum.Item}
                name={item.name}
                size="sm"
                bare
                tooltip
              />
              <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-v2-fg">{item.name}</h3>
              <p className="shrink-0 text-xs tabular-nums text-v2-fg-tertiary">
                <span className="font-medium text-v2-fg">적용 {ratios ? `${ratios.applied}%` : "—"}</span> / 최대{" "}
                {ratios ? `${ratios.maximum}%` : "—"}
              </p>
            </div>
            <BonusRoleRow studentRole="striker" label="스트라이커" item={item} plan={plan} />
            <BonusRoleRow studentRole="special" label="스페셜" item={item} plan={plan} />
          </section>
        );
      })}
    </div>
  );
}

function BonusRoleRow({
  studentRole,
  label,
  item,
  plan,
}: {
  studentRole: "striker" | "special";
  label: string;
  item: BonusItem;
  plan: EventShopPlanContext;
}) {
  const students = item.rewardBonuses
    .filter(({ student }) => student.role.toLowerCase() === studentRole)
    .sort((a, b) => Number(b.ratio) - Number(a.ratio));
  if (students.length === 0) return null;
  const perItem = plan.state.bonusStudentSelectionMode === "perItem";
  return (
    <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start">
      <p className="text-xs font-medium text-v2-fg-secondary md:w-20 md:shrink-0 md:pt-1">{label}</p>
      <div className={cn(STUDENT_PICK_GRID, "min-w-0 flex-1")}>
        {students.map(({ student, ratio }) => (
          <div key={student.uid} className="min-w-0">
            <BonusStudentThumb
              student={student}
              plan={plan}
              selected={selectedUidsForItem(plan, item.uid).includes(student.uid)}
              onSelect={() =>
                perItem
                  ? plan.actions.toggleBonusStudentForItem(item.uid, student.uid)
                  : plan.actions.toggleBonusStudent(student.uid)
              }
            />
            <p className="mt-0.5 text-center text-[0.625rem] leading-none font-semibold tabular-nums text-v2-fg-tertiary">
              {new Decimal(ratio).mul(100).toFixed(0)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BonusStudentThumb({
  student,
  plan,
  selected,
  onSelect,
}: {
  student: BonusStudent;
  plan: EventShopPlanContext;
  selected: boolean;
  onSelect: () => void;
}) {
  const recruited = plan.recruitedStudentUids.includes(student.uid);
  const { name, variant } = splitVisibleStudentName(student.name);
  return (
    <StudentThumb
      studentUid={student.uid}
      name={name}
      variant={variant}
      recruitmentLabel={recruited ? "모집" : ""}
      isNew={false}
      favorite={noFavorite}
      onSelect={onSelect}
      selected={selected}
      selectedIndicatorPosition="mobile-bottom-left"
      fluid
      captionPlacement="overlay"
      grayscaleWhenUnselected
      showRecruitmentLabel={recruited}
    />
  );
}

function bonusRatios(plan: EventShopPlanContext, itemUid: string) {
  const summary = plan.bonusSummary?.find(({ uid }) => uid === itemUid);
  if (!summary) return null;
  return {
    applied: percent(summary.appliedStrikerRatio.plus(summary.appliedSpecialRatio)),
    maximum: percent(summary.maxStrikerRatio.plus(summary.maxSpecialRatio)),
  };
}

function bonusStudents(items: BonusItem[]) {
  const students = new Map<string, BonusStudent>();
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
