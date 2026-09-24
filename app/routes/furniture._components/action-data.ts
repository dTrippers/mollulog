export type FurnitureInventoryActionResult =
  | {
      ok: true;
      requestId: string;
      quantities: Record<string, number>;
    }
  | {
      ok: false;
      requestId: string;
      error: string;
    };

export type FurnitureInventorySaveJob = {
  requestId: string;
  furnitureUid: string;
  quantity: number;
  draftValue: string;
};
