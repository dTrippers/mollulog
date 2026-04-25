import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { LoaderFunctionArgs } from "react-router";
import { raidTypeToParam } from "~/models/raid";
import { getAllStudents } from "~/models/student";
import { getAllTimelineContentsMeta } from "~/models/timeline-content";
import { RaidRepository } from "~/repositories";

type SitemapItem = {
  link: string;
  lastmod: Dayjs;
  changefreq: string;
  priority: number;
};

const HOST = "https://mollulog.net";

const EVENT_CONTENT_TYPES = new Set(["event", "fes", "collab", "immortal_event", "main_story", "pickup", "mini_event", "allied"]);

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const raidRepository = new RaidRepository(env);
  const items: SitemapItem[] = [
    { link: `${HOST}/futures`, lastmod: dayjs(), changefreq: "daily", priority: 1.0 },
    { link: `${HOST}/utils`, lastmod: dayjs(), changefreq: "daily", priority: 0.9 },
    { link: `${HOST}/utils/relationship`, lastmod: dayjs(), changefreq: "daily", priority: 0.9 },
    { link: `${HOST}/coupons`, lastmod: dayjs(), changefreq: "daily", priority: 0.9 },
    { link: `${HOST}/students`, lastmod: dayjs(), changefreq: "monthly", priority: 0.5 },
  ];

  const now = dayjs();
  const [contents, students, raidSchedules] = await Promise.all([
    getAllTimelineContentsMeta(env),
    getAllStudents(env),
    raidRepository.getAll(),
  ]);
  const raidScheduleMap = new Map(raidSchedules.map((schedule) => [schedule.uid, schedule]));

  for (const content of contents) {
    let link: string | null = null;
    if (content.contentType === "raid" && content.contentUid) {
      const schedule = raidScheduleMap.get(content.contentUid);
      if (schedule) {
        link = `${HOST}/raids/${raidTypeToParam(schedule.raidType)}/${schedule.seasonIndex}`;
      }
    } else if (EVENT_CONTENT_TYPES.has(content.contentType)) {
      link = `${HOST}/events/${content.uid}`;
    }

    if (!link) {
      continue;
    }

    const until = content.endAt ? dayjs(content.endAt) : now;
    const isOutdated = until.isBefore(now);
    items.push({
      link,
      lastmod: isOutdated ? until : now,
      changefreq: isOutdated ? "yearly" : "daily",
      priority: isOutdated ? 0.3 : 1.0,
    });
  }

  const beginningOfMonth = now.startOf("month");
  for (const student of students) {
    items.push({
      link: `${HOST}/students/${student.uid}`,
      lastmod: beginningOfMonth,
      changefreq: "monthly",
      priority: 0.5,
    });
  }

  const xmlUrls = items.map((item) => {
    return `
<url>
  <loc>${item.link}</loc>
  <lastmod>${item.lastmod.format("YYYY-MM-DD")}</lastmod>
  <priority>${item.priority.toFixed(1)}</priority>
</url>`.trim();
  }).join("\n");

  const xmlPrefix = "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">";
  const xmlPostfix = "</urlset>";
  const sitemap = [xmlPrefix, xmlUrls, xmlPostfix].join("\n");

  return new Response(sitemap, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "xml-version": "1.0",
      "encoding": "utf-8",
    },
  });
};
