import { nanoid } from "nanoid";
import { Client } from "pg";

const usage = `Usage:
  node scripts/student-state-migration.mjs preflight --schema <schema>
  node scripts/student-state-migration.mjs backfill --schema <schema> --confirm-no-external-writers
  node scripts/student-state-migration.mjs parity --schema <schema> --confirm-no-external-writers

The schema is always explicit and may be a service schema such as public. The command only accepts PGHOST=127.0.0.1.`;

const requiredColumns = {
  recruited_students: [
    "uid", "user_id", "student_uid", "tier", "level", "skill_ex", "skill_normal", "skill_enhanced", "skill_sub",
    "equip1", "equip2", "equip3", "equip_special", "equip1_level", "equip2_level", "equip3_level", "weapon_level",
    "ability_hp", "ability_atk", "ability_heal", "created_at",
  ],
  student_growth: [
    "uid", "user_id", "student_uid", "level", "skill_ex", "skill_normal", "skill_enhanced", "skill_sub",
    "equip1", "equip2", "equip3", "equip_special", "target_level", "target_skill_ex", "target_skill_normal",
    "target_skill_enhanced", "target_skill_sub", "target_equip1", "target_equip2", "target_equip3",
    "target_equip_special", "target_tier", "target_weapon_level", "target_ability_hp", "target_ability_atk",
    "target_ability_heal", "created_at",
  ],
  user_relationship_levels: [
    "uid", "user_id", "student_id", "current_level", "current_exp", "target_level", "items", "created_at",
  ],
  student_states: [
    "uid", "user_id", "student_uid", "recruited_student_uid", "relationship_level_uid", "tier", "level", "skill_ex",
    "skill_normal", "skill_enhanced", "skill_sub", "equip1", "equip2", "equip3", "equip_special", "equip1_level",
    "equip2_level", "equip3_level", "weapon_level", "ability_hp", "ability_atk", "ability_heal",
    "relationship_current_level", "relationship_current_exp", "recruited_at", "deleted_at", "created_at", "updated_at",
  ],
  student_targets: [
    "uid", "user_id", "student_uid", "student_growth_uid", "relationship_level_uid", "target_level", "target_skill_ex",
    "target_skill_normal", "target_skill_enhanced", "target_skill_sub", "target_equip1", "target_equip2", "target_equip3",
    "target_equip_special", "target_tier", "target_weapon_level", "target_ability_hp", "target_ability_atk",
    "target_ability_heal", "relationship_target_level", "gift_plan", "planner_added_at", "deleted_at", "created_at", "updated_at",
  ],
  student_state_audits: [
    "user_id", "student_uid", "actor_user_id", "source", "source_ref", "before_state", "after_state", "created_at",
  ],
  student_state_migration_control: ["key", "nullable_semantics_enabled", "updated_at"],
};

function argument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value ?? "") || value === "information_schema" || value.startsWith("pg_")) {
    throw new Error("An explicit user --schema identifier is required.");
  }
  return `"${value}"`;
}

function normalizeObject(value, studentUid) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Legacy gift plan is invalid for ${studentUid}.`);
  }
  const normalized = {};
  for (const [uid, count] of Object.entries(parsed)) {
    if (typeof count !== "number" || !Number.isFinite(count)) {
      throw new Error(`Legacy gift plan is invalid for ${studentUid}.`);
    }
    normalized[uid] = count;
  }
  return normalized;
}

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sortedValue(entry)]));
  }
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(sortedValue(left)) === JSON.stringify(sortedValue(right));
}

async function connect() {
  if (process.env.PGHOST !== "127.0.0.1") {
    throw new Error("Student-state migration tooling only accepts PGHOST=127.0.0.1.");
  }
  const client = new Client();
  await client.connect();
  return client;
}

async function setSchema(client, schema) {
  await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
  const requiredTables = Object.keys(requiredColumns);
  const tables = await client.query(
    "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])",
    [schema, requiredTables],
  );
  const baseTables = new Set(tables.rows.filter((row) => row.table_type === "BASE TABLE").map((row) => row.table_name));
  if (requiredTables.some((table) => !baseTables.has(table))) {
    throw new Error("The selected schema must contain the legacy and additive student-state base tables.");
  }
  const columns = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = ANY($2::text[])",
    [schema, requiredTables],
  );
  const columnsByTable = new Map();
  for (const row of columns.rows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
    columnsByTable.get(row.table_name).add(row.column_name);
  }
  const missing = Object.entries(requiredColumns).flatMap(([table, names]) =>
    names.filter((name) => !columnsByTable.get(table)?.has(name)).map((name) => `${table}.${name}`),
  );
  if (missing.length > 0) throw new Error(`The selected schema has an incompatible student-state table structure: ${missing.join(", ")}.`);
}

async function listUserIds(client) {
  const { rows } = await client.query(`
    SELECT user_id FROM recruited_students
    UNION SELECT user_id FROM student_growth
    UNION SELECT user_id FROM user_relationship_levels
    UNION SELECT user_id FROM student_states
    UNION SELECT user_id FROM student_targets
    ORDER BY user_id
  `);
  return rows.map((row) => row.user_id);
}

async function readLegacyRows(client, userId) {
  const { rows } = await client.query(
    `
      SELECT keys.student_uid, s.uid AS state_projection_uid, t.uid AS target_projection_uid,
        r.uid AS recruited_uid, r.tier, r.level, r.skill_ex, r.skill_normal, r.skill_enhanced, r.skill_sub,
        r.equip1, r.equip2, r.equip3, r.equip_special, r.equip1_level, r.equip2_level, r.equip3_level,
        r.weapon_level, r.ability_hp, r.ability_atk, r.ability_heal,
        CASE WHEN r.uid IS NULL THEN NULL ELSE to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS recruited_at,
        g.uid AS growth_uid, g.level AS legacy_growth_level, g.skill_ex AS legacy_growth_skill_ex,
        g.skill_normal AS legacy_growth_skill_normal, g.skill_enhanced AS legacy_growth_skill_enhanced,
        g.skill_sub AS legacy_growth_skill_sub, g.equip1 AS legacy_growth_equip1, g.equip2 AS legacy_growth_equip2,
        g.equip3 AS legacy_growth_equip3, g.equip_special AS legacy_growth_equip_special,
        g.target_level, g.target_skill_ex, g.target_skill_normal, g.target_skill_enhanced, g.target_skill_sub,
        g.target_equip1, g.target_equip2, g.target_equip3, g.target_equip_special, g.target_tier,
        g.target_weapon_level, g.target_ability_hp, g.target_ability_atk, g.target_ability_heal,
        CASE WHEN g.uid IS NULL THEN NULL ELSE to_char(g.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS planner_added_at,
        l.uid AS relationship_uid, l.current_level AS relationship_current_level,
        l.current_exp AS relationship_current_exp, l.target_level AS relationship_target_level,
        l.items AS gift_plan
      FROM (
        SELECT student_uid FROM recruited_students WHERE user_id = $1
        UNION SELECT student_uid FROM student_growth WHERE user_id = $1
        UNION SELECT student_id AS student_uid FROM user_relationship_levels WHERE user_id = $1
        UNION SELECT student_uid FROM student_states WHERE user_id = $1
        UNION SELECT student_uid FROM student_targets WHERE user_id = $1
      ) AS keys
      LEFT JOIN recruited_students r ON r.user_id = $1 AND r.student_uid = keys.student_uid
      LEFT JOIN student_growth g ON g.user_id = $1 AND g.student_uid = keys.student_uid
      LEFT JOIN user_relationship_levels l ON l.user_id = $1 AND l.student_id = keys.student_uid
      LEFT JOIN student_states s ON s.user_id = $1 AND s.student_uid = keys.student_uid
      LEFT JOIN student_targets t ON t.user_id = $1 AND t.student_uid = keys.student_uid
      ORDER BY keys.student_uid
    `,
    [userId],
  );
  return rows;
}

function assertSupportedLegacyGrowth(rows) {
  const unsupported = rows.find((row) =>
    [
      row.legacy_growth_level,
      row.legacy_growth_skill_ex,
      row.legacy_growth_skill_normal,
      row.legacy_growth_skill_enhanced,
      row.legacy_growth_skill_sub,
      row.legacy_growth_equip1,
      row.legacy_growth_equip2,
      row.legacy_growth_equip3,
      row.legacy_growth_equip_special,
    ].some((value) => value != null),
  );
  if (unsupported) throw new Error(`Legacy student_growth current values require an operator review for ${unsupported.student_uid}.`);
}

async function upsertState(client, userId, row) {
  const recruited = row.recruited_uid != null;
  const relationship = row.relationship_uid != null;
  if (!recruited && !relationship && row.state_projection_uid == null) return false;
  await client.query(
    `
      INSERT INTO student_states (
        uid, user_id, student_uid, recruited_student_uid, relationship_level_uid, tier,
        level, skill_ex, skill_normal, skill_enhanced, skill_sub, equip1, equip2, equip3,
        equip_special, equip1_level, equip2_level, equip3_level, weapon_level,
        ability_hp, ability_atk, ability_heal, relationship_current_level, relationship_current_exp,
        recruited_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25::timestamptz,
        CASE WHEN $26::boolean THEN NULL ELSE now() END
      )
      ON CONFLICT (user_id, student_uid) DO UPDATE SET
        recruited_student_uid = EXCLUDED.recruited_student_uid,
        relationship_level_uid = EXCLUDED.relationship_level_uid,
        tier = EXCLUDED.tier, level = EXCLUDED.level, skill_ex = EXCLUDED.skill_ex,
        skill_normal = EXCLUDED.skill_normal, skill_enhanced = EXCLUDED.skill_enhanced,
        skill_sub = EXCLUDED.skill_sub, equip1 = EXCLUDED.equip1, equip2 = EXCLUDED.equip2,
        equip3 = EXCLUDED.equip3, equip_special = EXCLUDED.equip_special,
        equip1_level = EXCLUDED.equip1_level, equip2_level = EXCLUDED.equip2_level,
        equip3_level = EXCLUDED.equip3_level, weapon_level = EXCLUDED.weapon_level,
        ability_hp = EXCLUDED.ability_hp, ability_atk = EXCLUDED.ability_atk,
        ability_heal = EXCLUDED.ability_heal,
        relationship_current_level = EXCLUDED.relationship_current_level,
        relationship_current_exp = EXCLUDED.relationship_current_exp,
        recruited_at = EXCLUDED.recruited_at,
        deleted_at = CASE
          WHEN EXCLUDED.deleted_at IS NULL THEN NULL
          ELSE COALESCE(student_states.deleted_at, EXCLUDED.deleted_at)
        END,
        updated_at = now()
    `,
    [
      nanoid(8), userId, row.student_uid, row.recruited_uid, row.relationship_uid, row.tier, row.level,
      row.skill_ex, row.skill_normal, row.skill_enhanced, row.skill_sub, row.equip1, row.equip2,
      row.equip3, row.equip_special, row.equip1_level, row.equip2_level, row.equip3_level,
      row.weapon_level, row.ability_hp, row.ability_atk, row.ability_heal,
      row.relationship_current_level, row.relationship_current_exp, row.recruited_at, recruited || relationship,
    ],
  );
  return true;
}

async function upsertTargets(client, userId, row) {
  const growth = row.growth_uid != null;
  const relationship = row.relationship_uid != null;
  if (!growth && !relationship && row.target_projection_uid == null) return false;
  const giftPlan = relationship ? normalizeObject(row.gift_plan, row.student_uid) : {};
  await client.query(
    `
      INSERT INTO student_targets (
        uid, user_id, student_uid, student_growth_uid, relationship_level_uid,
        target_level, target_skill_ex, target_skill_normal, target_skill_enhanced, target_skill_sub,
        target_equip1, target_equip2, target_equip3, target_equip_special, target_tier,
        target_weapon_level, target_ability_hp, target_ability_atk, target_ability_heal,
        relationship_target_level, gift_plan, planner_added_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21::jsonb, $22::timestamptz,
        CASE WHEN $23::boolean THEN NULL ELSE now() END
      )
      ON CONFLICT (user_id, student_uid) DO UPDATE SET
        student_growth_uid = EXCLUDED.student_growth_uid,
        relationship_level_uid = EXCLUDED.relationship_level_uid,
        target_level = EXCLUDED.target_level, target_skill_ex = EXCLUDED.target_skill_ex,
        target_skill_normal = EXCLUDED.target_skill_normal, target_skill_enhanced = EXCLUDED.target_skill_enhanced,
        target_skill_sub = EXCLUDED.target_skill_sub, target_equip1 = EXCLUDED.target_equip1,
        target_equip2 = EXCLUDED.target_equip2, target_equip3 = EXCLUDED.target_equip3,
        target_equip_special = EXCLUDED.target_equip_special, target_tier = EXCLUDED.target_tier,
        target_weapon_level = EXCLUDED.target_weapon_level, target_ability_hp = EXCLUDED.target_ability_hp,
        target_ability_atk = EXCLUDED.target_ability_atk, target_ability_heal = EXCLUDED.target_ability_heal,
        relationship_target_level = EXCLUDED.relationship_target_level, gift_plan = EXCLUDED.gift_plan,
        planner_added_at = EXCLUDED.planner_added_at,
        deleted_at = CASE
          WHEN EXCLUDED.deleted_at IS NULL THEN NULL
          ELSE COALESCE(student_targets.deleted_at, EXCLUDED.deleted_at)
        END,
        updated_at = now()
    `,
    [
      nanoid(8), userId, row.student_uid, row.growth_uid, row.relationship_uid,
      row.target_level, row.target_skill_ex, row.target_skill_normal, row.target_skill_enhanced,
      row.target_skill_sub, row.target_equip1, row.target_equip2, row.target_equip3,
      row.target_equip_special, row.target_tier, row.target_weapon_level, row.target_ability_hp,
      row.target_ability_atk, row.target_ability_heal, row.relationship_target_level,
      JSON.stringify(giftPlan), row.planner_added_at, growth || relationship,
    ],
  );
  return true;
}

async function readProjectionRows(client, table, userId) {
  if (table === "student_states") {
    const { rows } = await client.query(
      `SELECT *, CASE WHEN recruited_at IS NULL THEN NULL ELSE to_char(recruited_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS recruited_at_exact FROM student_states WHERE user_id = $1`,
      [userId],
    );
    return rows;
  }
  const { rows } = await client.query(
    `SELECT *, CASE WHEN planner_added_at IS NULL THEN NULL ELSE to_char(planner_added_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS planner_added_at_exact FROM student_targets WHERE user_id = $1`,
    [userId],
  );
  return rows;
}

function compareState(row, projected) {
  const expected = {
    recruited_student_uid: row.recruited_uid,
    relationship_level_uid: row.relationship_uid,
    tier: row.tier,
    level: row.level,
    skill_ex: row.skill_ex,
    skill_normal: row.skill_normal,
    skill_enhanced: row.skill_enhanced,
    skill_sub: row.skill_sub,
    equip1: row.equip1,
    equip2: row.equip2,
    equip3: row.equip3,
    equip_special: row.equip_special,
    equip1_level: row.equip1_level,
    equip2_level: row.equip2_level,
    equip3_level: row.equip3_level,
    weapon_level: row.weapon_level,
    ability_hp: row.ability_hp,
    ability_atk: row.ability_atk,
    ability_heal: row.ability_heal,
    relationship_current_level: row.relationship_current_level,
    relationship_current_exp: row.relationship_current_exp,
    recruited_at_exact: row.recruited_at,
  };
  return Boolean(projected) && projected.deleted_at == null && Object.entries(expected).every(([key, value]) => sameValue(projected[key], value));
}

function compareTarget(row, projected) {
  const giftPlan = row.relationship_uid == null ? {} : normalizeObject(row.gift_plan, row.student_uid);
  const expected = {
    student_growth_uid: row.growth_uid,
    relationship_level_uid: row.relationship_uid,
    target_level: row.target_level,
    target_skill_ex: row.target_skill_ex,
    target_skill_normal: row.target_skill_normal,
    target_skill_enhanced: row.target_skill_enhanced,
    target_skill_sub: row.target_skill_sub,
    target_equip1: row.target_equip1,
    target_equip2: row.target_equip2,
    target_equip3: row.target_equip3,
    target_equip_special: row.target_equip_special,
    target_tier: row.target_tier,
    target_weapon_level: row.target_weapon_level,
    target_ability_hp: row.target_ability_hp,
    target_ability_atk: row.target_ability_atk,
    target_ability_heal: row.target_ability_heal,
    relationship_target_level: row.relationship_target_level,
    gift_plan: giftPlan,
    planner_added_at_exact: row.planner_added_at,
  };
  return Boolean(projected) && projected.deleted_at == null && Object.entries(expected).every(([key, value]) => sameValue(projected[key], value));
}

async function checkParity(client, userId) {
  const sourceRows = await readLegacyRows(client, userId);
  assertSupportedLegacyGrowth(sourceRows);
  const states = new Map((await readProjectionRows(client, "student_states", userId)).map((row) => [row.student_uid, row]));
  const targets = new Map((await readProjectionRows(client, "student_targets", userId)).map((row) => [row.student_uid, row]));
  const sourceUids = new Set(sourceRows.map((row) => row.student_uid));
  let mismatches = 0;
  for (const row of sourceRows) {
    const stateExpected = row.recruited_uid != null || row.relationship_uid != null;
    const targetExpected = row.growth_uid != null || row.relationship_uid != null;
    const projectedState = states.get(row.student_uid);
    const projectedTarget = targets.get(row.student_uid);
    if (stateExpected ? !compareState(row, projectedState) : Boolean(projectedState && projectedState.deleted_at == null)) mismatches += 1;
    if (targetExpected ? !compareTarget(row, projectedTarget) : Boolean(projectedTarget && projectedTarget.deleted_at == null)) mismatches += 1;
    states.delete(row.student_uid);
    targets.delete(row.student_uid);
  }
  for (const row of states.values()) if (row.deleted_at == null && !sourceUids.has(row.student_uid)) mismatches += 1;
  for (const row of targets.values()) if (row.deleted_at == null && !sourceUids.has(row.student_uid)) mismatches += 1;
  return mismatches;
}

async function userTransaction(client, userId, operation) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`mollulog:student-state:user:${userId}`]);
    const { rows } = await client.query(
      "SELECT nullable_semantics_enabled FROM student_state_migration_control WHERE key = 'default' FOR SHARE",
    );
    if (rows.length === 0) throw new Error("Student-state migration control row 'default' is missing.");
    if (rows[0].nullable_semantics_enabled) {
      throw new Error("Student-state backfill and parity are disabled after nullable semantics activation.");
    }
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function assertMigrationIsPreActivation(client) {
  const { rows } = await client.query(
    "SELECT nullable_semantics_enabled FROM student_state_migration_control WHERE key = 'default'",
  );
  if (rows.length === 0) throw new Error("Student-state migration control row 'default' is missing.");
  if (rows[0].nullable_semantics_enabled) {
    throw new Error("Student-state backfill and parity are disabled after nullable semantics activation.");
  }
}

async function userSnapshotTransaction(client, operation) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const { rows } = await client.query(
      "SELECT nullable_semantics_enabled FROM student_state_migration_control WHERE key = 'default'",
    );
    if (rows.length === 0) throw new Error("Student-state migration control row 'default' is missing.");
    if (rows[0].nullable_semantics_enabled) {
      throw new Error("Student-state backfill and parity are disabled after nullable semantics activation.");
    }
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const action = process.argv[2];
  if (!["preflight", "backfill", "parity"].includes(action)) throw new Error(usage);
  const schema = argument("schema");
  quoteIdentifier(schema);
  if (action !== "preflight" && !process.argv.includes("--confirm-no-external-writers")) {
    throw new Error("Before backfill/parity, confirm all nonparticipating writers are stopped, then pass --confirm-no-external-writers.");
  }
  const client = await connect();
  try {
    await setSchema(client, schema);
    if (action !== "preflight") await assertMigrationIsPreActivation(client);
    const userIds = await listUserIds(client);
    if (action === "preflight") {
      const { rows } = await client.query(`
        SELECT count(*)::int AS count FROM student_growth
        WHERE level IS NOT NULL OR skill_ex IS NOT NULL OR skill_normal IS NOT NULL OR skill_enhanced IS NOT NULL
          OR skill_sub IS NOT NULL OR equip1 IS NOT NULL OR equip2 IS NOT NULL OR equip3 IS NOT NULL OR equip_special IS NOT NULL
      `);
      const { rows: giftPlanRows } = await client.query(`
        SELECT count(*)::int AS count FROM user_relationship_levels
        WHERE jsonb_typeof(items) <> 'object'
          OR EXISTS (
            SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(items) = 'object' THEN items ELSE '{}'::jsonb END) AS entry
            WHERE jsonb_typeof(entry.value) <> 'number'
          )
      `);
      process.stdout.write(
        `preflight users=${userIds.length} unsupported_student_growth_current_rows=${rows[0].count} invalid_gift_plan_rows=${giftPlanRows[0].count}\n`,
      );
      if (rows[0].count !== 0 || giftPlanRows[0].count !== 0) process.exitCode = 2;
      return;
    }
    if (action === "backfill") {
      let projectedStates = 0;
      let projectedTargets = 0;
      for (const userId of userIds) {
        const counts = await userTransaction(client, userId, async () => {
          const sourceRows = await readLegacyRows(client, userId);
          assertSupportedLegacyGrowth(sourceRows);
          let states = 0;
          let targets = 0;
          for (const row of sourceRows) {
            if (await upsertState(client, userId, row)) states += 1;
            if (await upsertTargets(client, userId, row)) targets += 1;
          }
          return { states, targets };
        });
        projectedStates += counts.states;
        projectedTargets += counts.targets;
      }
      process.stdout.write(`backfill users=${userIds.length} state_rows=${projectedStates} target_rows=${projectedTargets} audit_rows=0\n`);
      return;
    }
    let checkedUsers = 0;
    let mismatches = 0;
    for (const userId of userIds) {
      mismatches += await userSnapshotTransaction(client, () => checkParity(client, userId));
      checkedUsers += 1;
    }
    process.stdout.write(`parity users=${checkedUsers} mismatches=${mismatches}\n`);
    if (mismatches > 0) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Student-state migration failed."}\n`);
  process.exitCode = 1;
});
