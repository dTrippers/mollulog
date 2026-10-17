// Completion summaries for an applied scanner job, built from the saved apply record (sync draft entries).
// Pure: the view loads the record and the catalogs, and these functions only combine them.

export type CellAddress = { imageIndex: number; position: number };

export type CompletionEntry = { entryKey: string; value: number; meta: string | null };

export type ItemCompletionSummary = {
  appliedCount: number;
  unappliedCellCount: number;
  items: Array<{
    uid: string;
    // The image key and type from the catalog. Null when the catalog no longer has the resource.
    assetUid: string | null;
    resourceType: string | null;
    name: string | null;
    quantity: number;
  }>;
};

export type StudentCompletionSummary = {
  appliedCount: number;
  excludedCount: number;
  applied: Array<{ uid: string; name: string | null }>;
  excluded: Array<{ uid: string; name: string | null }>;
};

// A saved entry whose cell list cannot be read makes the whole summary unavailable (null), never a partial count.
export function buildItemCompletionSummary(
  entries: readonly CompletionEntry[],
  cells: readonly CellAddress[],
  catalog: Readonly<Record<string, { uid: string; type: string; name: string } | undefined>>,
): ItemCompletionSummary | null {
  const coveredCellKeys = new Set<string>();
  const items: ItemCompletionSummary["items"] = [];
  for (const entry of entries) {
    const coveredCells = readCoveredCells(entry.meta);
    if (!coveredCells) return null;
    for (const cell of coveredCells) coveredCellKeys.add(cellAddressKey(cell));
    const resource = catalog[entry.entryKey];
    items.push({
      uid: entry.entryKey,
      assetUid: resource?.uid ?? null,
      resourceType: resource?.type ?? null,
      name: resource?.name ?? null,
      quantity: entry.value,
    });
  }
  return {
    appliedCount: items.length,
    unappliedCellCount: cells.filter((cell) => !coveredCellKeys.has(cellAddressKey(cell))).length,
    items,
  };
}

// Excluded students are the result's students without a saved entry.
export function buildStudentCompletionSummary(
  entries: readonly Pick<CompletionEntry, "entryKey">[],
  students: ReadonlyArray<{ studentUid: string }>,
  catalog: Readonly<Record<string, { name: string } | undefined>>,
): StudentCompletionSummary {
  const appliedStudentUids = new Set(entries.map((entry) => entry.entryKey));
  const applied = entries.map((entry) => ({ uid: entry.entryKey, name: catalog[entry.entryKey]?.name ?? null }));
  const excluded = [...new Set(students.map(({ studentUid }) => studentUid))]
    .filter((studentUid) => !appliedStudentUids.has(studentUid))
    .map((studentUid) => ({ uid: studentUid, name: catalog[studentUid]?.name ?? null }));
  return { appliedCount: applied.length, excludedCount: excluded.length, applied, excluded };
}

function cellAddressKey({ imageIndex, position }: CellAddress): string {
  return `${imageIndex}:${position}`;
}

function readCoveredCells(meta: string | null): CellAddress[] | null {
  if (meta === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(meta);
  } catch {
    return null;
  }
  const cells = (parsed as { cells?: unknown } | null)?.cells;
  if (cells === undefined) return [];
  if (!Array.isArray(cells)) return null;
  const addresses: CellAddress[] = [];
  for (const cell of cells) {
    const { imageIndex, position } = (cell ?? {}) as Partial<CellAddress>;
    if (!Number.isInteger(imageIndex) || !Number.isInteger(position)) return null;
    addresses.push({ imageIndex: imageIndex as number, position: position as number });
  }
  return addresses;
}
