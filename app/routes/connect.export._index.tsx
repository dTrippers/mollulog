import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { listPendingSyncDrafts } from "~/models/sync-draft";
import ConnectDataPage from "./connect._components/ConnectDataPage";

export const meta: MetaFunction = () => [{ title: "데이터 내보내기 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const pendingDrafts = await listPendingSyncDrafts(env, sensei.id);
  return { pendingDraftCount: pendingDrafts.length };
};

export default function ConnectExportIndexPage() {
  const { pendingDraftCount } = useLoaderData<typeof loader>();

  return (
    <ConnectDataPage currentScreen="export" pendingDraftCount={pendingDraftCount}>
      <div className="pb-12" />
    </ConnectDataPage>
  );
}
