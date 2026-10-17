export type RelationshipGiftPlanPayload =
  | { studentId: string; items: Record<string, number>; stateFormat: "nullable" }
  | {
      studentId: string;
      items: Record<string, number>;
      currentLevel: number;
      currentExp: number | null;
      targetLevel: number;
    };

export type StudentItemsMap = Map<string, { uid: string; items: Record<string, number> }>;

export function buildGiftPlanSavePayload(
  studentId: string,
  items: Record<string, number>,
): Extract<RelationshipGiftPlanPayload, { stateFormat: "nullable" }> {
  return { studentId, items, stateFormat: "nullable" };
}

export function getSavedGiftPlanSnapshot(
  payloads: readonly Pick<RelationshipGiftPlanPayload, "studentId" | "items">[],
): Array<{ studentUid: string; items: Record<string, number> }> {
  return payloads.map(({ studentId, items }) => ({ studentUid: studentId, items: { ...items } }));
}

export function createStudentItemsMap(
  students: Array<{ uid: string; items: Record<string, number> }>,
): StudentItemsMap {
  return new Map(students.map(({ uid, items }) => [uid, { uid, items: { ...items } }]));
}

export function syncStudentItemsFromProps(
  currentItems: StudentItemsMap,
  savedBaseline: StudentItemsMap | null,
  nextProps: StudentItemsMap,
): StudentItemsMap {
  if (savedBaseline == null) return nextProps;
  const syncedItems = new Map(nextProps);
  for (const [studentUid, nextStudent] of nextProps) {
    const baselineStudent = savedBaseline.get(studentUid);
    const currentStudent = currentItems.get(studentUid);
    if (!baselineStudent || !currentStudent) continue;
    const items = { ...nextStudent.items };
    const itemUids = new Set([...Object.keys(baselineStudent.items), ...Object.keys(currentStudent.items)]);
    for (const itemUid of itemUids) {
      if ((currentStudent.items[itemUid] ?? 0) === (baselineStudent.items[itemUid] ?? 0)) continue;
      if (Object.hasOwn(currentStudent.items, itemUid)) items[itemUid] = currentStudent.items[itemUid] ?? 0;
      else delete items[itemUid];
    }
    syncedItems.set(studentUid, { uid: studentUid, items });
  }
  return syncedItems;
}

export function updateStudentGiftPlanQuantity(
  currentItems: StudentItemsMap,
  studentUid: string,
  itemUid: string,
  quantity: number,
): StudentItemsMap {
  const nextItems = new Map(currentItems);
  const student = nextItems.get(studentUid);
  nextItems.set(studentUid, { uid: studentUid, items: { ...student?.items, [itemUid]: quantity } });
  return nextItems;
}

export function updateSavedGiftPlanBaseline(
  baseline: StudentItemsMap,
  savedPlans: Array<{ studentUid: string; items: Record<string, number> }>,
): StudentItemsMap {
  const nextBaseline = new Map(baseline);
  for (const { studentUid, items } of savedPlans)
    nextBaseline.set(studentUid, { uid: studentUid, items: { ...items } });
  return nextBaseline;
}

export function hasStudentGiftPlanChanges(
  currentItems: StudentItemsMap,
  baseline: StudentItemsMap,
  studentUid: string,
  itemUid: string,
): boolean {
  return (currentItems.get(studentUid)?.items[itemUid] ?? 0) !== (baseline.get(studentUid)?.items[itemUid] ?? 0);
}
