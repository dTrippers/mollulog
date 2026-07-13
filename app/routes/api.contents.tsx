import { type ActionFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { favoriteStudent, unfavoriteStudent } from "~/models/favorite-students";

export type ActionData = {
  favorite?: {
    contentUid: string;
    studentUid: string;
    favorited: boolean;
  };
};

// @deprecated use api.contents.$uid.memos and api.contents.$uid.favorites instead
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const actionData = await request.json<ActionData>();
  if (actionData.favorite) {
    if (actionData.favorite.favorited) {
      await favoriteStudent(env, currentUser.id, actionData.favorite.studentUid, actionData.favorite.contentUid, {
        ctx,
      });
    } else {
      await unfavoriteStudent(env, currentUser.id, actionData.favorite.studentUid, actionData.favorite.contentUid, {
        ctx,
      });
    }
  }

  return null;
};
