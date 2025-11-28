import dayjs from "dayjs";
import { and, eq, inArray, not, or, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Env } from "~/env.server";
import { nanoid } from "nanoid/non-secure";
import { senseisTable } from "./sensei";
import { graphql } from "~/graphql";
import { FutureContentsQuery, IndexQuery } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import { getFavoritedCounts } from "./favorite-students";


type ContentMemo = {
  uid: string;
  contentId: string;
  body: string;
  visibility: ContentMemoVisibility;
};

type ContentMemoWithSensei = ContentMemo & {
  sensei: {
    username: string;
    profileStudentId: string | null;
  };
};

type ContentMemoVisibility = "private" | "public";

export const futureContentMemo = sqliteTable("content_memos", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  contentId: text().notNull(),
  body: text().notNull(),
  visibility: text().notNull().default("private"),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

const SELECT_USER_MEMOS_COLUMNS = {
  uid: futureContentMemo.uid,
  contentId: futureContentMemo.contentId,
  body: futureContentMemo.body,
  visibility: futureContentMemo.visibility,
};

export async function getUserMemos(env: Env, userId: number): Promise<ContentMemo[]> {
  const db = drizzle(env.DB);
  const results = await db.select(SELECT_USER_MEMOS_COLUMNS)
    .from(futureContentMemo)
    .where(eq(futureContentMemo.userId, userId))
    .all()

  return results.map(toModel);
}

const SELECT_CONTENT_MEMOS_COLUMNS = {
  ...SELECT_USER_MEMOS_COLUMNS,
  sensei: {
    username: senseisTable.username,
    profileStudentId: senseisTable.profileStudentId,
  },
};

export async function getContentMemos(env: Env, contentId: string, userId?: number): Promise<ContentMemoWithSensei[]> {
  return (await getContentsMemos(env, [contentId], userId))[contentId] ?? [];
}

export async function getContentsMemos(env: Env, contentIds: string[], userId?: number): Promise<Record<string, ContentMemoWithSensei[]>> {
  const db = drizzle(env.DB);
  const results = await db.select(SELECT_CONTENT_MEMOS_COLUMNS)
    .from(futureContentMemo)
    .where(and(
      not(eq(futureContentMemo.body, "")),
      inArray(futureContentMemo.contentId, contentIds),
      or(...visibilityFilter(userId)),
    ))
    .innerJoin(senseisTable, eq(futureContentMemo.userId, senseisTable.id))
    .all();

  return results.reduce((acc, result) => {
    acc[result.contentId] = [...(acc[result.contentId] ?? []), toModel(result)];
    return acc;
  }, {} as Record<string, ContentMemoWithSensei[]>);
}

function toModel<T extends { visibility: string }>(rows: T): (T & { visibility: ContentMemoVisibility }) {
  return { ...rows, visibility: rows.visibility as ContentMemoVisibility };
}

export async function setMemo(env: Env, userId: number, contentId: string, body: string, visibility: ContentMemoVisibility = "private"): Promise<void> {
  const db = drizzle(env.DB);
  await db.insert(futureContentMemo).values({ uid: nanoid(8), userId, contentId, body, visibility })
    .onConflictDoUpdate({
      target: [futureContentMemo.userId, futureContentMemo.contentId],
      set: { body, visibility, updatedAt: sql`current_timestamp` }
    });
}

function visibilityFilter(userId?: number): SQLWrapper[] {
  const filters: SQLWrapper[] = [eq(futureContentMemo.visibility, "public")];
  if (userId) {
    filters.push(eq(futureContentMemo.userId, userId));
  }
  return filters;
}


/**
 * Index Contents
 */

const indexQuery = graphql(`
  query Index($now: ISO8601DateTime!) {
    events(untilAfter: $now, first: 20) {
      nodes {
        __typename name since until endless uid type rerun imageUrl
        pickups {
          type rerun since until
          student { uid name }
        }
      }
    }
    raids(untilAfter: $now, first: 3) {
      nodes {
        name since until uid type boss attackType terrain
        defenseTypes { defenseType difficulty }
      }
    }
  }
`);

export async function getIndexContents(env: Env, forceRefresh = false) {
  return fetchCached(env, "index-contents", async () => {
    const now = dayjs();
    const { data, error } = await runQuery<IndexQuery, { now: Date }>(indexQuery, { now: now.toDate() });
    if (error || !data) {
      throw error ?? "failed to fetch events";
    }

    // ========== Events ==========
    const mainEventTypes = ["event", "main_story", "collab", "fes", "immortal_event"];
    const mainEvents = data.events.nodes.filter((event) => mainEventTypes.includes(event.type));

    // Priority 1: Find currently ongoing events (since <= now <= until)
    const ongoingEvents = mainEvents.filter((event) => {
      const since = dayjs(event.since);
      const until = dayjs(event.until);
      return !since.isAfter(now) && until.isAfter(now);
    });

    let mainEvent = null;
    if (ongoingEvents.length > 0) {
      // If there are ongoing events, prioritize by event type order
      mainEvent = ongoingEvents.sort((a, b) => {
        const aTypeIndex = mainEventTypes.indexOf(a.type);
        const bTypeIndex = mainEventTypes.indexOf(b.type);
        return aTypeIndex - bTypeIndex;
      })[0];
    } else {
      // Priority 2: Find the nearest starting event
      const futureEvents = mainEvents.filter((event) => dayjs(event.since).isAfter(now));
      if (futureEvents.length > 0) {
        // Sort by start date, then by event type priority for same date
        mainEvent = futureEvents.sort((a, b) => {
          const aSince = dayjs(a.since);
          const bSince = dayjs(b.since);
          const dateDiff = aSince.diff(bSince, "day");
          if (dateDiff !== 0) {
            return dateDiff;
          }

          // If same date, prioritize by event type order
          const aTypeIndex = mainEventTypes.indexOf(a.type);
          const bTypeIndex = mainEventTypes.indexOf(b.type);
          return aTypeIndex - bTypeIndex;
        })[0];
      }
    }

    // ========== Pickups ==========
    const currentPickups: { eventUid: string, pickup: IndexQuery["events"]["nodes"][0]["pickups"][0] }[] = data.events.nodes
      .filter((event) => event.type !== "archive_pickup")
      .flatMap((event) => event.pickups.filter((pickup) => pickup.student !== null).map((pickup) => ({ eventUid: event.uid, pickup })))
      .filter(({ pickup }) => !dayjs(pickup.since).isAfter(now) && dayjs(pickup.until).isAfter(now));

    // Get favorite counts for all students in current pickups (not just user's favorites)
    const allStudentUids = currentPickups.map(({ pickup }) => pickup.student?.uid).filter((uid) => uid !== null) as string[];
    const favoritedCounts = (await getFavoritedCounts(env, allStudentUids)).filter((favorited) => currentPickups.some((pickup) => pickup.eventUid === favorited.contentId));

    return {
      mainEvent,
      currentRaids: data.raids.nodes,
      currentEvents: data.events.nodes.filter((event) => !dayjs(event.since).isAfter(now)),
      currentPickups,
      favoritedCounts,
    };
  }, 60 * 10, forceRefresh);
}


/**
 * Future Contents
 */
const futureContentsQuery = graphql(`
  query FutureContents($now: ISO8601DateTime!) {
    contents(untilAfter: $now, first: 9999) {
      nodes {
        __typename uid name since until confirmed
        ... on Event {
          eventType: type
          rerun endless
          shopResources { uid }
          pickups {
            type rerun since until studentName
            student { uid attackType defenseType role schaleDbId }
          }
        }
        ... on Raid {
          raidType: type
          rankVisible boss terrain attackType
          defenseTypes { defenseType difficulty }
        }
      }
    }
  }
`);

export async function getFutureContents(env: Env, forceRefresh = false): Promise<FutureContentsQuery["contents"]["nodes"]> {
  const truncatedNow = new Date();
  truncatedNow.setMinutes(0, 0, 0);

  return fetchCached(env, "future-contents", async () => {
    const { data, error } = await runQuery(futureContentsQuery, { now: truncatedNow });
    if (error || !data) {
      throw error ?? "failed to fetch events";
    }
    return data.contents.nodes;
  }, 60 * 10, forceRefresh);
}
