import type { UtcIsoString } from "~/lib/date-time";

export type FavoriteStudent = {
  uid: string;
  studentId: string;
  contentId: string;
};

export type FavoriteStudentRecord = FavoriteStudent & {
  id: number;
  userId: number;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
};

export type FavoritedCount = {
  studentId: string;
  contentId: string;
  count: number;
};

export type FavoriteParity = {
  matched: boolean;
  sourceCount: number;
  targetCount: number;
  missingTargetKeys: string[];
  unexpectedTargetKeys: string[];
  mismatchedKeys: string[];
};

function compareByKey<T>(
  source: T[],
  target: T[],
  keyOf: (value: T) => string,
  serialize: (value: T) => string,
): FavoriteParity {
  const sourceByKey = new Map(source.map((value) => [keyOf(value), value]));
  const targetByKey = new Map(target.map((value) => [keyOf(value), value]));
  const missingTargetKeys = [...sourceByKey.keys()].filter((key) => !targetByKey.has(key)).sort();
  const unexpectedTargetKeys = [...targetByKey.keys()].filter((key) => !sourceByKey.has(key)).sort();
  const mismatchedKeys = [...sourceByKey.entries()]
    .filter(([key, value]) => {
      const targetValue = targetByKey.get(key);
      return targetValue !== undefined && serialize(value) !== serialize(targetValue);
    })
    .map(([key]) => key)
    .sort();

  return {
    matched: missingTargetKeys.length === 0 && unexpectedTargetKeys.length === 0 && mismatchedKeys.length === 0,
    sourceCount: source.length,
    targetCount: target.length,
    missingTargetKeys,
    unexpectedTargetKeys,
    mismatchedKeys,
  };
}

export function compareFavoriteStudents(source: FavoriteStudent[], target: FavoriteStudent[]): FavoriteParity {
  return compareByKey(
    source,
    target,
    (favorite) => favorite.uid,
    (favorite) => `${favorite.contentId}\u0000${favorite.studentId}`,
  );
}

export function compareFavoritedCounts(source: FavoritedCount[], target: FavoritedCount[]): FavoriteParity {
  const positiveSource = source.filter((row) => row.count > 0);
  const positiveTarget = target.filter((row) => row.count > 0);
  return compareByKey(
    positiveSource,
    positiveTarget,
    (row) => `${row.contentId}\u0000${row.studentId}`,
    (row) => String(row.count),
  );
}

export function equalFavoriteRecords(left: FavoriteStudentRecord, right: FavoriteStudentRecord): boolean {
  return (
    left.id === right.id &&
    left.uid === right.uid &&
    left.userId === right.userId &&
    left.studentId === right.studentId &&
    left.contentId === right.contentId &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}
