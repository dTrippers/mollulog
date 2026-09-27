import { createHmac, randomBytes } from "node:crypto";

export type PlannerStatesCommand = { command: "backfill"; dryRun: boolean } | { command: "parity" } | { command: "help" };

export function parsePlannerStatesCommand(args: string[]): PlannerStatesCommand {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") return { command: "help" };
  if (args[0] === "backfill") {
    if (args.length === 1) return { command: "backfill", dryRun: false };
    if (args.length === 2 && args[1] === "--dry-run") return { command: "backfill", dryRun: true };
    throw new Error("Usage: node scripts/planner-states/run.mjs backfill [--dry-run]");
  }
  if (args[0] === "parity" && args.length === 1) return { command: "parity" };
  throw new Error("Usage: node scripts/planner-states/run.mjs {backfill [--dry-run]|parity}");
}

export function createUserLabeler(): (userId: number) => string {
  const key = randomBytes(32);
  return (userId) => `user-${createHmac("sha256", key).update(String(userId)).digest("hex").slice(0, 10)}`;
}
