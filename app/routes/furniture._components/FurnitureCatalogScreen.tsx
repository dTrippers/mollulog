import { UserIcon } from "@heroicons/react/16/solid";
import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useNavigate, useRevalidator, useSearchParams } from "react-router";
import FurnitureInteractionStudentsPopover, {
  FurnitureInteractionStudentsPopoverGroup,
} from "~/components/v2/features/furniture/FurnitureInteractionStudentsPopover";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { MobileActionBar } from "~/components/v2/layout/MobileActionBar";
import { PageAside } from "~/components/v2/layout/PageAside";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import { PageStackedSummary } from "~/components/v2/layout/PageStackedSummary";
import { PanelAction } from "~/components/v2/layout/PanelAction";
import { PanelSheet } from "~/components/v2/layout/PanelSheet";
import { ScreenNavigation, ScreenNavigationToolbar } from "~/components/v2/layout/ScreenNavigation";
import { ScreenNavigationFocusScope } from "~/components/v2/layout/screen-navigation-focus";
import type { ScreenTabItem } from "~/components/v2/layout/screen-navigation-item";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { useV2Page, V2Page } from "~/components/v2/layout/V2Page";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { ProgressBar } from "~/components/v2/primitives/ProgressBar";
import { SaveToast } from "~/components/v2/primitives/SaveToast";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { Switch } from "~/components/v2/primitives/Switch";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import {
  FURNITURE_CATEGORY_LABELS,
  FURNITURE_RARITY_LABELS,
  type FurnitureCatalogItem,
  type FurnitureCategory,
  type FurnitureRarity,
  filterFurnitureCatalogItems,
  getFurnitureCatalogProgress,
  getFurnitureInventoryStatus,
  groupFurnitureCatalogItems,
} from "~/domain/furniture-catalog";
import type { FurnitureCatalogView, FurnitureCatalogViewTheme } from "~/domain/furniture-catalog-view";
import { ResourceTypeEnum } from "~/graphql/graphql";
import {
  getGoogleAnalyticsResultBucket,
  trackGoogleAnalyticsEvent,
  trackGoogleAnalyticsEventOncePerPage,
} from "~/lib/google-analytics-events.client";
import { cn } from "~/lib/utils";
import type { FurnitureInventoryActionResult, FurnitureInventorySaveJob } from "./action-data";
import { FurnitureQuantityField } from "./FurnitureQuantityField";
import {
  FURNITURE_INPUT_ERROR_MESSAGES,
  type FurnitureCatalogMode,
  getEmptyFurnitureInventoryInputBehavior,
  getFurnitureQuantityInputError,
  isImageAlreadyBroken,
  isValidFurnitureInventoryQuantityInput,
  readStoredFurnitureCatalogState,
  writeStoredFurnitureCatalogState,
} from "./furniture-state";

export { getEmptyFurnitureInventoryInputBehavior, isImageAlreadyBroken, isValidFurnitureInventoryQuantityInput };

type SaveState =
  | { kind: "queued" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string }
  | { kind: "invalid"; message: string };

const SEARCH_PANEL_ID = "furniture-search";
const SAVED_TOAST_DURATION_MS = 2_000;
const AUTOSAVE_DEBOUNCE_MS = 450;

const furnitureCategoryFilterOptions: { text: string; value: FurnitureCategory }[] = [
  { text: FURNITURE_CATEGORY_LABELS.furnitures, value: "furnitures" },
  { text: FURNITURE_CATEGORY_LABELS.decorations, value: "decorations" },
  { text: FURNITURE_CATEGORY_LABELS.interiors, value: "interiors" },
];

const furnitureRarityFilterOptions: { text: string; value: FurnitureRarity; barClassName: string }[] = [
  { text: FURNITURE_RARITY_LABELS[1], value: 1, barClassName: "bg-v2-item-rarity-1" },
  { text: FURNITURE_RARITY_LABELS[2], value: 2, barClassName: "bg-v2-item-rarity-2" },
  { text: FURNITURE_RARITY_LABELS[3], value: 3, barClassName: "bg-v2-item-rarity-3" },
  { text: FURNITURE_RARITY_LABELS[4], value: 4, barClassName: "bg-v2-item-rarity-4" },
];

function toggleFurnitureFilterValue<T>(current: T[], value: T, selected: boolean): T[] {
  if (selected) return current.includes(value) ? current : [...current, value];
  return current.filter((currentValue) => currentValue !== value);
}

type FurnitureCatalogScreenProps = {
  view: FurnitureCatalogView | null;
  signedIn: boolean;
  loadError: string | null;
};

export default function FurnitureCatalogScreen({ view, signedIn, loadError }: FurnitureCatalogScreenProps) {
  const fetcher = useFetcher<FurnitureInventoryActionResult>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawThemeParam = searchParams.get("theme");
  const themeParam = rawThemeParam && rawThemeParam.trim().length > 0 ? rawThemeParam.trim() : null;

  const [mode, setMode] = useState<FurnitureCatalogMode>("themes");
  const [selectedPreview, setSelectedPreview] = useState<FurnitureCatalogViewTheme["previews"][number] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<FurnitureCategory[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<FurnitureRarity[]>([]);
  const [onlyWithInteractionStudents, setOnlyWithInteractionStudents] = useState(false);
  const [storageHydrated, setStorageHydrated] = useState(false);
  // The view the user last chose, which is what gets stored. A theme opened from the address shows the theme view
  // without replacing it.
  const [preferredMode, setPreferredMode] = useState<FurnitureCatalogMode>("themes");

  const [ownedQuantities, setOwnedQuantities] = useState(view?.ownedQuantities ?? {});
  const [draftValues, setDraftValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      view?.items.map((item) => [item.uid, item.quantity === null ? "" : String(item.quantity)]) ?? [],
    ),
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [showSavedToast, setShowSavedToast] = useState(false);

  const queueRef = useRef<FurnitureInventorySaveJob[]>([]);
  const activeJobRef = useRef<FurnitureInventorySaveJob | null>(null);
  const activeJobSubmittedRef = useRef(false);
  const timerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const savedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a save lands; the saved toast shows once nothing is left to save.
  const savedToastPendingRef = useRef(false);
  const dirtyUidsRef = useRef(new Set<string>());
  const pendingUnregisteredClearUidsRef = useRef(new Set<string>());
  const draftValuesRef = useRef(draftValues);
  const ownedQuantitiesRef = useRef(ownedQuantities);
  const saveStatesRef = useRef(saveStates);
  const requestNumberRef = useRef(0);
  const prevThemeParamRef = useRef<string | null>(themeParam);
  const initialThemeParamRef = useRef<string | null>(themeParam);

  draftValuesRef.current = draftValues;
  ownedQuantitiesRef.current = ownedQuantities;
  saveStatesRef.current = saveStates;

  // Restore view mode and all-furniture filters right after initial paint; never restore search query.
  useEffect(() => {
    const stored = readStoredFurnitureCatalogState();
    if (stored) {
      setPreferredMode(stored.mode);
      if (!initialThemeParamRef.current) {
        setMode(stored.mode);
      }
      setSelectedCategories(stored.categories);
      setSelectedRarities(stored.rarities);
      setOnlyWithInteractionStudents(stored.onlyWithInteractionStudents);
    }
    setStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    writeStoredFurnitureCatalogState({
      mode: preferredMode,
      categories: selectedCategories,
      rarities: selectedRarities,
      onlyWithInteractionStudents,
    });
  }, [storageHydrated, preferredMode, selectedCategories, selectedRarities, onlyWithInteractionStudents]);

  // Keep query/preview/mode consistent when navigating into or out of `?theme=...`.
  useEffect(() => {
    const prev = prevThemeParamRef.current;
    prevThemeParamRef.current = themeParam;
    if (prev === themeParam) return;
    setSelectedPreview(null);
    if (themeParam) {
      setQuery("");
      setMode("themes");
    } else if (prev) {
      setMode("themes");
    }
  }, [themeParam]);

  const clearSavedToastTimer = useCallback(() => {
    if (savedToastTimerRef.current !== null) {
      clearTimeout(savedToastTimerRef.current);
      savedToastTimerRef.current = null;
    }
  }, []);

  const scheduleSavedToastClear = useCallback(() => {
    clearSavedToastTimer();
    setShowSavedToast(true);
    savedToastTimerRef.current = setTimeout(() => {
      savedToastTimerRef.current = null;
      setShowSavedToast(false);
    }, SAVED_TOAST_DURATION_MS);
  }, [clearSavedToastTimer]);

  const makeRequestId = useCallback(() => {
    requestNumberRef.current += 1;
    return `${Date.now()}-${requestNumberRef.current}`;
  }, []);

  const submitNext = useCallback(() => {
    if (activeJobRef.current) return;
    const job = queueRef.current.shift();
    if (!job) return;
    clearSavedToastTimer();
    setShowSavedToast(false);
    activeJobRef.current = job;
    activeJobSubmittedRef.current = false;
    setSaveStates((current) => ({ ...current, [job.furnitureUid]: { kind: "saving" } }));
    fetcher.submit(
      {
        operation: "set",
        requestId: job.requestId,
        furnitureUid: job.furnitureUid,
        quantity: job.quantity,
      },
      { action: "/furniture", method: "post", encType: "application/json" },
    );
  }, [clearSavedToastTimer, fetcher]);

  const enqueueSet = useCallback(
    (furnitureUid: string, draftValue: string) => {
      if (!isValidFurnitureInventoryQuantityInput(draftValue)) return;
      const quantity = Number(draftValue.trim());
      const job: FurnitureInventorySaveJob = {
        requestId: makeRequestId(),
        furnitureUid,
        quantity,
        draftValue,
      };
      clearSavedToastTimer();
      setShowSavedToast(false);
      queueRef.current = queueRef.current.filter((queued) => queued.furnitureUid !== furnitureUid);
      queueRef.current.push(job);
      setSaveStates((current) => ({ ...current, [furnitureUid]: { kind: "queued" } }));
      submitNext();
    },
    [clearSavedToastTimer, makeRequestId, submitNext],
  );

  useEffect(() => {
    if (fetcher.state !== "idle" && activeJobRef.current) {
      activeJobSubmittedRef.current = true;
    }
  }, [fetcher.state]);

  useEffect(() => {
    const job = activeJobRef.current;
    if (fetcher.state !== "idle" || !job) return;
    const result = fetcher.data;
    const matchesJob = Boolean(result && result.requestId === job.requestId);
    if (!matchesJob && !activeJobSubmittedRef.current) return;

    activeJobRef.current = null;
    activeJobSubmittedRef.current = false;

    if (matchesJob && result?.ok) {
      trackGoogleAnalyticsEventOncePerPage("furniture_inventory_saved");
      const wasClearedWhileUnregisteredSaveWasInFlight = pendingUnregisteredClearUidsRef.current.delete(
        job.furnitureUid,
      );
      setOwnedQuantities((current) => ({ ...current, ...result.quantities }));
      // The value reached the server even when the field has changed since, so the saved toast still shows.
      savedToastPendingRef.current = true;
      if (wasClearedWhileUnregisteredSaveWasInFlight) {
        setSaveStates((current) => ({
          ...current,
          [job.furnitureUid]: { kind: "invalid", message: FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded },
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
      if (wasClearedWhileUnregisteredSaveWasInFlight && ownedQuantitiesRef.current[job.furnitureUid] === undefined) {
        dirtyUidsRef.current.delete(job.furnitureUid);
        setSaveStates((current) => withoutSaveState(current, job.furnitureUid));
      } else if (wasClearedWhileUnregisteredSaveWasInFlight) {
        setSaveStates((current) => ({
          ...current,
          [job.furnitureUid]: { kind: "invalid", message: FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded },
        }));
      } else if (draftValuesRef.current[job.furnitureUid] === job.draftValue) {
        setSaveStates((current) => ({
          ...current,
          [job.furnitureUid]: { kind: "error", message: FURNITURE_INPUT_ERROR_MESSAGES.saveFailed },
        }));
      }
    }

    queueMicrotask(submitNext);
  }, [fetcher.data, fetcher.state, submitNext]);

  useEffect(() => {
    if (!view) return;
    for (const furnitureUid of pendingUnregisteredClearUidsRef.current) {
      if (view.ownedQuantities[furnitureUid] !== undefined) {
        pendingUnregisteredClearUidsRef.current.delete(furnitureUid);
        setSaveStates((current) => ({
          ...current,
          [furnitureUid]: { kind: "invalid", message: FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded },
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
      clearSavedToastTimer();
    },
    [clearSavedToastTimer],
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

  const hasCatalogData = Boolean(liveView && (liveView.items.length > 0 || liveView.themes.length > 0));
  const activeTheme = useMemo(
    () => (themeParam && liveView ? (liveView.themes.find((theme) => theme.uid === themeParam) ?? null) : null),
    [liveView, themeParam],
  );
  const isMissingTheme = Boolean(themeParam && !loadError && liveView && hasCatalogData && !activeTheme);

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

  const itemsToFilter = activeTheme ? activeTheme.items : (liveView?.items ?? []);
  const visibleItems = useMemo(
    () =>
      filterFurnitureCatalogItems(itemsToFilter, {
        query,
        categories: !activeTheme && mode === "all" ? selectedCategories : undefined,
        rarities: !activeTheme && mode === "all" ? selectedRarities : undefined,
        onlyWithInteractionStudents: !activeTheme && mode === "all" ? onlyWithInteractionStudents : undefined,
      }),
    [activeTheme, itemsToFilter, mode, onlyWithInteractionStudents, query, selectedCategories, selectedRarities],
  );

  const searchResultCount = !activeTheme && mode === "themes" ? visibleThemes.length : visibleItems.length;
  const searchResultCountRef = useRef(searchResultCount);
  searchResultCountRef.current = searchResultCount;

  const hasActiveAllFilters =
    query.trim().length > 0 ||
    selectedCategories.length > 0 ||
    selectedRarities.length > 0 ||
    onlyWithInteractionStudents;

  const handleQuantityChange = useCallback(
    (furnitureUid: string, value: string) => {
      // Whitespace alone is an empty field, the same as the validation and the save queue read it.
      const empty = value.trim() === "";
      if (!empty) pendingUnregisteredClearUidsRef.current.delete(furnitureUid);
      draftValuesRef.current = { ...draftValuesRef.current, [furnitureUid]: value };
      setDraftValues((current) => ({ ...current, [furnitureUid]: value }));
      dirtyUidsRef.current.add(furnitureUid);

      const previousTimer = timerRef.current.get(furnitureUid);
      if (previousTimer) clearTimeout(previousTimer);

      const storedQuantity = ownedQuantitiesRef.current[furnitureUid];
      if (empty) {
        queueRef.current = queueRef.current.filter((queued) => queued.furnitureUid !== furnitureUid);
        const behavior = getEmptyFurnitureInventoryInputBehavior({
          storedQuantity,
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

      const validationError = getFurnitureQuantityInputError(value, {
        hasStoredQuantity: storedQuantity !== undefined,
      });
      if (validationError) {
        queueRef.current = queueRef.current.filter((queued) => queued.furnitureUid !== furnitureUid);
        setSaveStates((current) => ({
          ...current,
          [furnitureUid]: { kind: "invalid", message: validationError },
        }));
        timerRef.current.delete(furnitureUid);
        return;
      }

      // A value waiting for its debounce already counts as saving, so the toast appears as soon as the user types.
      setSaveStates((current) => ({ ...current, [furnitureUid]: { kind: "queued" } }));
      const timer = setTimeout(() => {
        timerRef.current.delete(furnitureUid);
        enqueueSet(furnitureUid, draftValuesRef.current[furnitureUid] ?? value);
      }, AUTOSAVE_DEBOUNCE_MS);
      timerRef.current.set(furnitureUid, timer);
    },
    [enqueueSet],
  );

  const retryAllFailedSaves = useCallback(() => {
    const failedUids = Object.entries(saveStatesRef.current)
      .filter(([, state]) => state.kind === "error")
      .map(([uid]) => uid);
    for (const uid of failedUids) {
      const draftValue = draftValuesRef.current[uid] ?? "";
      enqueueSet(uid, draftValue);
    }
  }, [enqueueSet]);

  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(() => {
      trackGoogleAnalyticsEvent("search", {
        scope: "furniture",
        result_bucket: getGoogleAnalyticsResultBucket(searchResultCountRef.current),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const clearAllFilters = useCallback((restorePanelFocus = false) => {
    setQuery("");
    setSelectedCategories([]);
    setSelectedRarities([]);
    setOnlyWithInteractionStudents(false);
    if (restorePanelFocus) {
      queueMicrotask(() => {
        const titles = document.querySelectorAll<HTMLElement>(`[data-panel-title="${SEARCH_PANEL_ID}"]`);
        for (const title of titles) {
          if (title.offsetParent !== null) {
            title.focus();
            break;
          }
        }
      });
    }
  }, []);

  const handleModeChange = useCallback(
    (nextMode: FurnitureCatalogMode) => {
      setSelectedPreview(null);
      setPreferredMode(nextMode);
      setMode(nextMode);
      if (themeParam) {
        void navigate("/furniture");
      }
    },
    [navigate, themeParam],
  );

  // A sent request counts as saving even after its field turns invalid, so the toast does not drop a save in progress.
  const requestInFlight = fetcher.state !== "idle";
  const isSaving = useMemo(
    () =>
      requestInFlight ||
      Object.values(saveStates).some((state) => state.kind === "queued" || state.kind === "saving"),
    [requestInFlight, saveStates],
  );
  const hasSaveFailure = useMemo(
    () => Object.values(saveStates).some((state) => state.kind === "error"),
    [saveStates],
  );

  useEffect(() => {
    if (isSaving) return;
    if (savedToastPendingRef.current && !hasSaveFailure) scheduleSavedToastClear();
    savedToastPendingRef.current = false;
  }, [isSaving, hasSaveFailure, scheduleSavedToastClear]);

  const searchPanelDisabled = Boolean(
    loadError ||
      !liveView ||
      !hasCatalogData ||
      (!activeTheme && mode === "themes" && liveView.themes.length === 0) ||
      (!activeTheme && mode === "all" && liveView.items.length === 0),
  );

  const isAllMode = !activeTheme && mode === "all";
  const panelTitle = isAllMode ? "검색 및 필터" : "검색";
  const resultSummaryText =
    liveView && isAllMode
      ? `전체 ${liveView.items.length.toLocaleString()}종 중 ${visibleItems.length.toLocaleString()}종 표시 중`
      : undefined;

  const navItems: ScreenTabItem[] = [
    {
      key: "themes",
      text: "테마별 보기",
      Icon: Squares2X2Icon,
      active: mode === "themes",
      onClick: () => handleModeChange("themes"),
    },
    {
      key: "all",
      text: "전체 가구",
      Icon: ArchiveBoxIcon,
      active: mode === "all",
      onClick: () => handleModeChange("all"),
    },
  ];

  const signInCta = !signedIn ? (
    <Link to="/edit?auth_error=signin_required" className={v2ButtonClassName({ variant: "secondary" })}>
      로그인 후 보유 수량 기록
    </Link>
  ) : undefined;

  if (isMissingTheme) {
    return (
      <V2Page width="wide">
        <PageHeader back={{ title: "테마 목록", to: "/furniture" }} title="가구 도감" />
        <PageMain>
          <div className="my-6 max-w-xl rounded-lg bg-v2-surface p-v2-block-p">
            <p className="text-base leading-[1.4] font-semibold text-v2-fg">테마를 찾을 수 없어요.</p>
            <Link
              to="/furniture"
              {...getV2LinkTransitionProps("reverse")}
              className={cn(v2ButtonClassName({ variant: "secondary" }), "mt-3")}
            >
              테마 목록
            </Link>
          </div>
        </PageMain>
      </V2Page>
    );
  }

  return (
    <V2Page width="wide">
      <FurnitureCatalogPageInner
        loadError={loadError}
        revalidator={revalidator}
        liveView={liveView}
        hasCatalogData={hasCatalogData}
        signedIn={signedIn}
        signInCta={signInCta}
        mode={mode}
        isAllMode={isAllMode}
        activeTheme={activeTheme}
        navItems={navItems}
        panelTitle={panelTitle}
        resultSummaryText={resultSummaryText}
        searchPanelDisabled={searchPanelDisabled}
        query={query}
        onQueryChange={setQuery}
        selectedCategories={selectedCategories}
        onToggleCategory={(value, pressed) =>
          setSelectedCategories((current) => toggleFurnitureFilterValue(current, value, pressed))
        }
        selectedRarities={selectedRarities}
        onToggleRarity={(value, pressed) =>
          setSelectedRarities((current) => toggleFurnitureFilterValue(current, value, pressed))
        }
        onlyWithInteractionStudents={onlyWithInteractionStudents}
        onOnlyWithInteractionStudentsChange={setOnlyWithInteractionStudents}
        hasActiveAllFilters={hasActiveAllFilters}
        onClearAllFilters={clearAllFilters}
        visibleThemes={visibleThemes}
        visibleItems={visibleItems}
        ownedQuantities={ownedQuantities}
        draftValues={draftValues}
        saveStates={saveStates}
        onQuantityChange={handleQuantityChange}
        onSelectTheme={() => {
          setSelectedPreview(null);
          setQuery("");
        }}
        selectedPreview={selectedPreview}
        onPreviewSelect={setSelectedPreview}
        isSaving={isSaving}
        showSavedToast={showSavedToast}
        hasSaveFailure={hasSaveFailure}
        onRetryFailedSaves={retryAllFailedSaves}
      />
    </V2Page>
  );
}

type FurnitureCatalogPageInnerProps = {
  loadError: string | null;
  revalidator: ReturnType<typeof useRevalidator>;
  liveView: FurnitureCatalogView | null;
  hasCatalogData: boolean;
  signedIn: boolean;
  signInCta?: React.ReactNode;
  mode: FurnitureCatalogMode;
  isAllMode: boolean;
  activeTheme: FurnitureCatalogViewTheme | null;
  navItems: ScreenTabItem[];
  panelTitle: string;
  resultSummaryText?: string;
  searchPanelDisabled: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  selectedCategories: FurnitureCategory[];
  onToggleCategory: (value: FurnitureCategory, pressed: boolean) => void;
  selectedRarities: FurnitureRarity[];
  onToggleRarity: (value: FurnitureRarity, pressed: boolean) => void;
  onlyWithInteractionStudents: boolean;
  onOnlyWithInteractionStudentsChange: (checked: boolean) => void;
  hasActiveAllFilters: boolean;
  onClearAllFilters: (restorePanelFocus?: boolean) => void;
  visibleThemes: FurnitureCatalogViewTheme[];
  visibleItems: FurnitureCatalogItem[];
  ownedQuantities: Record<string, number>;
  draftValues: Record<string, string>;
  saveStates: Record<string, SaveState>;
  onQuantityChange: (uid: string, value: string) => void;
  onSelectTheme: () => void;
  selectedPreview: FurnitureCatalogViewTheme["previews"][number] | null;
  onPreviewSelect: (preview: FurnitureCatalogViewTheme["previews"][number] | null) => void;
  isSaving: boolean;
  showSavedToast: boolean;
  hasSaveFailure: boolean;
  onRetryFailedSaves: () => void;
};

function FurnitureCatalogPageInner({
  loadError,
  revalidator,
  liveView,
  hasCatalogData,
  signedIn,
  signInCta,
  mode,
  isAllMode,
  activeTheme,
  navItems,
  panelTitle,
  resultSummaryText,
  searchPanelDisabled,
  query,
  onQueryChange,
  selectedCategories,
  onToggleCategory,
  selectedRarities,
  onToggleRarity,
  onlyWithInteractionStudents,
  onOnlyWithInteractionStudentsChange,
  hasActiveAllFilters,
  onClearAllFilters,
  visibleThemes,
  visibleItems,
  draftValues,
  saveStates,
  onQuantityChange,
  onSelectTheme,
  selectedPreview,
  onPreviewSelect,
  isSaving,
  showSavedToast,
  hasSaveFailure,
  onRetryFailedSaves,
}: FurnitureCatalogPageInnerProps) {
  const { stacked } = useV2Page();
  const showTrailingCta = !loadError && hasCatalogData ? signInCta : undefined;

  const searchPanel = (
    <PanelSheet
      panelId={SEARCH_PANEL_ID}
      title={panelTitle}
      description={!searchPanelDisabled ? resultSummaryText : undefined}
      Icon={MagnifyingGlassIcon}
      disabled={searchPanelDisabled}
      headerAction={
        !searchPanelDisabled && isAllMode && hasActiveAllFilters ? (
          <PanelAction variant="danger" onClick={() => onClearAllFilters(true)}>
            필터 해제
          </PanelAction>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        <SearchInput
          aria-label="이름 검색"
          placeholder={!activeTheme && mode === "themes" ? "가구 또는 테마 이름" : "가구 이름"}
          value={query}
          onChange={onQueryChange}
          disabled={searchPanelDisabled}
        />
        {isAllMode ? (
          <>
            <fieldset aria-label="분류" className="m-0 flex min-w-0 flex-col gap-1 border-0 pt-1 pb-1.5">
              <legend className="mb-1 text-xs font-semibold text-v2-fg-tertiary">분류</legend>
              <div className="flex flex-wrap gap-1">
                {furnitureCategoryFilterOptions.map(({ text, value }) => (
                  <ToggleChip
                    key={value}
                    pressed={selectedCategories.includes(value)}
                    disabled={searchPanelDisabled}
                    onPressedChange={(pressed) => onToggleCategory(value, pressed)}
                  >
                    {text}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>
            <fieldset aria-label="희귀도" className="m-0 flex min-w-0 flex-col gap-1 border-0 pt-0.5 pb-1.5">
              <legend className="mb-1 text-xs font-semibold text-v2-fg-tertiary">희귀도</legend>
              <div className="flex flex-wrap gap-1">
                {furnitureRarityFilterOptions.map(({ text, value, barClassName }) => (
                  <ToggleChip
                    key={value}
                    pressed={selectedRarities.includes(value)}
                    disabled={searchPanelDisabled}
                    onPressedChange={(pressed) => onToggleRarity(value, pressed)}
                    className="gap-1.5"
                  >
                    <span aria-hidden="true" className={cn("inline-block h-3 w-0.5 rounded-full", barClassName)} />
                    {text}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>
            <Switch
              id="furniture-interaction-filter"
              label="상호작용 학생 있음"
              checked={onlyWithInteractionStudents}
              disabled={searchPanelDisabled}
              onCheckedChange={onOnlyWithInteractionStudentsChange}
            />
          </>
        ) : null}
      </div>
    </PanelSheet>
  );

  const mainContent = loadError ? (
    <div className="my-12 flex justify-center">
      <div role="alert" className="w-full max-w-xl rounded-lg bg-v2-surface p-v2-block-p">
        <p className="text-base leading-[1.4] font-semibold text-v2-fg">{loadError}</p>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={revalidator.state !== "idle"}
          onClick={revalidator.revalidate}
        >
          <ArrowPathIcon
            className={cn("size-4", revalidator.state !== "idle" && "animate-spin motion-reduce:animate-none")}
            aria-hidden="true"
          />
          {revalidator.state !== "idle" ? "불러오는 중..." : "다시 시도"}
        </Button>
      </div>
    </div>
  ) : !liveView ? (
    <EmptyStateCard text="가구 도감 데이터를 확인할 수 없어요." />
  ) : !hasCatalogData ? (
    <EmptyStateCard text="가구 정보가 아직 없어요." />
  ) : !activeTheme && mode === "themes" ? (
    liveView.themes.length === 0 ? (
      <EmptyStateCard text="표시할 테마가 아직 없어요." />
    ) : visibleThemes.length === 0 ? (
      <p className="pt-1 pb-3 text-sm text-v2-fg-secondary">검색 결과가 없어요.</p>
    ) : (
      <ThemeGrid themes={visibleThemes} signedIn={signedIn} onSelectTheme={onSelectTheme} />
    )
  ) : activeTheme ? (
    activeTheme.items.length === 0 ? (
      <EmptyStateCard text="이 테마에 등록된 가구가 없어요." />
    ) : visibleItems.length === 0 ? (
      <p className="pt-1 pb-3 text-sm text-v2-fg-secondary">검색 조건에 맞는 가구가 없어요.</p>
    ) : (
      <FurnitureCollection
        items={visibleItems}
        signedIn={signedIn}
        showCategoryCounts
        draftValues={draftValues}
        saveStates={saveStates}
        onQuantityChange={onQuantityChange}
      />
    )
  ) : liveView.items.length === 0 ? (
    <EmptyStateCard text="등록된 가구가 아직 없어요." />
  ) : (
    <>
      {hasActiveAllFilters && resultSummaryText ? (
        <div className="v2-stacked-only mb-2 flex min-h-v2-row-min flex-wrap items-center gap-2">
          <span className="text-sm tabular-nums text-v2-fg-secondary">{resultSummaryText}</span>
          <Button size="sm" variant="danger-subtle" onClick={() => onClearAllFilters(false)}>
            필터 해제
          </Button>
        </div>
      ) : null}
      {visibleItems.length === 0 ? (
        <p className="pt-1 pb-3 text-sm text-v2-fg-secondary">검색 조건에 맞는 가구가 없어요.</p>
      ) : (
        <FurnitureCollection
          items={visibleItems}
          signedIn={signedIn}
          showCategoryCounts={false}
          draftValues={draftValues}
          saveStates={saveStates}
          onQuantityChange={onQuantityChange}
        />
      )}
    </>
  );

  return (
    <>
      {activeTheme ? (
        <>
          <PageHeader
            back={{ title: "테마 목록", to: "/furniture" }}
            title={activeTheme.name}
            trailing={showTrailingCta}
          />
          <PageStackedSummary>
            <ThemeDetailSummary
              theme={activeTheme}
              signedIn={signedIn}
              layout="stacked"
              onPreviewSelect={(preview) => onPreviewSelect(preview)}
            />
          </PageStackedSummary>
          <PageAside>
            <ThemeDetailSummary
              theme={activeTheme}
              signedIn={signedIn}
              layout="aside"
              onPreviewSelect={(preview) => onPreviewSelect(preview)}
            />
            {searchPanel}
          </PageAside>
        </>
      ) : (
        <ScreenNavigationFocusScope>
          <PageHeader
            title="가구 도감"
            description="테마별 가구 구성과 보유 현황을 확인해보세요."
            trailing={showTrailingCta}
          />
          <ScreenNavigationToolbar items={navItems} />
          <PageAside>
            <ScreenNavigation items={navItems} />
            {searchPanel}
          </PageAside>
        </ScreenNavigationFocusScope>
      )}
      <PageMain>{mainContent}</PageMain>
      <MobileActionBar
        panels={[
          {
            panelId: SEARCH_PANEL_ID,
            title: panelTitle,
            Icon: MagnifyingGlassIcon,
            disabled: searchPanelDisabled,
          },
        ]}
      />
      <SaveToast
        saving={isSaving}
        saved={showSavedToast}
        failed={hasSaveFailure}
        onRetry={onRetryFailedSaves}
        aboveActionBar={stacked}
      />
      {selectedPreview ? (
        <Dialog open title={selectedPreview.title} onClose={() => onPreviewSelect(null)}>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-v2-inset">
            <CatalogImage
              src={selectedPreview.imageUrl}
              alt={selectedPreview.title}
              className="max-h-[calc(100dvh-10rem)] max-w-full object-contain"
            />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function EmptyStateCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-v2-surface px-4 py-6 text-center text-sm text-v2-fg-secondary">{text}</div>
  );
}

function ThemeGrid({
  themes,
  signedIn,
  onSelectTheme,
}: {
  themes: FurnitureCatalogViewTheme[];
  signedIn: boolean;
  onSelectTheme: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9.375rem,1fr))]">
      {themes.map((theme) => {
        const representativePreview = theme.previews[0];
        const hasInventoryRecord = signedIn && theme.items.some((item) => item.quantity !== null);
        return (
          <Link
            key={theme.uid}
            to={`/furniture?theme=${encodeURIComponent(theme.uid)}`}
            aria-label={`${theme.name} 테마 상세 보기`}
            {...getV2LinkTransitionProps("forward", onSelectTheme)}
            className={cn(
              "flex h-full flex-col overflow-hidden rounded-lg bg-v2-surface text-left hover:bg-v2-filled-hover v2-interaction-transition",
              v2FocusRing,
            )}
          >
            <div className="relative aspect-[512/374] w-full overflow-hidden bg-v2-inset">
              {representativePreview ? (
                <CatalogImage
                  src={representativePreview.thumbnailUrl}
                  alt={`${theme.name} 대표 이미지`}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center p-2 text-center text-xs text-v2-fg-tertiary">
                  대표 이미지 없음
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 px-3 pt-2.5 pb-3">
              <h2 className="break-keep text-sm leading-snug font-semibold text-v2-fg [overflow-wrap:anywhere]">
                {theme.name}
              </h2>
              {hasInventoryRecord ? (
                <ThemeProgressSummary progress={theme.progress} />
              ) : (
                <p className="text-xs tabular-nums text-v2-fg-tertiary">가구 {theme.items.length.toLocaleString()}종</p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ThemeProgressSummary({ progress }: { progress: FurnitureCatalogViewTheme["progress"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium tabular-nums text-v2-fg">
        보유 {progress.ownedKinds}/{progress.totalKinds}종
      </p>
      {progress.totalKinds > 0 ? (
        <ProgressBar value={progress.ownedKinds} max={progress.totalKinds} label="테마 수집 진행도" />
      ) : null}
    </div>
  );
}

function ThemeDetailSummary({
  theme,
  signedIn,
  layout,
  onPreviewSelect,
}: {
  theme: FurnitureCatalogViewTheme;
  signedIn: boolean;
  layout: "aside" | "stacked";
  onPreviewSelect: (preview: FurnitureCatalogViewTheme["previews"][number]) => void;
}) {
  const representativePreview = theme.previews[0];
  const hasInventoryRecord = signedIn && theme.items.some((item) => item.quantity !== null);

  const progressBlock = hasInventoryRecord ? (
    <ThemeProgressSummary progress={theme.progress} />
  ) : (
    <p className="text-xs font-medium tabular-nums text-v2-fg-tertiary">
      가구 {theme.items.length.toLocaleString()}종
    </p>
  );

  if (layout === "stacked") {
    return (
      <div className="flex w-full min-w-0 items-center gap-3">
        {representativePreview ? (
          <button
            type="button"
            onClick={() => onPreviewSelect(representativePreview)}
            aria-label={`${representativePreview.title} 이미지 크게 보기`}
            title={representativePreview.title}
            className={cn(
              "relative aspect-[512/374] w-28 shrink-0 cursor-pointer overflow-hidden rounded-md bg-v2-inset [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-80 v2-interaction-transition",
              v2FocusRing,
            )}
          >
            <CatalogImage
              src={representativePreview.thumbnailUrl}
              alt={`${theme.name} 대표 이미지`}
              className="absolute inset-0 size-full object-cover"
            />
            <span
              aria-hidden="true"
              className="absolute right-1 bottom-1 flex size-[1.375rem] items-center justify-center rounded-md bg-v2-scrim text-v2-on-media"
            >
              <ArrowsPointingOutIcon className="size-3" />
            </span>
          </button>
        ) : null}
        <div className="min-w-0 flex-1">{progressBlock}</div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-lg bg-v2-surface p-3">
      {representativePreview ? (
        <button
          type="button"
          onClick={() => onPreviewSelect(representativePreview)}
          aria-label={`${representativePreview.title} 이미지 크게 보기`}
          title={representativePreview.title}
          className={cn(
            "relative aspect-[512/374] w-full cursor-pointer overflow-hidden rounded-md bg-v2-inset [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-80 v2-interaction-transition",
            v2FocusRing,
          )}
        >
          <CatalogImage
            src={representativePreview.thumbnailUrl}
            alt={`${theme.name} 대표 이미지`}
            className="absolute inset-0 size-full object-cover"
          />
          <span
            aria-hidden="true"
            className="absolute right-1.5 bottom-1.5 flex size-[1.625rem] items-center justify-center rounded-md bg-v2-scrim text-v2-on-media"
          >
            <ArrowsPointingOutIcon className="size-3.5" />
          </span>
        </button>
      ) : null}
      {progressBlock}
    </section>
  );
}

function FurnitureCollection({
  items,
  signedIn,
  showCategoryCounts,
  draftValues,
  saveStates,
  onQuantityChange,
}: {
  items: FurnitureCatalogItem[];
  signedIn: boolean;
  showCategoryCounts: boolean;
  draftValues: Record<string, string>;
  saveStates: Record<string, SaveState>;
  onQuantityChange: (uid: string, value: string) => void;
}) {
  const groups = groupFurnitureCatalogItems(items);
  return (
    <div className="space-y-6">
      <FurnitureInteractionStudentsPopoverGroup>
        {groups.map(({ category, items: categoryItems }) => (
          <section key={category}>
            <div className="mb-2 flex items-baseline gap-1.5">
              <h2 className="text-sm font-semibold text-v2-fg">{FURNITURE_CATEGORY_LABELS[category]}</h2>
              {showCategoryCounts ? (
                <span className="text-xs tabular-nums text-v2-fg-tertiary">
                  {categoryItems.length.toLocaleString()}종
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-2.5 gap-y-3.5">
              {categoryItems.map((item) => (
                <FurnitureCard
                  key={item.uid}
                  item={item}
                  signedIn={signedIn}
                  draftValue={draftValues[item.uid] ?? ""}
                  saveState={saveStates[item.uid]}
                  onQuantityChange={onQuantityChange}
                />
              ))}
            </div>
          </section>
        ))}
      </FurnitureInteractionStudentsPopoverGroup>
    </div>
  );
}

function FurnitureCard({
  item,
  signedIn,
  draftValue,
  saveState,
  onQuantityChange,
}: {
  item: FurnitureCatalogItem;
  signedIn: boolean;
  draftValue: string;
  saveState?: SaveState;
  onQuantityChange: (uid: string, value: string) => void;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = failedImageUrl === item.imageUrl;
  const hasInteractionStudents = item.interactionStudents.length > 0;

  const interactionBadgeContent = hasInteractionStudents ? (
    <span className="flex items-center justify-center py-0.5">
      <UserIcon className="size-3" aria-hidden="true" />
    </span>
  ) : undefined;

  const image = imageFailed ? (
    <div className="relative inline-flex overflow-hidden rounded-md">
      <div
        role="img"
        aria-label={`${item.name}: 이미지를 불러올 수 없음`}
        title="이미지를 불러올 수 없어요."
        className="flex size-12 items-center justify-center bg-v2-inset text-v2-fg-tertiary md:size-14"
      >
        <ExclamationTriangleIcon className="size-5" aria-hidden="true" />
      </div>
      {interactionBadgeContent ? (
        <span className="absolute right-0 bottom-0 rounded-tl-[5px] bg-v2-scrim px-[3px] text-v2-on-media">
          {interactionBadgeContent}
        </span>
      ) : null}
    </div>
  ) : (
    <ResourceThumb
      itemUid={item.uid}
      resourceType={ResourceTypeEnum.Furniture}
      imageUrl={item.imageUrl}
      rarity={item.rarity}
      size="lg"
      label={interactionBadgeContent}
      labelPlacement="inset"
    />
  );

  const interactiveImage = hasInteractionStudents ? (
    <FurnitureInteractionStudentsPopover furnitureName={item.name} students={item.interactionStudents}>
      {image}
    </FurnitureInteractionStudentsPopover>
  ) : (
    image
  );

  const errorMessage = saveState && (saveState.kind === "invalid" || saveState.kind === "error") ? saveState.message : null;

  return (
    <article
      aria-label={`${item.name} · ${FURNITURE_RARITY_LABELS[item.rarity]} 등급`}
      className={cn(
        "grid min-w-0 grid-cols-1 grid-rows-subgrid items-start justify-items-center gap-1.5 rounded-lg px-0.5 py-1",
        signedIn ? "row-span-3" : "row-span-2",
      )}
    >
      <div
        className="relative flex h-12 w-full items-center justify-center md:h-14"
        onErrorCapture={() => setFailedImageUrl(item.imageUrl)}
      >
        {interactiveImage}
      </div>
      <h3 className="w-full min-w-0 break-keep text-center text-xs leading-snug font-normal text-v2-fg [overflow-wrap:anywhere]">
        {item.name}
      </h3>
      {signedIn ? (
        <FurnitureQuantityField
          furnitureName={item.name}
          draftValue={draftValue}
          errorMessage={errorMessage}
          onChange={(value) => onQuantityChange(item.uid, value)}
        />
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
      className={cn(className, "flex items-center justify-center p-2 text-center text-xs text-v2-fg-tertiary")}
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

function withoutSaveState(current: Record<string, SaveState>, furnitureUid: string): Record<string, SaveState> {
  if (!(furnitureUid in current)) return current;
  const next = { ...current };
  delete next[furnitureUid];
  return next;
}
