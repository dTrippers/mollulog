import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { createPageErrorBoundary, Page } from "~/components/features/layout";
import { canonicalLink } from "~/lib/seo";
import { getRaidPortalData } from "~/views/raid-portal";
import RaidPortalScreen from "./raids._components/RaidPortalScreen";

export const meta: MetaFunction = ({ location }) => [
  { title: "총력전·대결전 정보 | 몰루로그" },
  {
    name: "description",
    content: "총력전·대결전 일정과 시즌 통계, 상위권 편성, 공략 영상을 한곳에서 확인해보세요.",
  },
  canonicalLink(location.pathname),
];

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  return getRaidPortalData(env, ctx);
};

export default function RaidsPortalPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="총력전/대결전" contentWidth="full" layout="vertical">
      <RaidPortalScreen {...data} />
    </Page>
  );
}

export const ErrorBoundary = createPageErrorBoundary({
  title: "총력전/대결전",
  description: "총력전·대결전 정보를 불러오지 못했어요",
});
