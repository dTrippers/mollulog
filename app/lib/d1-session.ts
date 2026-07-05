export function withD1Session(env: Env, constraint: D1SessionConstraint): Env {
  // Drizzle's D1 driver only needs prepare/batch, which D1DatabaseSession provides.
  return { ...env, DB: env.DB.withSession(constraint) as unknown as D1Database };
}
