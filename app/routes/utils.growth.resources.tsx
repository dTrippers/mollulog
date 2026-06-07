import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

function resourceInventoryPath(request: Request): string {
  const url = new URL(request.url);
  return `/utils/resources/inventory${url.search}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirect(resourceInventoryPath(request));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return redirect(resourceInventoryPath(request));
};
