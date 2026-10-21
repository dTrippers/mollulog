import { calculateResourceLedger } from "./ledger";
import type { RequiredQuantitiesInput } from "./types";

/**
 * Returns the quantities that still need to be obtained from enabled stages.
 */
export function calculateRequiredQuantities(input: RequiredQuantitiesInput): Record<string, number> {
  return calculateResourceLedger(input).remainingToFarm;
}
