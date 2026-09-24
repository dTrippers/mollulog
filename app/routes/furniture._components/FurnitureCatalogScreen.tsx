import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { ArchiveBoxIcon, FunnelIcon, Squares2X2Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Page } from "~/components/features/layout";
import {
  Button,
  EmptyView,
  NumberInput,
  PanelBody,
  PanelSearchField,
  PanelSwitchRow,
  ResourceCard,
  SectionCard,
} from "~/components/primitives";
import {
  FURNITURE_CATEGORY_LABELS,
  FURNITURE_RARITY_LABELS,
  type FurnitureCatalogItem,
  filterFurnitureCatalogItems,
  getFurnitureCatalogProgress,
  getFurnitureInventoryStatus,
  groupFurnitureCatalogItems,
} from "~/domain/furniture-catalog";
import type { FurnitureCatalogView, FurnitureCatalogViewTheme } from "~/domain/furniture-catalog-view";
import type { FurnitureInventoryActionResult, FurnitureInventorySaveJob } from "./action-data";

type SaveState =
  | { kind: "queued" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string }
  | { kind: "invalid"; message: string };

const MAX_FURNITURE_INVENTORY_QUANTITY = 2_147_483_647;
const FURNITURE_INVENTORY_QUANTITY_ERROR = "보유 수량은 0 이상 2,147,483,647 이하의 정수로 입력해 주세요.";

export function isValidFurnitureInventoryQuantityInput(value: string): boolean {
  const normalizedValue = value.trim();
  const quantity = Number(normalizedValue);
  const digitsOnly =
    normalizedValue.length > 0 && [...normalizedValue].every((character) => character >= "0" && character <= "9");
  return digitsOnly && Number.isSafeInteger(quantity) && quantity <= MAX_FURNITURE_INVENTORY_QUANTITY;
}

export function isImageAlreadyBroken(image: Pick<HTMLImageElement, "complete" | "naturalWidth"> | null): boolean {
  return image?.complete === true && image.naturalWidth === 0;
}

export function getEmptyFurnitureInventoryInputBehavior({
  storedQuantity,
  saveInFlight,
}: {
  storedQuantity: number | undefined;
  saveInFlight: boolean;
}): "reset-unregistered" | "wait-for-save" | "keep-invalid" {
  if (storedQuantity !== undefined) return "keep-invalid";
  if (saveInFlight) return "wait-for-save";
  return "reset-unregistered";
}

type FurnitureCatalogScreenProps = {
  view: FurnitureCatalogView | null;
  signedIn: boolean;
  loadError: string | null;
};

export default function FurnitureCatalogScreen({ view, signedIn, loadError }: FurnitureCatalogScreenProps) {
  const fetcher = useFetcher<FurnitureInventoryActionResult>();
  const revalidator = useRevalidator();
  const [mode, setMode] = useState<"themes" | "all">("themes");
  const [activeThemeUid, setActiveThemeUid] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<FurnitureCatalogViewTheme["previews"][number] | null>(null);
  const [query, setQuery] = useState("");
  const [notOwnedOnly, setNotOwnedOnly] = useState(false);
  const [ownedQuantities, setOwnedQuantities] = useState(view?.ownedQuantities ?? {});
  const [draftValues, setDraftValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      view?.items.map((item) => [item.uid, item.quantity === null ? "" : String(item.quantity)]) ?? [],
    ),
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const queueRef = useRef<FurnitureInventorySaveJob[]>([]);
  const activeJobRef = useRef<FurnitureInventorySaveJob | null>(null);
  const timerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dirtyUidsRef = useRef(new Set<string>());
  const pendingUnregisteredClearUidsRef = useRef(new Set<string>());
  const draftValuesRef = useRef(draftValues);
  const requestNumberRef = useRef(0);

  draftValuesRef.current = draftValues;

  const makeRequestId = useCallback(() => {
    requestNumberRef.current += 1;
    return `${Date.now()}-${requestNumberRef.current}`;
  }, []);

  const submitNext = useCallback(() => {
    if (activeJobRef.current) return;
    const job = queueRef.current.shift();
    if (!job) return;
    activeJobRef.current = job;
    setSaveStates((current) => ({ ...current, [job.furnitureUid]: { kind: "saving" } }));
    fetcher.submit(
      {
        operation: "set",
        requestId: job.requestId,
        furnitureUid: job.furnitureUid,
        quantity: job.quantity,
      },
      { method: "post", encType: "application/json" },
    );
  }, [fetcher]);

  const enqueueSet = useCallback(
    (furnitureUid: string, draftValue: string) => {
      if (!/^\d+$/.test(draftValue.trim())) return;
      const quantity = Number(draftValue.trim());
      if (!isValidFurnitureInventoryQuantityInput(draftValue)) return;
      const job: FurnitureInventorySaveJob = {
        requestId: makeRequestId(),
        furnitureUid,
        quantity,
        draftValue,
      };
      queueRef.current = queueRef.current.filter((queued) => queued.furnitureUid !== furnitureUid);
      queueRef.current.push(job);
      setSaveStates((current) => ({ ...current, [furnitureUid]: { kind: "queued" } }));
      submitNext();
    },
    [makeRequestId, submitNext],
  );

  useEffect(() => {
    const job = activeJobRef.current;
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !job || !result || result.requestId !== job.requestId) return;

    activeJobRef.current = null;
    if (result.ok) {
      const wasClearedWhileUnregisteredSaveWasInFlight = pendingUnregisteredClearUidsRef.current.delete(
        job.furnitureUid,
      );
      setOwnedQuantities((current) => ({ ...current, ...result.quantities }));
      if (wasClearedWhileUnregisteredSaveWasInFlight) {
        setSaveStates((current) => ({
          ...current,
          [job.furnitureUid]: { kind: "invalid", message: FURNITURE_INVENTORY_QUANTITY_ERROR },
        }));
      } else if (draftValuesRef.current[job.furnitureUid] === job.draftValue) {
        const savedValue = String(result.quantities[job.furnitureUid] ?? job.quantity);
        dirtyUidsRef.current.delete(job.furnitureUid);
        draftValuesRef.current = { ...draftValuesRef.current, [job.furnitureUid]: savedValue };
        setDraftValues((current) => ({ ...current, [job.furnitureUid]: savedValue }));
        setSaveStates((current) => ({ ...current, [job.furnitureUid]: { kind: "saved" } }));
      }
    } else {
      const wasClearedWhileUnregisteredSaveWasInFlight = pendingUnregisteredClearUidsRef.current.delete(
        job.furnitureUid,
      );
      if (wasClearedWhileUnregisteredSaveWasInFlight && ownedQuantities[job.furnitureUid] === undefined) {
        dirtyUidsRef.current.delete(job.furnitureUid);
        setSaveStates((current) => withoutSaveState(current, job.furnitureUid));
      } else if (wasClearedWhileUnregisteredSaveWasInFlight) {
        setSaveStates((current) => ({
          ...current,
          [job.furnitureUid]: { kind: "invalid", message: FURNITURE_INVENTORY_QUANTITY_ERROR },
        }));
      } else if (draftValuesRef.current[job.furnitureUid] === job.draftValue) {
        setSaveStates((current) => ({ ...current, [job.furnitureUid]: { kind: "error", message: result.error } }));
      }
    }

    queueMicrotask(submitNext);
  }, [fetcher.data, fetcher.state, ownedQuantities, submitNext]);

  useEffect(() => {
    if (!view) return;
    for (const furnitureUid of pendingUnregisteredClearUidsRef.current) {
      if (view.ownedQuantities[furnitureUid] !== undefined) {
        pendingUnregisteredClearUidsRef.current.delete(furnitureUid);
        setSaveStates((current) => ({
          ...current,
          [furnitureUid]: { kind: "invalid", message: FURNITURE_INVENTORY_QUANTITY_ERROR },
        }));
      }
    }
    setOwnedQuantities((current) => ({ ...current, ...view.ownedQuantities }));
    setDraftValues((current) => {
      const next = { ...current };
      for (const item of view.items) {
        if (!dirtyUidsRef.current.has(item.uid)) next[item.uid] = item.quantity === null ? "" : String(item.quantity);
      }
      draftValuesRef.current = next;
      return next;
    });
  }, [view]);

  useEffect(
    () => () => {
      for (const timer of timerRef.current.values()) clearTimeout(timer);
      timerRef.current.clear();
    },
    [],
  );

  const liveView = useMemo(() => {
    if (!view) return null;
    const withQuantity = (item: FurnitureCatalogItem): FurnitureCatalogItem => {
      const quantity = ownedQuantities[item.uid];
      return { ...item, quantity: quantity ?? null, status: getFurnitureInventoryStatus(quantity) };
    };
    const items = view.items.map(withQuantity);
    const itemByUid = new Map(items.map((item) => [item.uid, item] as const));
    const themes = view.themes.map((theme) => ({
      ...theme,
      items: theme.items.map((item) => itemByUid.get(item.uid) ?? withQuantity(item)),
      progress: getFurnitureCatalogProgress(theme.furnitureUids, ownedQuantities),
    }));
    return { ...view, items, themes };
  }, [ownedQuantities, view]);

  const activeTheme = liveView?.themes.find((theme) => theme.uid === activeThemeUid) ?? null;
  const visibleThemes = useMemo(() => {
    if (!liveView) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return liveView.themes.filter(
      (theme) =>
        !normalizedQuery ||
        theme.name.toLocaleLowerCase().includes(normalizedQuery) ||
        theme.items.some((item) => item.name.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [liveView, query]);
  const itemsToFilter = mode === "themes" && activeTheme ? activeTheme.items : (liveView?.items ?? []);
  const visibleItems = filterFurnitureCatalogItems(itemsToFilter, { query, notOwnedOnly: signedIn && notOwnedOnly });

  const handleQuantityChange = (furnitureUid: string, value: string) => {
    if (value !== "") pendingUnregisteredClearUidsRef.current.delete(furnitureUid);
    draftValuesRef.current = { ...draftValuesRef.current, [furnitureUid]: value };
    setDraftValues((current) => ({ ...current, [furnitureUid]: value }));
    dirtyUidsRef.current.add(furnitureUid);

    const previousTimer = timerRef.current.get(furnitureUid);
    if (previousTimer) clearTimeout(previousTimer);

    if (value === "") {
      queueRef.current = queueRef.current.filter((queued) => queued.furnitureUid !== furnitureUid);
      const behavior = getEmptyFurnitureInventoryInputBehavior({
        storedQuantity: ownedQuantities[furnitureUid],
        saveInFlight: activeJobRef.current?.furnitureUid === furnitureUid,
      });

      if (behavior === "reset-unregistered") {
        pendingUnregisteredClearUidsRef.current.delete(furnitureUid);
        dirtyUidsRef.current.delete(furnitureUid);
        setSaveStates((current) => withoutSaveState(current, furnitureUid));
        timerRef.current.delete(furnitureUid);
        return;
      }

      if (behavior === "wait-for-save") {
        pendingUnregisteredClearUidsRef.current.add(furnitureUid);
        setSaveStates((current) => ({ ...current, [furnitureUid]: { kind: "saving" } }));
        timerRef.current.delete(furnitureUid);
        return;
      }

      pendingUnregisteredClearUidsRef.current.delete(furnitureUid);
    }

    if (!isValidFurnitureInventoryQuantityInput(value)) {
      setSaveStates((current) => ({
        ...current,
        [furnitureUid]: { kind: "invalid", message: FURNITURE_INVENTORY_QUANTITY_ERROR },
      }));
      timerRef.current.delete(furnitureUid);
      return;
    }
    setSaveStates((current) => ({ ...current, [furnitureUid]: { kind: "queued" } }));
    const timer = setTimeout(() => {
      timerRef.current.delete(furnitureUid);
      enqueueSet(furnitureUid, draftValuesRef.current[furnitureUid] ?? value);
    }, 450);
    timerRef.current.set(furnitureUid, timer);
  };

  const retryQuantitySave = (furnitureUid: string) => {
    const draftValue = draftValuesRef.current[furnitureUid] ?? "";
    enqueueSet(furnitureUid, draftValue);
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
  };

  const handleNotOwnedOnlyChange = (nextNotOwnedOnly: boolean) => {
    setNotOwnedOnly(nextNotOwnedOnly);
  };

  const handleModeChange = (nextMode: "themes" | "all") => {
    setSelectedPreview(null);
    setMode(nextMode);
    setActiveThemeUid(null);
  };

  const handleThemeSelect = (themeUid: string) => {
    setSelectedPreview(null);
    setQuery("");
    setActiveThemeUid(themeUid);
  };

  const handleThemeLeave = () => {
    setSelectedPreview(null);
    setActiveThemeUid(null);
  };

  return (
    <Page
      title="가구 도감"
      description={activeTheme?.name ?? "테마별 가구 구성과 보유 현황을 확인해보세요."}
      belowTitle={
        activeTheme ? (
          <FurnitureThemeSummary theme={activeTheme} signedIn={signedIn} onPreviewSelect={setSelectedPreview} />
        ) : undefined
      }
      backward={activeTheme ? { title: "테마 목록", to: "/furniture", onClick: handleThemeLeave } : undefined}
      contentWidth="full"
      maxWidth="wide"
      screens={
        activeTheme
          ? undefined
          : [
              {
                text: "테마별 보기",
                description: "테마별 가구 구성과 수집 현황",
                Icon: Squares2X2Icon,
                active: mode === "themes",
                onClick: () => handleModeChange("themes"),
              },
              {
                text: "전체 가구",
                description: "전체 가구 목록 검색",
                Icon: ArchiveBoxIcon,
                active: mode === "all",
                onClick: () => handleModeChange("all"),
              },
            ]
      }
      panels={[
        {
          title: "검색 및 필터",
          Icon: FunnelIcon,
          children: (
            <PanelBody>
              <PanelSearchField
                label="이름 검색"
                name="furniture-search"
                placeholder={mode === "themes" && !activeTheme ? "가구 또는 테마 이름" : "가구 이름"}
                value={query}
                onChange={handleQueryChange}
              />
              {mode === "all" || activeTheme ? (
                <PanelSwitchRow
                  title="미보유만 보기"
                  description={!signedIn ? "로그인 후 사용" : undefined}
                  name="furniture-not-owned-only"
                  checked={signedIn && notOwnedOnly}
                  disabled={!signedIn}
                  onChange={handleNotOwnedOnlyChange}
                />
              ) : null}
            </PanelBody>
          ),
        },
      ]}
    >
      {loadError ? (
        <SectionCard>
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={revalidator.state !== "idle"}
              onClick={revalidator.revalidate}
            >
              {revalidator.state !== "idle" ? "불러오는 중..." : "다시 시도"}
            </Button>
          </div>
        </SectionCard>
      ) : !liveView ? (
        <EmptyView text="가구 도감 데이터를 확인할 수 없어요." />
      ) : liveView.items.length === 0 && liveView.themes.length === 0 ? (
        <SectionCard>
          <EmptyView text="가구 정보가 아직 없어요." description="가구 데이터를 불러왔지만 등록된 가구가 없습니다." />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {!signedIn ? (
            <div className="flex justify-end">
              <Button to="/edit?auth_error=signin_required" variant="secondary" size="sm">
                로그인 후 보유량 기록
              </Button>
            </div>
          ) : null}

          {mode === "themes" && !activeTheme ? (
            <ThemeGrid
              themes={visibleThemes}
              signedIn={signedIn}
              onSelect={handleThemeSelect}
              empty={liveView.themes.length === 0 ? "표시할 테마가 아직 없어요." : "검색 결과가 없어요."}
            />
          ) : mode === "themes" && activeTheme ? (
            <FurnitureCollection
              items={visibleItems}
              signedIn={signedIn}
              showCategoryCounts
              draftValues={draftValues}
              saveStates={saveStates}
              onQuantityChange={handleQuantityChange}
              onRetry={retryQuantitySave}
              empty={
                activeTheme.items.length === 0 ? "이 테마에 등록된 가구가 없어요." : "검색 조건에 맞는 가구가 없어요."
              }
            />
          ) : (
            <FurnitureCollection
              items={visibleItems}
              signedIn={signedIn}
              showCategoryCounts={false}
              draftValues={draftValues}
              saveStates={saveStates}
              onQuantityChange={handleQuantityChange}
              onRetry={retryQuantitySave}
              empty={liveView.items.length === 0 ? "등록된 가구가 아직 없어요." : "검색 조건에 맞는 가구가 없어요."}
            />
          )}
        </div>
      )}
      {selectedPreview ? (
        <FurniturePreviewDialog preview={selectedPreview} onClose={() => setSelectedPreview(null)} />
      ) : null}
    </Page>
  );
}

function ThemeGrid({
  themes,
  signedIn,
  onSelect,
  empty,
}: {
  themes: FurnitureCatalogViewTheme[];
  signedIn: boolean;
  onSelect: (themeUid: string) => void;
  empty: string;
}) {
  if (themes.length === 0)
    return (
      <SectionCard>
        <EmptyView text={empty} />
      </SectionCard>
    );
  return (
    <div className="grid grid-cols-2 justify-start gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,10rem),10rem))] sm:gap-4">
      {themes.map((theme) => {
        const representativePreview = theme.previews[0];
        return (
          <button
            key={theme.uid}
            type="button"
            className="group flex h-full cursor-pointer flex-col justify-start overflow-hidden rounded-lg bg-card text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={() => onSelect(theme.uid)}
            aria-label={`${theme.name} 테마 상세 보기`}
          >
            <div className="aspect-[16/8] bg-muted">
              {representativePreview ? (
                <CatalogImage
                  src={representativePreview.thumbnailUrl}
                  alt={`${theme.name} 대표 이미지`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  대표 이미지 없음
                </div>
              )}
            </div>
            <div className="space-y-1.5 p-3">
              <h2 className="line-clamp-2 break-keep text-sm font-semibold text-foreground">{theme.name}</h2>
              {signedIn && theme.items.some((item) => item.quantity !== null) ? (
                <ProgressSummary progress={theme.progress} />
              ) : (
                <p className="text-xs text-muted-foreground">가구 {theme.items.length.toLocaleString()}종</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProgressSummary({ progress }: { progress: FurnitureCatalogViewTheme["progress"] }) {
  const ratio = progress.totalKinds === 0 ? 0 : progress.ownedKinds / progress.totalKinds;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">
        보유 {progress.ownedKinds}/{progress.totalKinds}종
      </p>
      {progress.totalKinds > 0 ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.totalKinds}
          aria-valuenow={progress.ownedKinds}
          aria-valuetext={`보유 ${progress.ownedKinds}/${progress.totalKinds}종`}
          aria-label="테마 수집 진행도"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${ratio * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function FurnitureThemeSummary({
  theme,
  signedIn,
  onPreviewSelect,
}: {
  theme: FurnitureCatalogViewTheme;
  signedIn: boolean;
  onPreviewSelect: (preview: FurnitureCatalogViewTheme["previews"][number]) => void;
}) {
  const representativePreview = theme.previews[0];
  const hasInventoryRecord = theme.items.some((item) => item.quantity !== null);

  return (
    <div className="flex w-full min-w-0 items-center gap-3 lg:flex-col lg:items-start">
      {representativePreview ? (
        <button
          type="button"
          className="aspect-[16/9] w-24 shrink-0 cursor-pointer overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:w-full"
          onClick={() => onPreviewSelect(representativePreview)}
          aria-label={`${representativePreview.title} 이미지 크게 보기`}
          title={representativePreview.title}
        >
          <CatalogImage
            src={representativePreview.thumbnailUrl}
            alt={`${theme.name} 대표 이미지`}
            className="h-full w-full object-cover"
          />
        </button>
      ) : null}
      <div className="min-w-0 flex-1 lg:w-full">
        {signedIn && hasInventoryRecord ? (
          <ProgressSummary progress={theme.progress} />
        ) : (
          <p className="text-xs font-medium text-muted-foreground">가구 {theme.items.length.toLocaleString()}종</p>
        )}
      </div>
    </div>
  );
}

function FurnitureCollection({
  items,
  signedIn,
  showCategoryCounts,
  draftValues,
  saveStates,
  onQuantityChange,
  onRetry,
  empty,
}: {
  items: FurnitureCatalogItem[];
  signedIn: boolean;
  showCategoryCounts: boolean;
  draftValues: Record<string, string>;
  saveStates: Record<string, SaveState>;
  onQuantityChange: (uid: string, value: string) => void;
  onRetry: (uid: string) => void;
  empty: string;
}) {
  if (items.length === 0)
    return (
      <SectionCard>
        <EmptyView text={empty} />
      </SectionCard>
    );

  const groups = groupFurnitureCatalogItems(items);
  return (
    <div className="space-y-4">
      {groups.map(({ category, items: categoryItems }) => (
        <SectionCard
          key={category}
          title={
            showCategoryCounts
              ? `${FURNITURE_CATEGORY_LABELS[category]} ${categoryItems.length.toLocaleString()}종`
              : FURNITURE_CATEGORY_LABELS[category]
          }
        >
          <div className="flex flex-wrap gap-x-1 gap-y-3">
            {categoryItems.map((item) => (
              <FurnitureCard
                key={item.uid}
                item={item}
                signedIn={signedIn}
                draftValue={draftValues[item.uid] ?? ""}
                saveState={saveStates[item.uid]}
                onQuantityChange={onQuantityChange}
                onRetry={onRetry}
              />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function FurniturePreviewDialog({
  preview,
  onClose,
}: {
  preview: FurnitureCatalogViewTheme["previews"][number];
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} className="relative z-layer-modal">
      <DialogBackdrop className="fixed inset-0 bg-black/85 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
        <DialogPanel className="relative flex max-h-full w-full max-w-[min(96rem,96vw)] flex-col overflow-hidden rounded-lg bg-black shadow-2xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-white">
            <DialogTitle className="truncate text-sm font-medium">{preview.title}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="가구 이미지 닫기"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <XMarkIcon className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-4">
            <CatalogImage
              src={preview.imageUrl}
              alt={preview.title}
              className="max-h-[calc(100dvh-7rem)] max-w-full object-contain"
            />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function FurnitureCard({
  item,
  signedIn,
  draftValue,
  saveState,
  onQuantityChange,
  onRetry,
}: {
  item: FurnitureCatalogItem;
  signedIn: boolean;
  draftValue: string;
  saveState?: SaveState;
  onQuantityChange: (uid: string, value: string) => void;
  onRetry: (uid: string) => void;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = failedImageUrl === item.imageUrl;

  const image = imageFailed ? (
    <div
      role="img"
      aria-label={`${item.name}: 이미지를 불러올 수 없음`}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-muted px-2 text-center text-xs leading-tight text-muted-foreground md:h-14"
    >
      이미지를 불러올 수 없어요.
    </div>
  ) : (
    <ResourceCard imageUrl={item.imageUrl} rarity={item.rarity} size="lg" />
  );

  return (
    <article
      aria-label={`${item.name} · ${FURNITURE_RARITY_LABELS[item.rarity]} 등급`}
      className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-md px-0.5 py-1.5"
    >
      <div
        className="relative flex h-12 w-full items-center justify-center md:h-14"
        onErrorCapture={() => setFailedImageUrl(item.imageUrl)}
      >
        {image}
      </div>
      <h3 className="line-clamp-2 h-8 min-h-8 w-full break-keep text-center text-xs leading-tight text-foreground">
        {item.name}
      </h3>
      {signedIn ? (
        <div className="w-full">
          <p className="mb-0.5 text-left text-xs font-medium leading-tight text-muted-foreground">보유</p>
          <NumberInput
            nullable
            fullWidth
            minValue={0}
            showDecrease={false}
            showIncrease={false}
            size="sm"
            controlClassName="focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/60"
            value={draftValue === "" ? null : Number(draftValue)}
            onChange={(value) => onQuantityChange(item.uid, value === null ? "" : String(value))}
            inputProps={{
              "aria-label": `${item.name} 보유 수량`,
              "aria-description":
                draftValue === ""
                  ? "미등록 상태예요. 수량을 확인한 뒤 0 이상으로 입력해 주세요."
                  : draftValue === "0"
                    ? "확인된 미보유 상태예요."
                    : "보유 수량이에요.",
            }}
          />
        </div>
      ) : null}
      {signedIn && saveState ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-x-2">
          <p
            role={saveState.kind === "error" || saveState.kind === "invalid" ? "alert" : "status"}
            className={`min-w-0 break-words text-center text-xs ${saveState.kind === "error" || saveState.kind === "invalid" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {saveStateText(saveState)}
          </p>
          {saveState.kind === "error" ? (
            <Button type="button" variant="secondary" size="xs" onClick={() => onRetry(item.uid)}>
              다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
function CatalogImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = failedSource === src;
  const captureImageRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (isImageAlreadyBroken(image)) setFailedSource(src);
    },
    [src],
  );
  return failed ? (
    <div
      role="img"
      aria-label={`${alt}: 이미지를 불러올 수 없음`}
      className={`${className} flex items-center justify-center p-2 text-center text-xs text-muted-foreground`}
    >
      이미지를 불러올 수 없어요.
    </div>
  ) : (
    <img
      ref={captureImageRef}
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailedSource(src)}
    />
  );
}

function saveStateText(state: SaveState): string {
  switch (state.kind) {
    case "queued":
      return "저장 중";
    case "saving":
      return "저장 중";
    case "saved":
      return "저장됨";
    case "error":
    case "invalid":
      return state.message;
  }
}

function withoutSaveState(current: Record<string, SaveState>, furnitureUid: string): Record<string, SaveState> {
  if (!(furnitureUid in current)) return current;
  const next = { ...current };
  delete next[furnitureUid];
  return next;
}
