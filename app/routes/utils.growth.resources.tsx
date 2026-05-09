import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async (_args: LoaderFunctionArgs) => {
  return redirect("/edit/resources");
};

export default function GrowthResourcesPage() {
  return null;
}
