import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

function resourceDraftPath(params: { draftUid?: string }): string {
  return params.draftUid ? `/utils/resources/drafts/${params.draftUid}` : "/utils/resources/inventory";
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return redirect(resourceDraftPath(params));
};

export const action = async ({ params }: ActionFunctionArgs) => {
  return redirect(resourceDraftPath(params));
};
