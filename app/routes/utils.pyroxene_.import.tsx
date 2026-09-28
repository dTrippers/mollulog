import { type LoaderFunctionArgs, redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const target = new URL(request.url);
  target.pathname = "/planner/import";
  target.searchParams.set("from", "pyroxene");
  return redirect(`${target.pathname}${target.search}`);
};

export default function GuestPyroxeneImportRedirect() {
  return null;
}
