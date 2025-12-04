import { type ActionFunctionArgs, redirect } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
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
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const actionData = await request.json<ActionData>();
  if (actionData.favorite) {
    if (actionData.favorite.favorited) {
      await favoriteStudent(env, currentUser.id, actionData.favorite.studentUid, actionData.favorite.contentUid);
    } else {
      await unfavoriteStudent(env, currentUser.id, actionData.favorite.studentUid, actionData.favorite.contentUid);
    }
  }

  return null;
};
