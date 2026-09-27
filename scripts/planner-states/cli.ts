import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectionStringFromPostgresEnvironment } from "../local-dev-env.mjs";
import { reportDatabaseError } from "../local-postgres.mjs";
import { createUserLabeler, parsePlannerStatesCommand, type PlannerStatesCommand } from "./command";
import {
  backfillPlannerStatesInDatabase,
  checkPlannerStateParityInDatabase,
  type PlannerStateBackfillResult,
  type PlannerStateConversionFailure,
  type PlannerStateParityResult,
} from "~/db/postgres/planner-states";

function sslOptions(connectionString: string): false | true | { rejectUnauthorized: false } {
  const mode = process.env.PGSSLMODE ?? new URL(connectionString).searchParams.get("sslmode") ?? "disable";
  if (mode === "disable") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return true;
}

function logConversionFailures(failures: PlannerStateConversionFailure[], userLabel: (userId: number) => string): void {
  for (const failure of failures) console.error(`Conversion failed for ${userLabel(failure.userId)}: ${failure.field}`);
}

function printBackfillResult(result: PlannerStateBackfillResult, dryRun: boolean): void {
  console.log(`Source users: ${result.sourceUserCount}`);
  console.log(`Documents already present: ${result.alreadyPresent}`);
  console.log(`${dryRun ? "Documents that would be inserted" : "Documents inserted"}: ${dryRun ? result.wouldInsert : result.inserted}`);
}

const sourceTableLabels = {
  resources: "pyroxene_owned_resources",
  timelineItems: "pyroxene_timeline_items",
  plannerOptions: "pyroxene_planner_options",
  collectedSources: "pyroxene_collected_sources",
  eventData: "pyroxene_event_data",
  eventShops: "event_shop_states",
} as const;

function printParityResult(result: PlannerStateParityResult, userLabel: (userId: number) => string): void {
  for (const [key, tableName] of Object.entries(sourceTableLabels)) {
    console.log(`${tableName} users: ${result.sourceUserCounts[key as keyof typeof sourceTableLabels]}`);
  }
  console.log(`planner_states documents: ${result.documentCount}`);
  for (const mismatch of result.mismatches) {
    console.error(`Parity mismatch for ${userLabel(mismatch.userId)}: ${mismatch.reasons.join(", ")}`);
  }
  logConversionFailures(result.conversionFailures, userLabel);
  if (result.mismatches.length === 0 && result.conversionFailures.length === 0) {
    console.log("Planner state parity: 0 mismatches");
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  let command: PlannerStatesCommand;
  try {
    command = parsePlannerStatesCommand(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid command.");
    process.exitCode = 2;
    return;
  }
  if (command.command === "help") {
    console.log("Usage: node scripts/planner-states/run.mjs {backfill [--dry-run]|parity}");
    return;
  }

  let connectionString: string;
  try {
    connectionString = connectionStringFromPostgresEnvironment(process.env);
  } catch (error) {
    console.error(reportDatabaseError(error as Error));
    process.exitCode = 1;
    return;
  }
  const client = new pg.Client({
    connectionString,
    ssl: sslOptions(connectionString),
    connectionTimeoutMillis: 3000,
    statement_timeout: 60000,
    lock_timeout: 5000,
    application_name: "mollulog-planner-states",
  });
  const userLabel = createUserLabeler();
  try {
    await client.connect();
    await client.query("SET search_path TO public");
    const db = drizzle(client);
    if (command.command === "backfill") {
      const result = await backfillPlannerStatesInDatabase(db, { dryRun: command.dryRun });
      printBackfillResult(result, command.dryRun);
      logConversionFailures(result.conversionFailures, userLabel);
      if (result.conversionFailures.length > 0) process.exitCode = 1;
      return;
    }

    const result = await checkPlannerStateParityInDatabase(db);
    printParityResult(result, userLabel);
    if (result.mismatches.length > 0 || result.conversionFailures.length > 0) process.exitCode = 1;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "PlannerStateProjectionError"
        ? error.message
        : reportDatabaseError(error as Error);
    console.error(message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
