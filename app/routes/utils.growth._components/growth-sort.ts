import type { GrowthStudent } from "./types";

export type GrowthSortOrder = "planner-newest" | "planner-oldest" | "student-newest" | "student-oldest" | "name";

export function isGrowthSortOrder(value: unknown): value is GrowthSortOrder {
  return (
    value === "planner-newest" ||
    value === "planner-oldest" ||
    value === "student-newest" ||
    value === "student-oldest" ||
    value === "name"
  );
}

type SortableGrowthStudent = Pick<GrowthStudent, "uid" | "name" | "order" | "plannerCreatedAt">;

export function sortGrowthStudents<T extends SortableGrowthStudent>(students: T[], sortOrder: GrowthSortOrder): T[] {
  return [...students].sort((a, b) => {
    if (sortOrder === "planner-newest" || sortOrder === "planner-oldest") {
      if (a.plannerCreatedAt == null) return b.plannerCreatedAt == null ? 0 : 1;
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

    return a.name.localeCompare(b.name, "ko") || a.uid.localeCompare(b.uid);
  });
}
