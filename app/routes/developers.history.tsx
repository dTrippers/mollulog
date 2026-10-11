import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export { headers } from "./data-history";

export function loader({ request }: LoaderFunctionArgs) {
  const { search } = new URL(request.url);
  return redirect(`/data-history${search}`, { headers: { "Cache-Control": "private, no-store" } });
}
