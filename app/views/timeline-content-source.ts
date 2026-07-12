import { getPostgresTimelineContents } from "~/db/postgres/timeline-contents";
import type { TimelineContent } from "~/domain/timeline-content";
import { compareTimelineContents } from "~/domain/timeline-content-parity";
import { nowUtcIso } from "~/lib/date-time";
import { getTimelineContents } from "~/models/timeline-content";

export const TIMELINE_CONTENT_SOURCE_MODES = ["d1", "compare", "hyperdrive"] as const;
export type TimelineContentSourceMode = (typeof TIMELINE_CONTENT_SOURCE_MODES)[number];

type TimedContents = {
  contents: TimelineContent[];
  durationMs: number;
};

const MISMATCH_UID_LOG_LIMIT = 20;

export function resolveTimelineContentSourceMode(value: string | undefined): TimelineContentSourceMode {
  if (value === undefined) return "d1";
  if (TIMELINE_CONTENT_SOURCE_MODES.includes(value as TimelineContentSourceMode)) {
    return value as TimelineContentSourceMode;
  }
  throw new Error(`invalid TIMELINE_CONTENT_SOURCE_MODE: ${value}`);
}

async function timed(load: () => Promise<TimelineContent[]>): Promise<TimedContents> {
  const startedAt = performance.now();
  const contents = await load();
  return { contents, durationMs: performance.now() - startedAt };
}

async function compareSources(
  ctx: ExecutionContext | undefined,
  d1Promise: Promise<TimedContents>,
  hyperdrivePromise: Promise<TimedContents>,
): Promise<void> {
  const compare = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
    span?.setAttribute("timeline.source_mode", "compare");
    span?.setAttribute("timeline.query_name", "get_future_timeline_contents");

    let d1: TimedContents;
    let hyperdrive: TimedContents;
    try {
      [d1, hyperdrive] = await Promise.all([d1Promise, hyperdrivePromise]);
    } catch (error) {
      span?.setAttribute("timeline.error", true);
      if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
        span?.setAttribute("timeline.hyperdrive.error_code", error.code);
      }
      throw error;
    }

    const parity = compareTimelineContents(d1.contents, hyperdrive.contents);

    span?.setAttribute("timeline.d1.duration_ms", d1.durationMs);
    span?.setAttribute("timeline.hyperdrive.duration_ms", hyperdrive.durationMs);
    span?.setAttribute("timeline.d1.row_count", parity.sourceCount);
    span?.setAttribute("timeline.hyperdrive.row_count", parity.targetCount);
    span?.setAttribute("timeline.parity.matched", parity.matched);
    span?.setAttribute("timeline.parity.missing_count", parity.missingTargetUids.length);
    span?.setAttribute("timeline.parity.unexpected_count", parity.unexpectedTargetUids.length);
    span?.setAttribute("timeline.parity.mismatched_count", parity.mismatchedUids.length);

    if (!parity.matched) {
      console.warn("[timeline-compare] parity mismatch", {
        sourceCount: parity.sourceCount,
        targetCount: parity.targetCount,
        missingTargetUids: parity.missingTargetUids.slice(0, MISMATCH_UID_LOG_LIMIT),
        unexpectedTargetUids: parity.unexpectedTargetUids.slice(0, MISMATCH_UID_LOG_LIMIT),
        mismatchedUids: parity.mismatchedUids.slice(0, MISMATCH_UID_LOG_LIMIT),
      });
    }
  };

  const comparison = ctx ? ctx.tracing.enterSpan("timeline_contents.compare", compare) : compare();
  const observed = comparison.catch((error) => {
    console.error("[timeline-compare] comparison failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
      code:
        error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? error.code
          : undefined,
    });
  });

  if (ctx) {
    ctx.waitUntil(observed);
    return;
  }
  await observed;
}

export async function loadTimelineContentsForFutures(
  env: Env,
  mode: TimelineContentSourceMode,
  ctx?: ExecutionContext,
): Promise<TimelineContent[]> {
  const now = nowUtcIso();
  if (mode === "d1") {
    return getTimelineContents(env, now);
  }
  if (mode === "hyperdrive") {
    return getPostgresTimelineContents(env, now, { ctx });
  }

  const d1Promise = timed(() => getTimelineContents(env, now));
  const hyperdrivePromise = timed(() => getPostgresTimelineContents(env, now, { ctx }));
  await compareSources(ctx, d1Promise, hyperdrivePromise);
  return (await d1Promise).contents;
}
