import type { StudentItemsMap } from "~/domain/relationship-gift-plan";
import { ArchiveBoxIcon, GiftIcon } from "@heroicons/react/24/outline";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Await, useRevalidator } from "react-router";
import type { AllStudentsFavoriteItems } from "~/models/resource";
import { getRelationshipGiftQuantityBreakdown } from "~/domain/relationship-gifts";
import {
  createStudentItemsMap,
  syncStudentItemsFromProps,
  updateSavedGiftPlanBaseline,
  updateStudentGiftPlanQuantity,
} from "~/domain/relationship-gift-plan";
import {
  RelationshipGiftDetails,
  type RelationshipGiftStudent,
} from "~/components/v2/features/relationship/RelationshipGiftDetails";
import { RelationshipGiftList } from "~/components/v2/features/relationship/RelationshipGiftList";
import { Button } from "~/components/v2/primitives/Button";
import { AsideLinks, MobileActionBar, PageAside, PageMain, PanelSheet } from "~/components/v2/layout";
import type { AllFavoriteItemsLoad } from "./relationship-types";

export const RELATIONSHIP_GIFT_PANEL_ID = "relationship-gifts";
const RESOURCE_PLANNER_LINK = "/utils/growth/resources?category=favor";
const rarityBackground: Record<number, string> = {
  1: "bg-v2-rarity-1",
  2: "bg-v2-rarity-2",
  3: "bg-v2-rarity-3",
  4: "bg-v2-rarity-4",
};

export function RelationshipGiftScreen({
  items,
  students,
  isAuthenticated,
  ownedQuantities,
  writeMode,
  staleWriteBlocked,
  commonItemUids,
  onStaleWriteBlocked,
  onStudentItemsSaved,
  stacked,
  onChooseAnotherGift,
  onClosePanel,
}: {
  items: Promise<AllFavoriteItemsLoad>;
  students: RelationshipGiftStudent[];
  isAuthenticated: boolean;
  ownedQuantities: Record<string, number> | null;
  writeMode: "legacy" | "nullable";
  staleWriteBlocked: boolean;
  commonItemUids: string[];
  onStaleWriteBlocked: () => void;
  onStudentItemsSaved: (savedPlans: Array<{ studentUid: string; items: Record<string, number> }>) => void;
  stacked: boolean;
  onChooseAnotherGift: () => void;
  onClosePanel: () => void;
}) {
  const revalidator = useRevalidator();
  // Only failed-load recovery resets Await; ordinary save revalidation retains the editor.
  const awaitKeyRef = useRef({ items, key: 0 });
  const retryRequestedRef = useRef(false);
  if (awaitKeyRef.current.items !== items) {
    awaitKeyRef.current = { items, key: awaitKeyRef.current.key + (retryRequestedRef.current ? 1 : 0) };
    retryRequestedRef.current = false;
  }
  const handleLoadRetry = () => {
    retryRequestedRef.current = true;
    void revalidator.revalidate();
  };
  const [activeItemUid, setActiveItemUid] = useState<string | null>(null);
  const [studentItemsState, setStudentItemsState] = useState<StudentItemsMap>(() => createStudentItemsMap(students));
  const [initialStudentItems, setInitialStudentItems] = useState<StudentItemsMap>(() =>
    createStudentItemsMap(students),
  );
  const savedBaselineRef = useRef<StudentItemsMap | null>(createStudentItemsMap(students));
  const nextStudents = useMemo(() => createStudentItemsMap(students), [students]);

  useEffect(() => {
    const baseline = savedBaselineRef.current;
    setStudentItemsState((current) => syncStudentItemsFromProps(current, baseline, nextStudents));
    setInitialStudentItems(nextStudents);
    savedBaselineRef.current = nextStudents;
  }, [nextStudents]);

  const studentsWithDrafts = useMemo(
    () =>
      students.map((student) => ({ ...student, items: studentItemsState.get(student.uid)?.items ?? student.items })),
    [students, studentItemsState],
  );
  const { requiredQuantities, breakdowns } = useMemo(
    () => getRelationshipGiftQuantityBreakdown(studentsWithDrafts),
    [studentsWithDrafts],
  );

  const handleSelectItem = (itemUid: string) => {
    setActiveItemUid(itemUid);
    onClosePanel();
  };
  const handleQuantityChange = useCallback((studentUid: string, itemUid: string, quantity: number) => {
    setStudentItemsState((current) => updateStudentGiftPlanQuantity(current, studentUid, itemUid, quantity));
  }, []);
  const handleSaved = useCallback(
    (savedPlans: Array<{ studentUid: string; items: Record<string, number> }>) => {
      const baseline = updateSavedGiftPlanBaseline(savedBaselineRef.current ?? initialStudentItems, savedPlans);
      savedBaselineRef.current = baseline;
      setInitialStudentItems(baseline);
      onStudentItemsSaved(savedPlans);
    },
    [initialStudentItems, onStudentItemsSaved],
  );

  const renderItems = (resolvedItems: AllStudentsFavoriteItems[]) => {
    const selectedItem = resolvedItems.find((item) => item.itemUid === activeItemUid) ?? null;
    return (
      <>
        <PageMain>
          {selectedItem ? (
            <div className="space-y-v2-block-gap">
              <header className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-md ${rarityBackground[selectedItem.itemRarity] ?? rarityBackground[1]}`}
                >
                  <img
                    src={`https://assets.baql.net/images/resources/items/${selectedItem.itemUid}.webp`}
                    alt={`${selectedItem.itemName}, 희귀도 ${selectedItem.itemRarity}`}
                    className="size-9 object-contain"
                  />
                </span>
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-v2-fg">{selectedItem.itemName}</h2>
                <Button variant="text" onClick={onChooseAnotherGift} className="shrink-0 px-2 text-xs">
                  다른 선물
                </Button>
              </header>
              <RelationshipGiftDetails
                item={selectedItem}
                students={students}
                studentItemsMap={studentItemsState}
                initialStudentItems={initialStudentItems}
                requiredQuantity={requiredQuantities[selectedItem.itemUid] ?? 0}
                ownedQuantity={ownedQuantities === null ? null : (ownedQuantities[selectedItem.itemUid] ?? 0)}
                breakdown={breakdowns[selectedItem.itemUid] ?? []}
                writeMode={writeMode}
                isAuthenticated={isAuthenticated}
                staleWriteBlocked={staleWriteBlocked}
                commonItemUids={commonItemUids}
                onQuantityChange={handleQuantityChange}
                onStaleWriteBlocked={onStaleWriteBlocked}
                onSaved={handleSaved}
              />
            </div>
          ) : (
            <>
              {stacked ? (
                <div className="@min-[48rem]/page-available:hidden rounded-lg bg-v2-surface p-v2-block-p">
                  <RelationshipGiftList
                    items={resolvedItems}
                    activeItemUid={activeItemUid}
                    requiredQuantities={requiredQuantities}
                    ownedQuantities={ownedQuantities}
                    onSelect={handleSelectItem}
                    className="grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] [&>button>span:first-child]:size-13"
                  />
                </div>
              ) : null}
              <p className="hidden py-8 text-sm text-v2-fg-secondary @min-[48rem]/page-available:block">
                선물을 고르면 선호 학생과 수량을 볼 수 있어요.
              </p>
            </>
          )}
        </PageMain>
        <PageAside>
          <PanelSheet panelId={RELATIONSHIP_GIFT_PANEL_ID} title="선물 목록" Icon={GiftIcon} defaultExpanded>
            <div className="@min-[48rem]/page-available:max-h-[28rem] @min-[48rem]/page-available:overflow-y-auto">
              <RelationshipGiftList
                items={resolvedItems}
                activeItemUid={activeItemUid}
                requiredQuantities={requiredQuantities}
                ownedQuantities={ownedQuantities}
                onSelect={handleSelectItem}
              />
            </div>
          </PanelSheet>
          <AsideLinks
            items={[
              {
                key: "resource-planner",
                title: "재화 플래너",
                description: "보유 선물 수량 관리",
                Icon: ArchiveBoxIcon,
                to: RESOURCE_PLANNER_LINK,
                preventScrollReset: true,
              },
            ]}
          />
        </PageAside>
        <MobileActionBar
          links={[
            {
              key: "resource-planner",
              title: "재화 플래너",
              shortTitle: "재화 플래너",
              Icon: ArchiveBoxIcon,
              to: RESOURCE_PLANNER_LINK,
              preventScrollReset: true,
            },
          ]}
          panels={[{ panelId: RELATIONSHIP_GIFT_PANEL_ID, title: "선물 목록", shortTitle: "선물", Icon: GiftIcon }]}
        />
      </>
    );
  };

  return (
    <Suspense fallback={<GiftScreenLoading />}>
      <Await
        key={awaitKeyRef.current.key}
        resolve={items}
        errorElement={<GiftScreenFailure onRetry={handleLoadRetry} />}
      >
        {(result) =>
          result.status === "ready" ? renderItems(result.items) : <GiftScreenFailure onRetry={handleLoadRetry} />
        }
      </Await>
    </Suspense>
  );
}

function GiftScreenLoading() {
  return (
    <>
      <PageMain>
        <section className="rounded-lg bg-v2-surface p-v2-block-p" aria-label="선물 정보 불러오는 중">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((slot) => (
              <span key={slot} aria-hidden="true" className="aspect-square rounded-lg bg-v2-inset" />
            ))}
          </div>
        </section>
      </PageMain>
      <PageAside>
        <PanelSheet panelId={RELATIONSHIP_GIFT_PANEL_ID} title="선물 목록" Icon={GiftIcon} defaultExpanded>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot) => (
              <span key={slot} aria-hidden="true" className="size-14 rounded-lg bg-v2-inset" />
            ))}
          </div>
        </PanelSheet>
        <ResourcePlannerLink />
      </PageAside>
      <GiftMobileActionBar />
    </>
  );
}

function GiftScreenFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <PageMain>
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-v2-surface p-v2-block-p"
        >
          <p className="text-sm text-v2-fg-secondary">선물 정보를 불러오지 못했어요.</p>
          <Button onClick={onRetry} className="min-h-9">
            다시 시도
          </Button>
        </div>
      </PageMain>
      <PageAside>
        <PanelSheet panelId={RELATIONSHIP_GIFT_PANEL_ID} title="선물 목록" Icon={GiftIcon} defaultExpanded>
          <div role="alert" className="space-y-3">
            <p className="text-sm text-v2-fg-secondary">선물 정보를 불러오지 못했어요.</p>
            <Button onClick={onRetry} className="min-h-9">
              다시 시도
            </Button>
          </div>
        </PanelSheet>
        <ResourcePlannerLink />
      </PageAside>
      <GiftMobileActionBar />
    </>
  );
}

function ResourcePlannerLink() {
  return (
    <AsideLinks
      items={[
        {
          key: "resource-planner",
          title: "재화 플래너",
          description: "보유 선물 수량 관리",
          Icon: ArchiveBoxIcon,
          to: RESOURCE_PLANNER_LINK,
          preventScrollReset: true,
        },
      ]}
    />
  );
}

function GiftMobileActionBar() {
  return (
    <MobileActionBar
      links={[
        {
          key: "resource-planner",
          title: "재화 플래너",
          shortTitle: "재화 플래너",
          Icon: ArchiveBoxIcon,
          to: RESOURCE_PLANNER_LINK,
          preventScrollReset: true,
        },
      ]}
      panels={[{ panelId: RELATIONSHIP_GIFT_PANEL_ID, title: "선물 목록", shortTitle: "선물", Icon: GiftIcon }]}
    />
  );
}
