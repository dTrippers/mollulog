import hangul from "hangul-js";
import type { LoaderFunctionArgs } from "react-router";
import { getSearchableMenuItems } from "~/components/features/layout/navigation-menu";
import { formatStudentFullName, getAllStudents } from "~/models/student";
import { type TimelineContent, getAllTimelineContentsMeta } from "~/models/timeline-content";

const SEARCHABLE_TIMELINE_CONTENT_TYPES = ["event", "main_story", "pickup"] as const;
const SEARCH_RESULT_LIMIT = 5;
const SEARCH_INDEX_TTL_MS = 10 * 60 * 1000;

type SearchableTimelineContentType = (typeof SEARCHABLE_TIMELINE_CONTENT_TYPES)[number];

type MenuSearchResult = {
  type: "menu";
  name: string;
  to: string;
};

type StudentSearchResult = {
  type: "student";
  name: string;
  uid: string;
  to: string;
};

type EventSearchResult = {
  type: "event";
  name: string;
  uid: string;
  to: string;
  contentType: SearchableTimelineContentType;
  startAt: string;
};

export type SearchResult = MenuSearchResult | StudentSearchResult | EventSearchResult;

export type SearchResponse = {
  results: SearchResult[];
};

type SearchIndexEntry = {
  candidate: string;
  result: SearchResult;
};

type SearchIndexCache = {
  expiresAt: number;
  promise: Promise<SearchIndexEntry[]>;
};

const searchIndexCaches = new WeakMap<object, SearchIndexCache>();

function matchesSearch(candidate: string, query: string): boolean {
  return hangul.search(candidate, query) >= 0;
}

function isSearchableTimelineContent(
  content: TimelineContent,
): content is TimelineContent & { contentType: SearchableTimelineContentType } {
  return SEARCHABLE_TIMELINE_CONTENT_TYPES.includes(content.contentType as SearchableTimelineContentType);
}

function deduplicateTimelineContentsByContentUid(contents: TimelineContent[]): TimelineContent[] {
  const contentsWithoutContentUid: TimelineContent[] = [];
  const latestContentByContentUid = new Map<string, TimelineContent>();

  for (const content of contents) {
    if (!content.contentUid) {
      contentsWithoutContentUid.push(content);
      continue;
    }

    const existing = latestContentByContentUid.get(content.contentUid);
    if (!existing || content.startAt > existing.startAt) {
      latestContentByContentUid.set(content.contentUid, content);
    }
  }

  return [...contentsWithoutContentUid, ...latestContentByContentUid.values()];
}

async function getSearchIndex(env: Env): Promise<SearchIndexEntry[]> {
  const cacheKey = env.KV_CACHE;
  const cached = searchIndexCaches.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const nextCache: SearchIndexCache = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: buildSearchIndex(env),
  };

  searchIndexCaches.set(cacheKey, nextCache);

  nextCache.promise.then(
    () => {
      if (searchIndexCaches.get(cacheKey) === nextCache) {
        nextCache.expiresAt = Date.now() + SEARCH_INDEX_TTL_MS;
      }
    },
    () => {
      if (searchIndexCaches.get(cacheKey) === nextCache) {
        searchIndexCaches.delete(cacheKey);
      }
    },
  );

  return nextCache.promise;
}

async function buildSearchIndex(env: Env): Promise<SearchIndexEntry[]> {
  const [menuItems, students, timelineContents] = await Promise.all([
    Promise.resolve(getSearchableMenuItems()),
    getAllStudents(env),
    getAllTimelineContentsMeta(env),
  ]);

  const menuEntries: SearchIndexEntry[] = menuItems.map((item) => ({
    candidate: item.name,
    result: { type: "menu", name: item.name, to: item.to },
  }));

  const studentEntries: SearchIndexEntry[] = students.map((student) => {
    const fullName = formatStudentFullName(student);
    return {
      candidate: fullName,
      result: {
        type: "student",
        name: fullName,
        uid: student.uid,
        to: `/students/${student.uid}`,
      },
    };
  });

  const eventEntries: SearchIndexEntry[] = deduplicateTimelineContentsByContentUid(timelineContents)
    .filter(isSearchableTimelineContent)
    .map((content) => ({
      candidate: content.name,
      result: {
        type: "event",
        name: content.name,
        uid: content.uid,
        to: `/events/${content.uid}`,
        contentType: content.contentType,
        startAt: content.startAt,
      },
    }));

  return [...menuEntries, ...studentEntries, ...eventEntries];
}

function searchIndex(index: SearchIndexEntry[], query: string): SearchResult[] {
  const results: SearchResult[] = [];

  for (const entry of index) {
    if (!matchesSearch(entry.candidate, query)) {
      continue;
    }

    results.push(entry.result);
    if (results.length >= SEARCH_RESULT_LIMIT) {
      break;
    }
  }

  return results;
}

export const loader = async ({ request, context }: LoaderFunctionArgs): Promise<SearchResponse> => {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return { results: [] };
  }

  const env = context.cloudflare.env;
  const index = await getSearchIndex(env);
  return { results: searchIndex(index, q) };
};
