import { pgGrowthResourceInventoryTable } from "~/db/postgres/schema";

/** PostgreSQL is the canonical store; retain this export for model compatibility. */
export const growthResourceInventoryTable = pgGrowthResourceInventoryTable;
