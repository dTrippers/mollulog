export function isUniqueConstraintError(err: Error): { table: string; column: string } | null {
  const match = err.message.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
  if (match) {
    return { table: match[1], column: match[2] };
  }

  return null;
}

/**
 * Returns the PostgreSQL constraint name for a unique violation, if present. Drizzle wraps a failed query's pg error
 * in a DrizzleQueryError as its `cause`, so the cause chain is searched too.
 */
export function postgresUniqueConstraintName(err: unknown): string | null {
  let current = err;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    const value = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (value.code === "23505") {
      return typeof value.constraint === "string" && value.constraint.length > 0 ? value.constraint : null;
    }
    current = value.cause;
  }
  return null;
}
