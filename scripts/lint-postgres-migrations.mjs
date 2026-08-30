import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length));
}

export function findDisallowedCheckConstraints(migrationsDirectory) {
  const violations = [];
  const filenames = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of filenames) {
    const source = readFileSync(resolve(migrationsDirectory, filename), "utf8");
    const searchableSource = stripSqlComments(source);
    for (const match of searchableSource.matchAll(/\bcheck\s*\(/gi)) {
      const matchIndex = match.index ?? 0;
      const lineNumber = searchableSource.slice(0, matchIndex).split("\n").length;
      const line = source.split("\n")[lineNumber - 1]?.trim() ?? "";
      violations.push({ filename, lineNumber, line });
    }
  }

  return violations;
}

export function findDisallowedSchemaChecks(schemaFile) {
  const source = readFileSync(schemaFile, "utf8");
  return [...source.matchAll(/\bcheck\s*\(/g)].map((match) => {
    const matchIndex = match.index ?? 0;
    const lineNumber = source.slice(0, matchIndex).split("\n").length;
    return {
      filename: schemaFile,
      lineNumber,
      line: source.split("\n")[lineNumber - 1]?.trim() ?? "",
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const migrationsDirectory = resolve(process.argv[2] ?? "db/postgres/migrations");
  const schemaFile = resolve(process.argv[3] ?? "app/db/postgres/schema.ts");
  const violations = [
    ...findDisallowedCheckConstraints(migrationsDirectory),
    ...findDisallowedSchemaChecks(schemaFile),
  ];
  if (violations.length > 0) {
    console.error("PostgreSQL migrations and schema must not add CHECK constraints:");
    for (const violation of violations) {
      console.error(`- ${violation.filename}:${violation.lineNumber} ${violation.line}`);
    }
    process.exitCode = 1;
  }
}
