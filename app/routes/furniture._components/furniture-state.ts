import type { FurnitureCategory, FurnitureRarity } from "~/domain/furniture-catalog";

export type FurnitureCatalogMode = "themes" | "all";

export type StoredFurnitureCatalogState = {
  mode: FurnitureCatalogMode;
  categories: FurnitureCategory[];
  rarities: FurnitureRarity[];
  onlyWithInteractionStudents: boolean;
};

export const FURNITURE_CATALOG_STORAGE_KEY = "mollulog::furniture-catalog::view";
export const MAX_FURNITURE_INVENTORY_QUANTITY = 2_147_483_647;

export const FURNITURE_INPUT_ERROR_MESSAGES = {
  emptyRecorded: "기록한 수량은 비워 둘 수 없어요.",
  notNonNegativeInteger: "0 이상의 정수만 입력할 수 있어요.",
  exceedsMax: "최대 수량(2,147,483,647)보다 많아요.",
  saveFailed: "저장하지 못했어요.",
} as const;

const VALID_CATEGORIES = new Set<FurnitureCategory>(["furnitures", "decorations", "interiors"]);
const VALID_RARITIES = new Set<FurnitureRarity>([1, 2, 3, 4]);

export function isValidFurnitureInventoryQuantityInput(value: string): boolean {
  const normalizedValue = value.trim();
  const quantity = Number(normalizedValue);
  const digitsOnly =
    normalizedValue.length > 0 && [...normalizedValue].every((character) => character >= "0" && character <= "9");
  return digitsOnly && Number.isSafeInteger(quantity) && quantity <= MAX_FURNITURE_INVENTORY_QUANTITY;
}

export function getFurnitureQuantityInputError(
  value: string,
  { hasStoredQuantity }: { hasStoredQuantity: boolean },
): string | null {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return hasStoredQuantity ? FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded : null;
  }
  const digitsOnly = [...normalizedValue].every((character) => character >= "0" && character <= "9");
  if (!digitsOnly) {
    return FURNITURE_INPUT_ERROR_MESSAGES.notNonNegativeInteger;
  }
  const quantity = Number(normalizedValue);
  if (!Number.isSafeInteger(quantity) || quantity > MAX_FURNITURE_INVENTORY_QUANTITY) {
    return FURNITURE_INPUT_ERROR_MESSAGES.exceedsMax;
  }
  return null;
}

export function getFurnitureQuantityAriaDescription({
  draftValue,
  errorMessage,
}: {
  draftValue: string;
  errorMessage: string | null;
}): string {
  if (errorMessage) {
    return errorMessage;
  }
  if (draftValue === "") {
    return "미등록 상태예요. 수량을 확인한 뒤 0 이상으로 입력해 주세요.";
  }
  if (draftValue === "0") {
    return "확인된 미보유 상태예요.";
  }
  return "보유 수량이에요.";
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

export function readStoredFurnitureCatalogState(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): StoredFurnitureCatalogState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FURNITURE_CATALOG_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const mode: FurnitureCatalogMode = record.mode === "all" ? "all" : "themes";
    const categories = Array.isArray(record.categories)
      ? Array.from(
          new Set(
            record.categories.filter(
              (item): item is FurnitureCategory => typeof item === "string" && VALID_CATEGORIES.has(item as FurnitureCategory),
            ),
          ),
        )
      : [];
    const rarities = Array.isArray(record.rarities)
      ? Array.from(
          new Set(
            record.rarities.filter(
              (item): item is FurnitureRarity => typeof item === "number" && VALID_RARITIES.has(item as FurnitureRarity),
            ),
          ),
        )
      : [];
    const onlyWithInteractionStudents = record.onlyWithInteractionStudents === true;
    return { mode, categories, rarities, onlyWithInteractionStudents };
  } catch {
    return null;
  }
}

export function writeStoredFurnitureCatalogState(
  state: StoredFurnitureCatalogState,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(FURNITURE_CATALOG_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}
