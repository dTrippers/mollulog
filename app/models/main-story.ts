import { cacheKey, fetchSourceCached } from "~/lib/cache";
import { runQuery } from "~/lib/baql";
import { graphql } from "~/graphql";

const MAIN_STORIES_CACHE_KEY = cacheKey("source", "main-story", 1, "all");

type MainStoryVolumeTitleInput = {
  season: number;
  label: string;
  name: string | null;
};

export function formatMainStorySeasonTitle(season: number) {
  return `${season}부`;
}

export function formatMainStoryVolumeTitle(volume: MainStoryVolumeTitleInput) {
  return [formatMainStorySeasonTitle(volume.season), volume.label, volume.name].filter(Boolean).join(" ");
}

export type MainStoryPartSchedule = {
  region: string;
  releasedAt: Date;
  confirmed: boolean;
};

export type MainStoryPart = {
  uid: string;
  name: string | null;
  episodeStart: number | null;
  episodeEnd: number | null;
  sortOrder: number;
  schedules: MainStoryPartSchedule[];
};

export type MainStoryChapter = {
  uid: string;
  name: string | null;
  chapterNumber: number;
  parts: MainStoryPart[];
};

export type MainStoryVolume = {
  uid: string;
  name: string | null;
  label: string;
  season: number;
  sortOrder: number;
  chapters: MainStoryChapter[];
};

type MainStoriesQueryResult = {
  mainStories: MainStoryVolume[];
};

// The BAQL schema used by remote codegen is currently behind this query shape,
// so we keep a local typed document until the published schema catches up.
const mainStoriesQuery = graphql(`
  query MainStories {
    mainStories {
      uid name label season sortOrder
      chapters {
        uid name chapterNumber
        parts {
          uid name episodeStart episodeEnd sortOrder
          schedules { region releasedAt confirmed }
        }
      }
    }
  }
`);

export async function getMainStories(env: Env, forceRefresh = false) {
  return fetchSourceCached(
    env,
    MAIN_STORIES_CACHE_KEY,
    async () => {
      const { data, error } = await runQuery(mainStoriesQuery, {});
      if (error || !data) {
        throw error ?? "failed to fetch main stories";
      }
      return data.mainStories;
    },
    forceRefresh,
  );
}
