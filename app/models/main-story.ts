import { graphql } from "~/graphql";
import { fetchCached } from "./base";
import { runQuery } from "~/lib/baql";

const mainStoriesQuery = graphql(`
  query MainStories {
    mainStories {
      uid name label sortOrder
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
  return fetchCached(env, "main-stories::v1", async () => {
    const { data, error } = await runQuery(mainStoriesQuery, {});
    if (error || !data) {
      throw error ?? "failed to fetch main stories";
    }
    return data.mainStories;
  }, 24 * 60 * 60, forceRefresh);
}
