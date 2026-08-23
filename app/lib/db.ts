export function isUniqueConstraintError(err: Error): { table: string; column: string } | null {
  const match = err.message.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
  if (match) {
    return { table: match[1], column: match[2] };
  }

  return null;
}

/** Returns the PostgreSQL constraint name for a unique violation, if present. */
export function postgresUniqueConstraintName(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const value = err as { code?: unknown; constraint?: unknown };
  if (value.code !== "23505" || typeof value.constraint !== "string" || value.constraint.length === 0) {
    return null;
  }
  return value.constraint;
}
