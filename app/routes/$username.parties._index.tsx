import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// Earlier parties and walkthroughs moved to a view-only page under the community.
export const loader = ({ params }: LoaderFunctionArgs) => {
  const username = params.username?.replace(/^@/, "");
  return redirect(username ? `/timelines/parties/@${username}` : "/timelines");
};

export default function UserPartiesRedirect() {
  return null;
}
