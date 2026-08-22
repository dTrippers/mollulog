import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { CheckIcon, Square3Stack3DIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { NumberInput, ResourceCard } from "~/components/primitives";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import { requestScannerJson, toScannerErrorMessage } from "../scanner._components/scanner-client";

export type CellResourceSummary = {
  uid: string;
  assetUid?: string;
  name?: string;
  description?: string;
  resourceType?: ResourceTypeEnum;
  rarity?: number;
  unavailable?: boolean;
};

export type ReviewCell = {
  imageIndex: number;
  position: number;
  imageUid: string;
  filename: string;
  width: number | null;
  height: number | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  status: "recognized" | "quantity_failure" | "unrecognized";
  itemUid: string | null;
  resource?: CellResourceSummary | null;
  currentQuantity?: number | null;
  quantity: number | null;
  quantityExact: boolean;
  quantityKnown: boolean;
  candidates?: Array<{ uid: string; score: number | null }>;
  reasons: string[];
  sameAppearanceCandidateCount?: number | null;
  sameAppearanceResource?: CellResourceSummary | null;
};

export type CellEdit = {
  itemUid?: string;
  quantity?: string;
  excluded?: boolean;
  itemTouched?: boolean;
  quantityTouched?: boolean;
  exclusionTouched?: boolean;
};

export type CandidateDetails = {
  current: (CellResourceSummary & { currentQuantity: number }) | null;
  candidates: Array<{
    uid: string;
    assetUid: string;
    name: string;
    description?: string;
    resourceType: ResourceTypeEnum;
    rarity: number;
    currentQuantity: number;
    score: number | null;
    selectionSource: "stored_recognition" | "ocr_candidate" | "catalog_search";
  }>;
};

export type CellApplySummary = {
  applicableChanged: number;
  unchangedSafe: number;
  omitted: number;
  omittedCells: Array<{ imageIndex: number; position: number; reason: string; duplicateUid?: string }>;
  duplicateUids: string[];
  appliedItemUids: string[];
  unchangedItemUids: string[];
};

export function getCellReviewCandidateList(
  current: CandidateDetails["current"],
  candidates: CandidateDetails["candidates"],
): CandidateDetails["candidates"] {
  return candidates.filter((candidate) => candidate.uid !== current?.uid);
}

export function cellAddressKey(cell: Pick<ReviewCell, "imageIndex" | "position">): string {
  return `${cell.imageIndex}:${cell.position}`;
}

export function hasCellReviewCells(cells: ReviewCell[] | undefined): boolean {
  return (cells?.length ?? 0) > 0;
}

export function hasCellEditChanges(edit: CellEdit): boolean {
  return edit.itemTouched === true || edit.quantityTouched === true || edit.exclusionTouched === true;
}

export function buildCellApplyPayload(cells: ReviewCell[], edits: Record<string, CellEdit>) {
  return cells.flatMap((cell) => {
    const edit = edits[cellAddressKey(cell)];
    if (!edit || !hasCellEditChanges(edit)) return [];
    if (edit.exclusionTouched && edit.excluded) {
      return [{ imageIndex: cell.imageIndex, position: cell.position, excluded: true }];
    }
    const quantity = edit.quantityTouched ? parseEditedCellQuantity(edit.quantity) : undefined;
    const patch = {
      imageIndex: cell.imageIndex,
      position: cell.position,
      ...(edit.itemTouched && (edit.itemUid ?? cell.itemUid) ? { itemUid: edit.itemUid ?? cell.itemUid } : {}),
      ...(quantity === undefined ? {} : { quantity }),
      ...(edit.exclusionTouched ? { excluded: false } : {}),
    };
    return [patch];
  });
}

export function mergeCellCandidateQuantities(
  currentQuantities: Record<string, number>,
  details: CandidateDetails,
): Record<string, number> {
  const next = { ...currentQuantities };
  if (details.current) next[details.current.uid] = details.current.currentQuantity;
  for (const candidate of details.candidates) next[candidate.uid] = candidate.currentQuantity;
  return next;
}

function parseEditedCellQuantity(value: string | undefined): number {
  if (value == null || !value.trim()) throw new Error("수량을 입력해 주세요");
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("수량은 0 이상의 정수여야 해요");
  return quantity;
}

type CellReviewPreviewSummary = {
  applicableChanged: number;
  unchangedSafe: number;
  omitted: number;
  omittedReasons: Record<string, number>;
};

export function buildCellReviewPreviewSummary(
  cells: ReviewCell[],
  edits: Record<string, CellEdit>,
  currentQuantities: Record<string, number>,
): CellReviewPreviewSummary {
  const effective = cells.map((cell) => {
    const edit = edits[cellAddressKey(cell)] ?? {};
    const itemUid = edit.itemUid ?? cell.itemUid;
    const quantity = edit.quantityTouched ? parsePreviewQuantity(edit.quantity) : cell.quantity;
    const unavailableStoredResource =
      cell.resource?.unavailable === true && itemUid === cell.itemUid && itemUid !== null;
    return { cell, edit, itemUid, quantity, unavailableStoredResource };
  });
  const includedByUid = new Map<string, typeof effective>();
  for (const entry of effective) {
    if (entry.edit.excluded || !entry.itemUid || entry.unavailableStoredResource) continue;
    includedByUid.set(entry.itemUid, [...(includedByUid.get(entry.itemUid) ?? []), entry]);
  }
  const duplicateUids = new Set(
    [...includedByUid.entries()].filter(([, entries]) => entries.length > 1).map(([itemUid]) => itemUid),
  );
  const omittedReasons: Record<string, number> = {};
  let applicableChanged = 0;
  let unchangedSafe = 0;
  for (const entry of effective) {
    let reason: string | null = null;
    if (entry.edit.excluded) reason = "사용자 제외";
    else if (!entry.itemUid || entry.unavailableStoredResource) reason = "아이템 확인 필요";
    else if (duplicateUids.has(entry.itemUid)) reason = "아이템 중복";
    else if (entry.quantity === null) reason = "수량 확인 필요";

    if (reason) {
      omittedReasons[reason] = (omittedReasons[reason] ?? 0) + 1;
      continue;
    }
    const currentQuantity =
      currentQuantities[entry.itemUid as string] ??
      (entry.itemUid === entry.cell.itemUid ? (entry.cell.currentQuantity ?? 0) : 0);
    if (entry.quantity === currentQuantity) unchangedSafe += 1;
    else applicableChanged += 1;
  }
  return {
    applicableChanged,
    unchangedSafe,
    omitted: Object.values(omittedReasons).reduce((sum, count) => sum + count, 0),
    omittedReasons,
  };
}

function parsePreviewQuantity(value: string | undefined): number | null {
  if (value == null || !value.trim()) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

export function buildCellReviewAttentionCounts(
  cells: ReviewCell[] | undefined,
  edits: Record<string, CellEdit>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cell of cells ?? []) {
    const edit = edits[cellAddressKey(cell)] ?? {};
    if (edit.excluded === true) continue;

    const itemUid = edit.itemUid ?? cell.itemUid;
    const quantity = edit.quantityTouched ? parsePreviewQuantity(edit.quantity) : cell.quantity;
    const unresolvedItem =
      !itemUid || (cell.resource?.unavailable === true && itemUid === cell.itemUid && itemUid !== null);
    const unresolvedQuantity = quantity === null;
    if (unresolvedItem || unresolvedQuantity) {
      counts[cell.imageUid] = (counts[cell.imageUid] ?? 0) + 1;
    }
  }
  return counts;
}

export function CellReviewPanel({
  jobUid,
  selectedImageUid,
  cells,
  edits,
  candidateDetails,
  disabled,
  onHighlightChange,
  onLoadCandidates,
  onEdit,
}: {
  jobUid: string;
  selectedImageUid: string | null;
  cells: ReviewCell[];
  edits: Record<string, CellEdit>;
  candidateDetails: Record<string, CandidateDetails>;
  disabled: boolean;
  onHighlightChange: (position: number, highlighted: boolean) => void;
  onLoadCandidates: (cell: ReviewCell, details: CandidateDetails) => void;
  onEdit: (cell: ReviewCell, edit: CellEdit) => void;
}) {
  const visibleCells = selectedImageUid ? cells.filter((cell) => cell.imageUid === selectedImageUid) : cells;
  const recognizedCount = visibleCells.filter((cell) => {
    const edit = edits[cellAddressKey(cell)];
    return (edit?.itemUid ?? cell.itemUid) !== undefined && (edit?.itemUid ?? cell.itemUid) !== null;
  }).length;
  if (visibleCells.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        검토할 셀을 찾을 수 없어요.
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">인식 결과</p>
        <p className="text-xs text-muted-foreground">
          재화 식별{" "}
          <span className="tabular-nums">
            {recognizedCount} / {visibleCells.length}
          </span>
        </p>
      </div>
      <div className="grid grid-cols-5 gap-x-2 gap-y-1">
        {visibleCells.map((cell) => (
          <CellReviewTile
            key={cellAddressKey(cell)}
            jobUid={jobUid}
            cell={cell}
            edit={edits[cellAddressKey(cell)] ?? {}}
            details={candidateDetails[cellAddressKey(cell)]}
            disabled={disabled}
            onHighlightChange={(highlighted) => onHighlightChange(cell.position, highlighted)}
            onLoadCandidates={(details) => onLoadCandidates(cell, details)}
            onEdit={(edit) => onEdit(cell, edit)}
          />
        ))}
      </div>
    </>
  );
}

function CellReviewTile({
  jobUid,
  cell,
  edit,
  details,
  disabled,
  onHighlightChange,
  onLoadCandidates,
  onEdit,
}: {
  jobUid: string;
  cell: ReviewCell;
  edit: CellEdit;
  details?: CandidateDetails;
  disabled: boolean;
  onHighlightChange: (highlighted: boolean) => void;
  onLoadCandidates: (details: CandidateDetails) => void;
  onEdit: (edit: CellEdit) => void;
}) {
  const selectedUid = edit.itemUid ?? cell.itemUid;
  const quantity = edit.quantity ?? (cell.quantity == null ? "" : String(cell.quantity));
  const excluded = edit.excluded === true;
  const selectedCandidate = details?.candidates.find((candidate) => candidate.uid === selectedUid);
  const currentResource =
    details?.current && details.current.uid === selectedUid
      ? details.current
      : (selectedCandidate ?? (cell.resource?.uid === selectedUid ? cell.resource : undefined));
  const currentQuantity =
    details?.current && details.current.uid === selectedUid
      ? details.current.currentQuantity
      : (selectedCandidate?.currentQuantity ??
        (selectedUid && selectedUid === cell.itemUid ? (cell.currentQuantity ?? 0) : null));
  const unavailable = currentResource && "unavailable" in currentResource && currentResource.unavailable === true;
  const sameAppearanceCandidateCount = cell.sameAppearanceCandidateCount ?? 0;
  const requiresSameAppearanceSelection =
    !selectedUid &&
    sameAppearanceCandidateCount > 1 &&
    cell.reasons.includes("resource_visual_identity_ambiguous");
  const warning = excluded
    ? { label: "제외됨", title: "적용에서 제외된 아이템이에요", tone: "muted" as const }
    : requiresSameAppearanceSelection
      ? {
          label: "같은 모양",
          title: "같은 모양의 아이템 중 하나를 선택해 주세요",
          tone: "attention" as const,
        }
      : !selectedUid || unavailable
        ? { label: "확인 필요", title: "아이템을 확인해 주세요", tone: "destructive" as const }
        : quantity === ""
          ? { label: "수량 확인", title: "수량을 확인해 주세요", tone: "destructive" as const }
          : !cell.quantityExact && !edit.quantityTouched
            ? { label: "근사 수량", title: "근사 수량으로 인식됐어요", tone: "attention" as const }
            : null;

  return (
    <div
      className={cn(
        "flex w-12 justify-self-center flex-col items-center rounded-md md:w-14",
        excluded && "opacity-50",
      )}
    >
      <CellCandidatePopover
        jobUid={jobUid}
        cell={cell}
        selectedUid={selectedUid}
        details={details}
        disabled={disabled}
        onHighlightChange={onHighlightChange}
        onLoadCandidates={onLoadCandidates}
        onSelect={(itemUid) => onEdit({ itemUid, itemTouched: true, excluded: false, exclusionTouched: true })}
        onExclude={() => onEdit({ excluded: true, exclusionTouched: true })}
      >
        <span className="relative block">
          {currentResource?.name ? (
            <ResourceCard
              itemUid={currentResource.assetUid ?? selectedUid ?? ""}
              resourceType={currentResource.resourceType}
              rarity={currentResource.rarity}
              name={currentResource.name}
              size="lg"
            />
          ) : requiresSameAppearanceSelection && cell.sameAppearanceResource?.assetUid ? (
            <span className="relative block">
              <ResourceCard
                itemUid={cell.sameAppearanceResource.assetUid}
                resourceType={cell.sameAppearanceResource.resourceType}
                rarity={cell.sameAppearanceResource.rarity}
                size="lg"
              />
              <span
                className="pointer-events-none absolute left-0 top-0 size-12 rounded-lg ring-1 ring-inset ring-amber-500/60 md:size-14"
                aria-hidden="true"
              />
            </span>
          ) : (
            <span
              title={
                requiresSameAppearanceSelection
                  ? "같은 모양의 아이템 중 하나를 선택해 주세요"
                  : unavailable
                    ? "카탈로그에서 아이템 정보를 찾을 수 없어요"
                    : undefined
              }
              className={cn(
                "mb-1 flex size-12 items-center justify-center rounded-lg bg-muted/50 text-lg font-medium md:size-14",
                requiresSameAppearanceSelection
                  ? "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300"
                  : unavailable
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {requiresSameAppearanceSelection ? (
                <Square3Stack3DIcon className="size-5" aria-hidden="true" />
              ) : unavailable ? (
                "!"
              ) : (
                "?"
              )}
            </span>
          )}
          {warning ? (
            <span
              title={warning.title}
              className={cn(
                "pointer-events-none absolute top-0.5 z-10 inline-flex origin-top-right scale-80 items-center whitespace-nowrap rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium leading-tight backdrop-blur-sm",
                currentResource?.name ||
                  (requiresSameAppearanceSelection && cell.sameAppearanceResource?.assetUid)
                  ? "right-1.5"
                  : "right-0.5",
                warning.tone === "destructive" && "text-red-300 dark:text-red-200",
                warning.tone === "attention" && "text-amber-300",
                warning.tone === "muted" && "text-neutral-300",
              )}
            >
              {warning.label}
            </span>
          ) : null}
        </span>
      </CellCandidatePopover>
      <span className="sr-only">
        {currentResource?.name ??
          (requiresSameAppearanceSelection
            ? "같은 모양의 아이템 중 선택 필요"
            : unavailable
            ? "카탈로그에서 아이템 정보를 찾을 수 없음"
            : cell.status === "unrecognized"
              ? "인식하지 못한 아이템"
              : "아이템 정보 없음")}
      </span>
      <div className="mt-1 w-full">
        <NumberInput
          nullable
          minValue={0}
          showDecrease={false}
          showIncrease={false}
          size="sm"
          disabled={disabled}
          value={quantity === "" ? null : Number(quantity)}
          inputProps={{ "aria-label": `${currentResource?.name ?? "아이템"} 인식 수량` }}
          onChange={(nextQuantity) =>
            onEdit({
              quantity: nextQuantity == null ? "" : String(nextQuantity),
              quantityTouched: true,
            })
          }
        />
      </div>
      {currentQuantity != null ? (
        <div className="mt-1 flex flex-col items-center">
          <p className="w-max whitespace-nowrap text-center text-[10px] leading-none text-muted-foreground">
            보유 <strong className="font-bold tabular-nums text-foreground">{currentQuantity.toLocaleString()}</strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CellCandidatePopover({
  jobUid,
  cell,
  selectedUid,
  details,
  disabled,
  onHighlightChange,
  onLoadCandidates,
  onSelect,
  onExclude,
  children,
}: {
  jobUid: string;
  cell: ReviewCell;
  selectedUid: string | null;
  details?: CandidateDetails;
  disabled: boolean;
  onHighlightChange: (highlighted: boolean) => void;
  onLoadCandidates: (details: CandidateDetails) => void;
  onSelect: (itemUid: string) => void;
  onExclude: () => void;
  children: ReactNode;
}) {
  return (
    <Popover className="relative">
      {({ close, open }) => (
        <CellCandidatePopoverContent
          close={close}
          open={open}
          jobUid={jobUid}
          cell={cell}
          selectedUid={selectedUid}
          details={details}
          disabled={disabled}
          onHighlightChange={onHighlightChange}
          onLoadCandidates={onLoadCandidates}
          onSelect={onSelect}
          onExclude={onExclude}
        >
          {children}
        </CellCandidatePopoverContent>
      )}
    </Popover>
  );
}

function CellCandidatePopoverContent({
  close,
  open,
  jobUid,
  cell,
  selectedUid,
  details,
  disabled,
  onHighlightChange,
  onLoadCandidates,
  onSelect,
  onExclude,
  children,
}: {
  close: () => void;
  open: boolean;
  jobUid: string;
  cell: ReviewCell;
  selectedUid: string | null;
  details?: CandidateDetails;
  disabled: boolean;
  onHighlightChange: (highlighted: boolean) => void;
  onLoadCandidates: (details: CandidateDetails) => void;
  onSelect: (itemUid: string) => void;
  onExclude: () => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CandidateDetails["candidates"]>([]);
  const [defaultDetails, setDefaultDetails] = useState<CandidateDetails | null>(() =>
    toDefaultCandidateDetails(details),
  );
  const defaultLoadAttempted = useRef(false);
  const onLoadCandidatesRef = useRef(onLoadCandidates);
  onLoadCandidatesRef.current = onLoadCandidates;

  const loadDefaultCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ imageIndex: String(cell.imageIndex), position: String(cell.position) });
      const response = await requestScannerJson<CandidateDetails>(
        `/api/ocr/jobs/${encodeURIComponent(jobUid)}/candidates?${params.toString()}`,
      );
      setDefaultDetails(response);
      onLoadCandidatesRef.current(response);
    } catch (loadError) {
      setError(toScannerErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [cell.imageIndex, cell.position, jobUid]);

  const current = defaultDetails?.current ?? null;
  const sameAppearanceCandidateCount = cell.sameAppearanceCandidateCount ?? 0;
  const sameAppearanceSelectionRequired =
    !selectedUid &&
    sameAppearanceCandidateCount > 1 &&
    cell.reasons.includes("resource_visual_identity_ambiguous");
  const defaultCandidates = sameAppearanceSelectionRequired
    ? (defaultDetails?.candidates ?? []).slice(0, sameAppearanceCandidateCount)
    : (defaultDetails?.candidates ?? []);
  const candidates = query.trim() ? searchResults : getCellReviewCandidateList(current, defaultCandidates);
  const showingLoading = loading || (open && !defaultDetails && !error);

  useEffect(() => {
    if (details && !defaultDetails) setDefaultDetails(toDefaultCandidateDetails(details));
  }, [defaultDetails, details]);

  useEffect(() => {
    if (!open) {
      defaultLoadAttempted.current = false;
      return;
    }
    if (!defaultDetails && !defaultLoadAttempted.current) {
      defaultLoadAttempted.current = true;
      void loadDefaultCandidates();
    }
  }, [defaultDetails, loadDefaultCandidates, open]);

  useEffect(() => {
    const search = query.trim();
    if (!open || !search || !defaultDetails) {
      if (!search) {
        setSearchResults([]);
        setLoading(false);
      }
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          imageIndex: String(cell.imageIndex),
          position: String(cell.position),
          q: search,
        });
        const response = await requestScannerJson<CandidateDetails>(
          `/api/ocr/jobs/${encodeURIComponent(jobUid)}/candidates?${params.toString()}`,
          { signal: controller.signal },
        );
        const results = response.candidates ?? [];
        setSearchResults(results);
        onLoadCandidatesRef.current({
          current: defaultDetails.current,
          candidates: mergeCandidateDetails(defaultDetails.candidates, results),
        });
      } catch (loadError) {
        if (!controller.signal.aborted) setError(toScannerErrorMessage(loadError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cell.imageIndex, cell.position, defaultDetails, jobUid, open, query]);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setSearchResults([]);
    setError(null);
    setLoading(false);
  }, [open]);

  return (
    <>
      <PopoverButton
        disabled={disabled}
        aria-label={sameAppearanceSelectionRequired ? "같은 모양의 아이템 선택" : "아이템 후보 열기"}
        onMouseEnter={() => onHighlightChange(true)}
        onMouseLeave={() => {
          if (!open) onHighlightChange(false);
        }}
        className="block cursor-pointer rounded-lg leading-none outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default"
      >
        {children}
      </PopoverButton>
      <PopoverPanel
        anchor="bottom"
        className="z-layer-navigation-menu w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg bg-popover p-2 shadow-xl [--anchor-gap:0.375rem]"
      >
        <div className="space-y-1.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="아이템 검색"
            aria-label="아이템 검색"
            className="mb-1 min-w-0 w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {!query.trim() && sameAppearanceSelectionRequired ? (
            <p className="rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200">
              같은 모양의 아이템이 있어요. 맞는 아이템을 선택해 주세요.
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {showingLoading ? <CandidateChoiceSkeleton /> : null}
          {!showingLoading && !query.trim() && current?.unavailable ? (
            <p className="px-2 py-2 text-xs text-destructive">아이템 정보를 찾을 수 없어요.</p>
          ) : null}
          {!showingLoading && !query.trim() && current?.name ? (
            <CandidateChoiceButton
              candidate={{
                uid: current.uid,
                assetUid: current.assetUid ?? current.uid,
                name: current.name,
                description: current.description,
                resourceType: current.resourceType ?? ResourceTypeEnum.Item,
                rarity: current.rarity ?? 0,
                currentQuantity: current.currentQuantity,
                score: null,
                selectionSource: "stored_recognition",
              }}
              selected={current.uid === selectedUid}
              onSelect={() => {
                onSelect(current.uid);
                close();
              }}
            />
          ) : null}
          {!showingLoading && candidates.length === 0 && (query.trim() || (!current?.name && !current?.unavailable)) ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">검색 결과가 없어요.</p>
          ) : null}
          <div className="max-h-[min(20rem,50vh)] space-y-0.5 overflow-y-auto">
            {candidates.map((candidate) => (
              <CandidateChoiceButton
                key={`${candidate.uid}-${candidate.selectionSource}`}
                candidate={candidate}
                selected={candidate.uid === selectedUid}
                onSelect={() => {
                  onSelect(candidate.uid);
                  close();
                }}
              />
            ))}
          </div>
          {defaultDetails || error ? (
            <button
              type="button"
              onClick={() => {
                onExclude();
                close();
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md p-2 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <XMarkIcon className="size-5" aria-hidden="true" />
              </span>
              이 아이템을 인식 대상에서 제외
            </button>
          ) : null}
        </div>
      </PopoverPanel>
    </>
  );
}

function CandidateChoiceSkeleton() {
  return (
    <div
      role="status"
      aria-label="아이템 후보를 불러오는 중"
      className="flex animate-pulse items-start gap-2.5 rounded-md p-2"
    >
      <span className="size-10 shrink-0 rounded-md bg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1 space-y-2 py-1" aria-hidden="true">
        <span className="block h-4 w-2/5 rounded-sm bg-muted" />
        <span className="block h-3 w-full rounded-sm bg-muted/70" />
        <span className="block h-3 w-3/4 rounded-sm bg-muted/70" />
      </span>
    </div>
  );
}

function CandidateChoiceButton({
  candidate,
  selected,
  onSelect,
}: {
  candidate: CandidateDetails["candidates"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 rounded-md p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
        selected && "bg-primary/10",
      )}
    >
      <ResourceCard
        itemUid={candidate.assetUid}
        resourceType={candidate.resourceType}
        rarity={candidate.rarity}
        name={candidate.name}
        size="md"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{candidate.name}</span>
        {candidate.description ? (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
            {candidate.description}
          </span>
        ) : null}
      </span>
      {selected ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
    </button>
  );
}

function toDefaultCandidateDetails(details: CandidateDetails | undefined): CandidateDetails | null {
  if (!details) return null;
  return {
    current: details.current,
    candidates: details.candidates.filter((candidate) => candidate.selectionSource !== "catalog_search"),
  };
}

function mergeCandidateDetails(
  defaults: CandidateDetails["candidates"],
  searchResults: CandidateDetails["candidates"],
): CandidateDetails["candidates"] {
  const merged = new Map(defaults.map((candidate) => [candidate.uid, candidate]));
  for (const candidate of searchResults) merged.set(candidate.uid, candidate);
  return [...merged.values()];
}

export function CellApplySummaryPanel({ summary }: { summary: CellApplySummary }) {
  return (
    <section className="space-y-2 rounded-lg bg-muted/40 p-4">
      <p className="text-sm font-semibold text-foreground">서버 반영 결과</p>
      <p className="text-sm text-muted-foreground">
        변경 반영 {summary.applicableChanged}개 · 변경 없음 {summary.unchangedSafe}개 · 제외 {summary.omitted}개
      </p>
      {summary.duplicateUids.length > 0 ? (
        <p className="text-xs text-destructive">
          중복으로 제외된 아이템이 있어요. 해당 셀을 하나만 남겨 다시 반영해 주세요.
        </p>
      ) : null}
      {summary.omittedCells.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {summary.omittedCells.slice(0, 5).map((cell) => (
            <li key={`${cell.imageIndex}:${cell.position}`}>
              {cell.imageIndex + 1}번 이미지 {cell.position + 1}번 셀: {formatOmissionReason(cell.reason)}
            </li>
          ))}
          {summary.omittedCells.length > 5 ? <li>외 {summary.omittedCells.length - 5}개</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

function formatOmissionReason(reason: string): string {
  if (reason === "duplicate_uid") return "아이템 중복";
  if (reason === "unresolved_item") return "아이템 확인 필요";
  if (reason === "unresolved_quantity") return "수량 확인 필요";
  if (reason === "excluded") return "사용자 제외";
  return "반영 제외";
}
