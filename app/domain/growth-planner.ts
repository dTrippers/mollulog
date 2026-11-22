// The student growth planner's sort choice, stored per account in the planner state document.

export const GROWTH_SORT_ORDERS = [
  "planner-newest",
  "planner-oldest",
  "student-newest",
  "student-oldest",
  "name",
  "manual",
] as const;

export type GrowthSortOrder = (typeof GROWTH_SORT_ORDERS)[number];

// Until the user picks a sort, the planner is in 수동 정렬. A student without a position sorts as 플래너 등록 최신순, so
// the first order matches the former default.
export const DEFAULT_GROWTH_SORT_ORDER: GrowthSortOrder = "manual";

export type GrowthPlannerState = { sortOrder: GrowthSortOrder };

export function isGrowthSortOrder(value: unknown): value is GrowthSortOrder {
  return typeof value === "string" && (GROWTH_SORT_ORDERS as readonly string[]).includes(value);
}

/** Null for a value that is not a stored growth planner state. */
export function normalizeGrowthPlannerState(value: unknown): GrowthPlannerState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { sortOrder } = value as Record<string, unknown>;
  return isGrowthSortOrder(sortOrder) ? { sortOrder } : null;
}

export type SortableGrowthStudent = {
  uid: string;
  name: string;
  // The student's release order in the game data; higher is newer.
  order: number;
  plannerCreatedAt: string | null;
  plannerPosition: number | null;
};

function comparePlannerNewest(a: SortableGrowthStudent, b: SortableGrowthStudent): number {
  if (a.plannerCreatedAt == null) return b.plannerCreatedAt == null ? 0 : 1;
  if (b.plannerCreatedAt == null) return -1;
  return b.plannerCreatedAt.localeCompare(a.plannerCreatedAt);
}

function compareName(a: SortableGrowthStudent, b: SortableGrowthStudent): number {
  return a.name.localeCompare(b.name, "ko") || a.uid.localeCompare(b.uid);
}

/**
 * Manual order: a student without a position (added since the last reorder, or never reordered) sits above every
 * positioned one, newest planner registration first, so the order starts as 플래너 등록 최신순 and a new student appears
 * at the top.
 */
export function sortGrowthStudents<T extends SortableGrowthStudent>(
  students: readonly T[],
  sortOrder: GrowthSortOrder,
): T[] {
  return [...students].sort((a, b) => {
    if (sortOrder === "manual") {
      if (a.plannerPosition == null || b.plannerPosition == null) {
        if (a.plannerPosition != null) return 1;
        if (b.plannerPosition != null) return -1;
        return comparePlannerNewest(a, b) || compareName(a, b);
      }
      return a.plannerPosition - b.plannerPosition || compareName(a, b);
    }

    if (sortOrder === "planner-newest" || sortOrder === "planner-oldest") {
      if (a.plannerCreatedAt == null) return b.plannerCreatedAt == null ? compareName(a, b) : 1;
      if (b.plannerCreatedAt == null) return -1;
      const createdAtComparison =
        sortOrder === "planner-newest"
          ? b.plannerCreatedAt.localeCompare(a.plannerCreatedAt)
          : a.plannerCreatedAt.localeCompare(b.plannerCreatedAt);
      if (createdAtComparison !== 0) return createdAtComparison;
    }

    if (sortOrder === "student-newest" || sortOrder === "student-oldest") {
      const orderComparison = sortOrder === "student-newest" ? b.order - a.order : a.order - b.order;
      if (orderComparison !== 0) return orderComparison;
    }

    return compareName(a, b);
  });
}

/** Moves one student up or down by one place in an ordered list of uids. Unknown uids and edge moves keep the list. */
export function moveGrowthStudent(orderedUids: readonly string[], uid: string, offset: -1 | 1): string[] {
  const index = orderedUids.indexOf(uid);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= orderedUids.length) return [...orderedUids];
  const next = [...orderedUids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Moves one student to a new index, for a drag. */
export function placeGrowthStudent(orderedUids: readonly string[], uid: string, targetIndex: number): string[] {
  const index = orderedUids.indexOf(uid);
  if (index < 0) return [...orderedUids];
  const next = orderedUids.filter((candidate) => candidate !== uid);
  const clamped = Math.max(0, Math.min(next.length, targetIndex));
  next.splice(clamped, 0, uid);
  return next;
}
