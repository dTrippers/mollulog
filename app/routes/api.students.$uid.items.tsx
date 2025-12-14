import type { LoaderFunctionArgs } from "react-router";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";

const favoriteItemsQuery = graphql(`
  query StudentFavoriteItem($uid: String!) {
    student(uid: $uid) {
      uid name
      favoriteItems {
        favorited favoriteLevel exp
        item { uid name rarity }
      }
    }
  }
`);

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const uid = params.uid!;
  const { data } = await runQuery(favoriteItemsQuery, { uid });
  const student = data?.student;
  if (!student) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return student;
};
