import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEBUG_MARKER = "--- 디버그 로그 ---";
const inputPath = process.argv[2];
const outputPath = process.argv[3];
const additionalOverridesPath = process.argv[4];

if (!inputPath || !outputPath) {
  process.stderr.write(
    "Usage: node db/postgres/scripts/generate-coupon-feedback-postgres-import.mjs <snapshot.json> <output.sql> [additional-overrides.json]\n",
  );
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const additionalOverrides = additionalOverridesPath
  ? JSON.parse(readFileSync(resolve(additionalOverridesPath), "utf8"))
  : [];
const {
  coupons = [],
  couponRegistrations = [],
  feedbackTickets = [],
  feedbackReplies = [],
} = snapshot.tables ?? {};

function sqlText(value) {
  return value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

function typed(value, type) {
  if (value === null || value === undefined) {
    return `null::${type}`;
  }
  if (type === "integer") {
    return `${Number(value)}::integer`;
  }
  if (type === "boolean") {
    return `${Boolean(value) ? "true" : "false"}::boolean`;
  }
  if (type === "jsonb") {
    return `${sqlText(JSON.stringify(value))}::jsonb`;
  }
  return `${sqlText(value)}::${type}`;
}

function parseRewards(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Coupon rewards must be a JSON array");
  }
  return parsed;
}

function escapeJsonStringControlCharacters(value) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const character of value) {
    if (!inString) {
      result += character;
      if (character === '"') {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      result += character;
      escaped = true;
    } else if (character === '"') {
      result += character;
      inString = false;
    } else if (character === "\n") {
      result += "\\n";
    } else if (character === "\r") {
      result += "\\r";
    } else if (character === "\t") {
      result += "\\t";
    } else {
      result += character;
    }
  }

  return result;
}

function parseDebugPayload(value) {
  try {
    return JSON.parse(value);
  } catch {
    return JSON.parse(escapeJsonStringControlCharacters(value));
  }
}

function splitFeedbackContent(content) {
  const markerIndex = content.indexOf(DEBUG_MARKER);
  if (markerIndex === -1) {
    return { content, additional: null };
  }

  const userContent = content.slice(0, markerIndex).trimEnd();
  const rawPayload = content.slice(markerIndex + DEBUG_MARKER.length).trim();
  const payload = parseDebugPayload(rawPayload);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Feedback debug payload must be a JSON object");
  }

  return {
    content: userContent,
    additional: {
      type: "event_shop_bug_report",
      version: 1,
      payload,
    },
  };
}

const transformedCoupons = coupons.map((row) => ({
  ...row,
  rewards: parseRewards(row.rewards),
}));
const additionalOverridesByUid = new Map(
  additionalOverrides.map((row) => {
    if (typeof row?.uid !== "string" || typeof row?.content !== "string") {
      throw new Error("Feedback additional overrides must contain uid and content strings");
    }
    const { additional } = splitFeedbackContent(row.content);
    if (!additional) {
      throw new Error(`Feedback additional override ${row.uid} has no debug marker`);
    }
    return [row.uid, additional];
  }),
);
const transformedTickets = feedbackTickets.map((row) => {
  const split = splitFeedbackContent(row.content);
  const overrideAdditional = additionalOverridesByUid.get(row.uid);
  additionalOverridesByUid.delete(row.uid);
  return {
    ...row,
    ...split,
    additional: split.additional ?? overrideAdditional ?? null,
  };
});
if (additionalOverridesByUid.size > 0) {
  throw new Error(
    `Feedback additional override has no matching ticket: ${[...additionalOverridesByUid.keys()].join(", ")}`,
  );
}
const transformedReplies = feedbackReplies.map((row) => ({
  ...row,
  isAdmin: Boolean(row.isAdmin),
}));

const tableDefinitions = [
  {
    table: "coupons",
    rows: transformedCoupons,
    columns: [
      ["id", "integer"],
      ["uid", "text"],
      ["name", "text"],
      ["code", "text"],
      ["image_url", "text", "imageUrl"],
      ["rewards", "jsonb"],
      ["link_url", "text", "linkUrl"],
      ["link_label", "text", "linkLabel"],
      ["expires_at", "timestamptz", "expiresAt"],
      ["created_at", "timestamptz", "createdAt"],
      ["updated_at", "timestamptz", "updatedAt"],
    ],
  },
  {
    table: "coupon_registrations",
    rows: couponRegistrations,
    columns: [
      ["id", "integer"],
      ["uid", "text"],
      ["user_id", "integer", "userId"],
      ["coupon_id", "integer", "couponId"],
      ["created_at", "timestamptz", "createdAt"],
      ["updated_at", "timestamptz", "updatedAt"],
    ],
  },
  {
    table: "feedback_tickets",
    rows: transformedTickets,
    columns: [
      ["id", "integer"],
      ["uid", "text"],
      ["user_id", "integer", "userId"],
      ["title", "text"],
      ["content", "text"],
      ["additional", "jsonb"],
      ["status", "text"],
      ["reply_email", "text", "replyEmail"],
      ["last_seen_admin_reply_id", "integer", "lastSeenAdminReplyId"],
      ["created_at", "timestamptz", "createdAt"],
      ["updated_at", "timestamptz", "updatedAt"],
    ],
  },
  {
    table: "feedback_replies",
    rows: transformedReplies,
    columns: [
      ["id", "integer"],
      ["uid", "text"],
      ["ticket_id", "integer", "ticketId"],
      ["user_id", "integer", "userId"],
      ["is_admin", "boolean", "isAdmin"],
      ["content", "text"],
      ["created_at", "timestamptz", "createdAt"],
    ],
  },
];

function valuesSql(definition) {
  return definition.rows
    .map(
      (row) =>
        `  (${definition.columns
          .map(([column, type, source = column]) => typed(row[source], type))
          .join(", ")})`,
    )
    .join(",\n");
}

function insertSql(definition) {
  if (definition.rows.length === 0) {
    return "";
  }
  const columns = definition.columns.map(([column]) => column).join(", ");
  return `insert into ${definition.table} (${columns}) values\n${valuesSql(definition)};\n`;
}

function paritySql(definition) {
  const columns = definition.columns.map(([column]) => column).join(", ");
  if (definition.rows.length === 0) {
    return `  if exists (select 1 from ${definition.table}) then
    raise exception '${definition.table} parity check failed';
  end if;`;
  }

  const expected = `with expected (${columns}) as (
      values
${valuesSql(definition)}
    )`;

  return `  if exists (
    ${expected}
    (select to_jsonb(actual) from ${definition.table} actual except select to_jsonb(expected) from expected)
    union all
    (select to_jsonb(expected) from expected except select to_jsonb(actual) from ${definition.table} actual)
  ) then
    raise exception '${definition.table} parity check failed';
  end if;`;
}

const sql = `\\set ON_ERROR_STOP on
begin;

lock table coupons, coupon_registrations, feedback_tickets, feedback_replies in access exclusive mode;

truncate table feedback_replies, feedback_tickets, coupon_registrations, coupons restart identity cascade;

${tableDefinitions.map(insertSql).join("\n")}
select setval(pg_get_serial_sequence('coupons', 'id'), coalesce(max(id), 1), max(id) is not null) from coupons;
select setval(pg_get_serial_sequence('coupon_registrations', 'id'), coalesce(max(id), 1), max(id) is not null) from coupon_registrations;
select setval(pg_get_serial_sequence('feedback_tickets', 'id'), coalesce(max(id), 1), max(id) is not null) from feedback_tickets;
select setval(pg_get_serial_sequence('feedback_replies', 'id'), coalesce(max(id), 1), max(id) is not null) from feedback_replies;

do $$
begin
${tableDefinitions.map(paritySql).join("\n\n")}
end
$$;

commit;
`;

writeFileSync(resolve(outputPath), sql, { flag: "wx" });
process.stdout.write(
  `${JSON.stringify({
    outputPath: resolve(outputPath),
    counts: Object.fromEntries(tableDefinitions.map(({ table, rows }) => [table, rows.length])),
    separatedAdditionalCount: transformedTickets.filter(({ additional }) => additional !== null).length,
  })}\n`,
);
