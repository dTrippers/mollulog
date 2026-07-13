import { readFile } from "node:fs/promises";

function fail(message) {
  throw new Error(`Invalid posts snapshot: ${message}`);
}

function sqlText(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseRows(raw) {
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.success !== true) {
    fail("expected one successful wrangler D1 result");
  }
  if (!Array.isArray(payload[0].results)) fail("results must be an array");

  const seenIds = new Set();
  const seenUids = new Set();
  return payload[0].results.map((row, index) => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) fail(`row ${index} has an invalid id`);
    for (const field of ["uid", "title", "content", "board", "createdAt", "updatedAt"]) {
      if (typeof row[field] !== "string") fail(`row ${index} has an invalid ${field}`);
    }
    if (seenIds.has(row.id)) fail(`duplicate id ${row.id}`);
    if (seenUids.has(row.uid)) fail(`duplicate uid ${row.uid}`);
    if (Number.isNaN(Date.parse(`${row.createdAt}Z`)) && Number.isNaN(Date.parse(row.createdAt))) {
      fail(`row ${index} has an invalid createdAt`);
    }
    if (Number.isNaN(Date.parse(`${row.updatedAt}Z`)) && Number.isNaN(Date.parse(row.updatedAt))) {
      fail(`row ${index} has an invalid updatedAt`);
    }
    seenIds.add(row.id);
    seenUids.add(row.uid);
    return row;
  });
}

function rowSql(row) {
  return `(${row.id}, ${sqlText(row.uid)}, ${sqlText(row.title)}, ${sqlText(row.content)}, ${sqlText(row.board)}, ${sqlText(row.createdAt)}::timestamptz, ${sqlText(row.updatedAt)}::timestamptz)`;
}

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error(
    "Usage: node db/postgres/scripts/generate-posts-snapshot.mjs <wrangler-json-file>",
  );
}

const rows = parseRows(await readFile(inputPath, "utf8"));
const values = rows.length === 0 ? "" : `\n${rows.map(rowSql).join(",\n")};`;
const insertSnapshot = rows.length === 0
  ? ""
  : `insert into posts_snapshot (id, uid, title, content, board, created_at, updated_at) values${values}`;

process.stdout.write(`\\set ON_ERROR_STOP on
begin;
lock table posts in access exclusive mode;

create temporary table posts_snapshot (
  id integer primary key,
  uid text not null unique,
  title text not null,
  content text not null,
  board text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
) on commit drop;

${insertSnapshot}

truncate table posts restart identity;
insert into posts (id, uid, title, content, board, created_at, updated_at)
select id, uid, title, content, board, created_at, updated_at
from posts_snapshot
order by id;

do $$
begin
  if exists (
    (select id, uid, title, content, board, created_at, updated_at from posts_snapshot
     except
     select id, uid, title, content, board, created_at, updated_at from posts)
    union all
    (select id, uid, title, content, board, created_at, updated_at from posts
     except
     select id, uid, title, content, board, created_at, updated_at from posts_snapshot)
  ) then
    raise exception 'posts typed parity mismatch';
  end if;
end $$;

select setval(
  pg_get_serial_sequence('posts', 'id'),
  greatest(coalesce((select max(id) from posts), 1), 1),
  exists(select 1 from posts)
);

commit;
`);
