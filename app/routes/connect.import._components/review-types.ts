import type { ItemCatalogResource } from "~/models/item-catalog";

export type SyncDraftDisplayMetadata = {
  label: string;
  item?: ItemCatalogResource;
  studentUid?: string;
  equipments?: string[];
  hasGear?: boolean;
  initialTier?: number;
};

/**
 * What the review's action returns. `error` carries only text that is safe to show: a conflict or a rejected
 * selection. Every other failure is a code, and the screen words it, so raw errors never reach the page.
 */
export type SyncDraftReviewActionData = {
  intent?: "apply" | "discard";
  code?:
    | "unauthorized"
    | "not_found"
    | "already_processed"
    | "invalid_input"
    | "invalid_selection"
    | "conflict"
    | "apply_failed"
    | "discard_failed"
    | "unsupported";
  error?: string;
  fieldErrors?: Record<string, string>;
};
