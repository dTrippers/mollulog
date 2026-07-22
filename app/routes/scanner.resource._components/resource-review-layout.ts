export type ReviewLayoutComponent = {
  placements?: Array<{ filename: string; start: number; cell_count: number }>;
  positions?: Array<{
    position: number;
    status?: string;
    resource_uid?: string | null;
  }>;
};

export type ReviewLayoutItem = {
  resource_uid: string;
  source_images: string[];
};

export type ReviewSlot = { position: number; itemIndex: number | null };

export function buildImageReviewSlots(
  components: ReviewLayoutComponent[] | undefined,
  items: ReviewLayoutItem[],
  selectedSource: string | null,
): ReviewSlot[] {
  const itemIndexByUid = new Map(items.map((item, index) => [item.resource_uid, index]));

  if (selectedSource) {
    for (const component of components ?? []) {
      const placement = component.placements?.find((candidate) => candidate.filename === selectedSource);
      if (!placement) continue;

      const positionsByIndex = new Map(component.positions?.map((position) => [position.position, position]) ?? []);
      return Array.from({ length: placement.cell_count }, (_, offset) => {
        const position = positionsByIndex.get(placement.start + offset);
        const itemIndex = position?.resource_uid ? itemIndexByUid.get(position.resource_uid) : undefined;
        return { position: offset, itemIndex: itemIndex ?? null };
      });
    }
  }

  return items.flatMap((item, itemIndex) =>
    !selectedSource || item.source_images.includes(selectedSource) ? [{ position: itemIndex, itemIndex }] : [],
  );
}
