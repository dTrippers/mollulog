type QueryConfig = { text: string; values?: unknown[] };
type Row = Record<string, unknown>;

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function toPgRow(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [camelToSnake(key), value]));
}

function fromPgField(field: string): string {
  return snakeToCamel(field.replaceAll('"', ""));
}

function getTableName(text: string): string {
  const match = text.match(/\b(?:from|into|update|delete\s+from)\s+"([^"]+)"/i);
  if (!match) throw new Error(`Unable to identify PostgreSQL table in query: ${text}`);
  return match[1];
}

function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function parenthesizedGroups(value: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") {
      if (depth === 0) start = index + 1;
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        groups.push(value.slice(start, index));
        start = -1;
      }
    }
  }
  return groups;
}

function valueForToken(token: string, values: unknown[]): unknown {
  const placeholder = token.match(/\$(\d+)/);
  if (placeholder) return values[Number(placeholder[1]) - 1];
  if (/^default$/i.test(token)) return undefined;
  if (/^null$/i.test(token)) return null;
  if (/^true$/i.test(token)) return true;
  if (/^false$/i.test(token)) return false;
  const quoted = token.match(/^'(.*)'$/s);
  if (quoted) return quoted[1];
  const numeric = Number(token);
  return Number.isNaN(numeric) ? token : numeric;
}

function matchesWhere(row: Row, text: string, values: unknown[]): boolean {
  const where =
    text.match(/\bwhere\b([\s\S]*?)(?:\border\s+by\b|\bgroup\s+by\b|\blimit\b|\breturning\b|$)/i)?.[1] ?? "";
  if (!where.trim()) return true;
  const equalities = [...where.matchAll(/(?:"[^"]+"\.)?"([a-z0-9_]+)"\s*=\s*\$(\d+)/gi)];
  for (const [, field, placeholder] of equalities) {
    const actual = row[fromPgField(field)];
    if (actual instanceof Date && values[Number(placeholder) - 1] instanceof Date) {
      if (actual.getTime() !== (values[Number(placeholder) - 1] as Date).getTime()) return false;
    } else if (actual !== values[Number(placeholder) - 1]) {
      return false;
    }
  }
  const memberships = [...where.matchAll(/(?:"[^"]+"\.)?"([a-z0-9_]+)"\s+in\s*\(([^)]+)\)/gi)];
  for (const [, field, placeholders] of memberships) {
    const allowed = splitTopLevel(placeholders).map((token) => valueForToken(token, values));
    if (!allowed.includes(row[fromPgField(field)])) return false;
  }
  const isNull = [...where.matchAll(/(?:"[^"]+"\.)?"([a-z0-9_]+)"\s+is\s+(not\s+)?null/gi)];
  for (const [, field, not] of isNull) {
    const isNullValue = row[fromPgField(field)] == null;
    if (not ? isNullValue : !isNullValue) return false;
  }
  return true;
}

function generatedId(rows: Row[]): number {
  return rows.reduce((maximum, row) => Math.max(maximum, Number(row.id) || 0), 0) + 1;
}

function returningColumns(text: string): string[] | null {
  const match = text.match(/\breturning\b([\s\S]*)$/i);
  if (!match) return null;
  return [...match[1].matchAll(/"([a-z0-9_]+)"(?:\s+as\s+"[^"]+")?/gi)].map(([, field]) => field);
}

function projectRows(rows: Row[], columns: string[] | null): Row[] {
  return rows.map((row) => {
    const pgRow = toPgRow(row);
    if (!columns) return pgRow;
    return Object.fromEntries(columns.map((column) => [column, pgRow[column]]));
  });
}

function selectColumns(text: string): string[] {
  const selectClause = text.match(/^\s*select\s+([\s\S]*?)\s+from\s+/i)?.[1] ?? "";
  return [...selectClause.matchAll(/"([a-z0-9_]+)"/gi)].map(([, field]) => field);
}

/**
 * Small in-memory PostgreSQL client used by student-state model tests.
 * Drizzle still builds and executes the real SQL, while this adapter applies
 * the statements to camel-case fixture rows so tests cover the PG path.
 */
export class FakePostgresClient {
  readonly tables: Record<string, Row[]>;
  readonly selectParameterCounts: number[] = [];
  readonly statements: string[] = [];
  readonly parameters: unknown[][] = [];
  private readonly primaryTable: string;

  constructor(initialTables: Record<string, Row[]> = {}, primaryTable = "recruited_students") {
    this.primaryTable = primaryTable;
    this.tables = {
      recruited_students: [],
      student_growth: [],
      user_relationship_levels: [],
      growth_resource_inventory: [],
      sync_drafts: [],
      sync_draft_entries: [],
      user_resource_inventory_drafts: [],
      user_resource_inventory_draft_items: [],
      ...initialTables,
    };
  }

  get rows(): Row[] {
    return this.tables[this.primaryTable];
  }

  get drafts(): Row[] {
    return this.tables.sync_drafts;
  }

  get entries(): Row[] {
    return this.tables.sync_draft_entries;
  }

  get recruitedStudents(): Row[] {
    return this.tables.recruited_students;
  }

  get relationshipLevels(): Row[] {
    return this.tables.user_relationship_levels;
  }

  get studentGrowths(): Row[] {
    return this.tables.student_growth;
  }

  async connect(): Promise<void> {}

  async end(): Promise<void> {}

  async query(config: QueryConfig | string, positionalValues?: unknown[]): Promise<{ rows: Row[]; rowCount: number }> {
    const text = typeof config === "string" ? config : config.text;
    const values = typeof config === "string" ? (positionalValues ?? []) : (config.values ?? positionalValues ?? []);
    this.statements.push(text);
    this.parameters.push(values);
    const normalized = text.replace(/\s+/g, " ").trim();
    if (/^(begin|commit|rollback|savepoint|release|set\b|select\s+set_config)/i.test(normalized)) {
      return { rows: [], rowCount: 0 };
    }
    if (/^select\s+setval/i.test(normalized)) return { rows: [], rowCount: 0 };
    const rowModeArray =
      typeof config !== "string" && (config as QueryConfig & { rowMode?: string }).rowMode === "array";
    if (/^select/i.test(normalized)) return this.select(normalized, values, rowModeArray);
    if (/^insert/i.test(normalized)) return this.insert(normalized, values, rowModeArray);
    if (/^update/i.test(normalized)) return this.update(normalized, values, rowModeArray);
    if (/^delete/i.test(normalized)) return this.remove(normalized, values, rowModeArray);
    throw new Error(`Unsupported fake PostgreSQL query: ${text}`);
  }

  private select(text: string, values: unknown[], rowModeArray: boolean): { rows: Row[]; rowCount: number } {
    const tableName = getTableName(text);
    const table = this.tables[tableName] ?? [];
    this.selectParameterCounts.push(values.length);
    let rows = table.filter((row) => matchesWhere(row, text, values));
    const order = text.match(/\border\s+by\s+"([a-z0-9_]+)"(?:\s+(asc|desc))?/i);
    if (order) {
      const field = fromPgField(order[1]);
      const multiplier = order[2]?.toLowerCase() === "desc" ? -1 : 1;
      rows = [...rows].sort((left, right) => (Number(left[field]) - Number(right[field])) * multiplier);
    }
    const limit = text.match(/\blimit\s+(?:\$(\d+)|(\d+))/i);
    if (limit) {
      const count = Number(limit[1] ? values[Number(limit[1]) - 1] : limit[2]);
      rows = rows.slice(0, count);
    }
    if (/count\(\*\)/i.test(text)) {
      const field = text.match(/count\(\*\)\s+as\s+"?([a-z0-9_]+)"?/i)?.[1] ?? "count";
      return { rows: [{ [field]: rows.length }], rowCount: 1 };
    }
    const resultRows = projectRows(rows, null);
    const outputRows = rowModeArray
      ? resultRows.map((row) => selectColumns(text).map((column) => row[column]))
      : resultRows;
    return { rows: outputRows as Row[], rowCount: rows.length };
  }

  private insert(text: string, values: unknown[], rowModeArray: boolean): { rows: Row[]; rowCount: number } {
    const tableName = getTableName(text);
    let table = this.tables[tableName];
    if (!table) {
      table = [];
      this.tables[tableName] = table;
    }
    const columnsMatch = text.match(/insert\s+into\s+"[^"]+"\s*\(([^)]+)\)\s*values\s*/i);
    if (!columnsMatch) throw new Error(`Unsupported fake PostgreSQL insert: ${text}`);
    const columns = [...columnsMatch[1].matchAll(/"([a-z0-9_]+)"/gi)].map(([, field]) => field);
    const valuesStart = (columnsMatch.index ?? 0) + columnsMatch[0].length;
    const valuesAndClauses = text
      .slice(valuesStart)
      .split(/\bon\s+conflict\b/i)[0]
      .trim();
    const groups = parenthesizedGroups(valuesAndClauses);
    const inserted: Row[] = [];
    let valueOffset = 0;
    for (const group of groups) {
      const row: Row = {};
      const tokens = splitTopLevel(group);
      columns.forEach((column, index) => {
        const token = tokens[index] ?? "default";
        const placeholder = token.match(/\$(\d+)/);
        const value = placeholder ? values[Number(placeholder[1]) - 1] : valueForToken(token, values);
        row[fromPgField(column)] = value;
        if (placeholder) valueOffset = Math.max(valueOffset, Number(placeholder[1]));
      });
      if (row.id == null) row.id = generatedId(table);
      if (row.createdAt == null) row.createdAt = new Date();
      if (row.updatedAt == null) row.updatedAt = row.createdAt;
      inserted.push(row);
    }
    const conflict = text.match(/on\s+conflict\s*\(([^)]+)\)\s*do\s+update\s+set\s+([\s\S]*?)(?:\s+returning\s+|$)/i);
    const conflictColumns = conflict
      ? [...conflict[1].matchAll(/"([a-z0-9_]+)"/gi)].map(([, field]) => fromPgField(field))
      : [];
    const conflictSets = conflict ? splitTopLevel(conflict[2]) : [];
    const resulting: Row[] = [];
    for (const candidate of inserted) {
      const existing =
        conflictColumns.length > 0
          ? table.find((row) => conflictColumns.every((column) => row[column] === candidate[column]))
          : undefined;
      if (!existing) {
        table.push(candidate);
        resulting.push(candidate);
        continue;
      }
      for (const assignment of conflictSets) {
        const match = assignment.match(/"([a-z0-9_]+)"\s*=\s*([\s\S]+)/i);
        if (!match) continue;
        const field = fromPgField(match[1]);
        existing[field] = this.evaluateSetExpression(match[2], candidate, existing, values);
      }
      resulting.push(existing);
    }
    const returnFields = returningColumns(text);
    const outputRows = projectRows(resulting, returnFields);
    return {
      rows: (rowModeArray && returnFields
        ? outputRows.map((row) => returnFields.map((column) => row[column]))
        : outputRows) as Row[],
      rowCount: resulting.length,
    };
  }

  private evaluateSetExpression(expression: string, inserted: Row, existing: Row, values: unknown[]): unknown {
    const trimmed = expression.trim();
    if (/^excluded\./i.test(trimmed) || /^"excluded"\./i.test(trimmed)) {
      return inserted[fromPgField(trimmed.split(".").at(-1)?.replaceAll('"', "") ?? "")];
    }
    if (/^greatest\(/i.test(trimmed)) {
      const placeholders = [...trimmed.matchAll(/\$(\d+)/g)].map(([, index]) => values[Number(index) - 1]);
      const numbers = [existing.tier, ...placeholders].filter((value): value is number => typeof value === "number");
      return Math.max(...numbers);
    }
    if (/^coalesce\(/i.test(trimmed)) {
      const field = trimmed.match(/excluded\.([a-z0-9_]+)/i)?.[1] ?? "";
      return inserted[fromPgField(field)] ?? existing[fromPgField(field)];
    }
    const placeholder = trimmed.match(/\$(\d+)/);
    if (placeholder) return values[Number(placeholder[1]) - 1];
    return valueForToken(trimmed, values);
  }

  private update(text: string, values: unknown[], rowModeArray: boolean): { rows: Row[]; rowCount: number } {
    const tableName = getTableName(text);
    const table = this.tables[tableName] ?? [];
    const setMatch = text.match(/\bset\b([\s\S]*?)\bwhere\b/i);
    const assignments = setMatch ? splitTopLevel(setMatch[1]) : [];
    const affected = table.filter((row) => matchesWhere(row, text, values));
    for (const row of affected) {
      for (const assignment of assignments) {
        const match = assignment.match(/"([a-z0-9_]+)"\s*=\s*([\s\S]+)/i);
        if (!match) continue;
        row[fromPgField(match[1])] = this.evaluateSetExpression(match[2], row, row, values);
      }
    }
    const columns = returningColumns(text);
    const outputRows = projectRows(affected, columns);
    return {
      rows: (rowModeArray && columns
        ? outputRows.map((row) => columns.map((column) => row[column]))
        : outputRows) as Row[],
      rowCount: affected.length,
    };
  }

  private remove(text: string, values: unknown[], rowModeArray: boolean): { rows: Row[]; rowCount: number } {
    const tableName = getTableName(text);
    const table = this.tables[tableName] ?? [];
    const removed = table.filter((row) => matchesWhere(row, text, values));
    this.tables[tableName] = table.filter((row) => !matchesWhere(row, text, values));
    const columns = returningColumns(text);
    const outputRows = projectRows(removed, columns);
    return {
      rows: (rowModeArray && columns
        ? outputRows.map((row) => columns.map((column) => row[column]))
        : outputRows) as Row[],
      rowCount: removed.length,
    };
  }
}
