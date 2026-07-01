import { type LoaderFunctionArgs, redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/statistics\/?$/, "");

  return redirect(`${url.pathname}${url.search}`);
};

export default function RaidStatisticsRedirect() {
  return null;
}
