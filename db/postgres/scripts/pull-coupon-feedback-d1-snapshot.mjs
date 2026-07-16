import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputPath = resolve(process.argv[2] ?? `tmp/coupon-feedback-d1-${new Date().toISOString().replaceAll(":", "-")}.json`);

const queries = {
  coupons: `
    select id, uid, name, code, imageUrl, rewards, linkUrl, linkLabel,
           expiresAt, createdAt, updatedAt
    from coupons
    order by id
  `,
  couponRegistrations: `
    select id, uid, userId, couponId, createdAt, updatedAt
    from coupon_registrations
    order by id
  `,
  feedbackTickets: `
    select id, uid, userId, title, content, status, replyEmail,
           lastSeenAdminReplyId, createdAt, updatedAt
    from feedback_tickets
    order by id
  `,
  feedbackReplies: `
    select id, uid, ticketId, userId, isAdmin, content, createdAt
    from feedback_replies
    order by id
  `,
};

function executeQuery(query) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--env",
      "production",
      "--json",
      "--command",
      query,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const response = JSON.parse(result.stdout);
  const queryResult = response[0];
  if (!queryResult?.success || !Array.isArray(queryResult.results)) {
    throw new Error("Unexpected Wrangler D1 response");
  }
  return queryResult.results;
}

const snapshot = {
  capturedAt: new Date().toISOString(),
  source: {
    database: "DB",
    environment: "production",
  },
  tables: Object.fromEntries(Object.entries(queries).map(([name, query]) => [name, executeQuery(query)])),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${outputPath}\n`);
