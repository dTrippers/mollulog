import { redirect, type LoaderFunctionArgs } from "react-router";

// Keep legacy form actions posted to /utils/relationship/item working while the UI redirects to ?mode=item.
export { action } from "./utils.relationship";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  url.pathname = "/utils/relationship";
  url.searchParams.set("mode", "item");

  return redirect(`${url.pathname}${url.search}`);
};
