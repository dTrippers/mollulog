import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { LoaderFunctionArgs } from "react-router";
import { getAllStudents } from "~/models/student";
import { getAllTimelineContentsMeta } from "~/models/timeline-content";

type SitemapItem = {
  link: string;
  lastmod: Dayjs;
  changefreq: string;
  priority: number;
};

const HOST = "https://mollulog.net";

const RAID_CONTENT_TYPES = new Set(["total_assault", "elimination", "unlimit"]);
const EVENT_CONTENT_TYPES = new Set(["event", "fes", "collab", "immortal_event", "main_story", "pickup", "mini_event", "allied"]);

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const items: SitemapItem[] = [
    { link: `${HOST}/futures`, lastmod: dayjs(), changefreq: "daily", priority: 1.0 },
    { link: `${HOST}/students`, lastmod: dayjs(), changefreq: "monthly", priority: 0.5 },
  ];

  const now = dayjs();
  const [contents, students] = await Promise.all([
    getAllTimelineContentsMeta(env),
    getAllStudents(env),
  ]);

  for (const content of contents) {
    let basePath: string;
    if (RAID_CONTENT_TYPES.has(content.contentType)) {
      basePath = "raids";
    } else if (EVENT_CONTENT_TYPES.has(content.contentType)) {
      basePath = "events";
    } else {
      continue;
    }

    const until = content.endAt ? dayjs(content.endAt) : now;
    const isOutdated = until.isBefore(now);
    items.push({
      link: `${HOST}/${basePath}/${content.uid}`,
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
