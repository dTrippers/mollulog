import hangul from "hangul-js";
import type { LoaderFunctionArgs } from "react-router";
import { getSearchableMenuItems } from "~/components/features/layout/navigation-menu";
import { formatStudentFullName, getAllStudents } from "~/models/student";
import { getAllTimelineContentsMeta, type TimelineContent } from "~/models/timeline-content";

const SEARCHABLE_TIMELINE_CONTENT_TYPES = ["event", "main_story", "pickup"] as const;

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

export const loader = async ({ request, context }: LoaderFunctionArgs): Promise<SearchResponse> => {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return { results: [] };
  }

  const env = context.cloudflare.env;
  const [menuItems, students, timelineContents] = await Promise.all([
    Promise.resolve(getSearchableMenuItems()),
    getAllStudents(env),
    getAllTimelineContentsMeta(env),
  ]);

  const menuResults: SearchResult[] = menuItems
    .filter((item) => matchesSearch(item.name, q))
    .map((item) => ({ type: "menu", name: item.name, to: item.to }));

  const studentResults: SearchResult[] = students
    .map((student) => ({
      student,
      fullName: formatStudentFullName(student),
    }))
    .filter(({ fullName }) => matchesSearch(fullName, q))
    .map(({ student, fullName }) => ({
      type: "student",
      name: fullName,
      uid: student.uid,
      to: `/students/${student.uid}`,
    }));

  const eventResults: SearchResult[] = deduplicateTimelineContentsByContentUid(timelineContents)
    .filter(isSearchableTimelineContent)
    .filter((content) => matchesSearch(content.name, q))
    .map((content) => ({
      type: "event",
      name: content.name,
      uid: content.uid,
      to: `/events/${content.uid}`,
      contentType: content.contentType,
      startAt: content.startAt,
    }));

  return { results: [...menuResults, ...studentResults, ...eventResults].slice(0, 5) };
};
