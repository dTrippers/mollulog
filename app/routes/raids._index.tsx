import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { createPageErrorBoundary, Page } from "~/components/features/layout";
import { RaidCard } from "~/components/features/raids";
import { EmptyView, SubTitle } from "~/components/primitives";
import { raidTypeToParam } from "~/domain/raid";
import { canonicalLink } from "~/lib/seo";
import { loadRaidPortal } from "~/views/raid";
import RaidBossGroupGrid from "./raids._index._components/RaidBossGroupGrid";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  return loadRaidPortal(env);
};

export const meta: MetaFunction<typeof loader> = ({ location }) => {
  const title = "총력전/대결전";
  const description = "블루 아카이브의 총력전/대결전 개최 일정과 보스별 통계 정보를 확인해보세요";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const ErrorBoundary = createPageErrorBoundary({
  title: "총력전/대결전 포털",
  description: "블루 아카이브의 총력전/대결전 개최 일정과 보스별 통계 정보를 확인해보세요",
});

export default function RaidPortalPage() {
  const { ongoing, upcoming, bossGroups } = useLoaderData<typeof loader>();
  const highlightRaids = [...ongoing, ...upcoming];

  return (
    <Page
      title="총력전/대결전"
      description="개최 일정과 보스별 통계 정보를 확인해보세요"
      contentArea="4xl"
    >
      <div className="my-8 space-y-10">
        <section>
          <SubTitle text="진행중 / 예정" />
          {highlightRaids.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
              {highlightRaids.map((raid) => (
                <Link
                  key={`${raid.raidType}-${raid.seasonIndex}`}
                  to={`/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`}
                  className="hover:opacity-75 transition-opacity"
                >
                  <RaidCard raid={raid} timeLocaleType="relative" showDateRange />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyView text="진행 중이거나 예정된 총력전/대결전이 없어요" className="mt-4" />
          )}
        </section>

        <section>
          <SubTitle text="보스/지형별 통계" />
          <RaidBossGroupGrid groups={bossGroups} />
        </section>
      </div>
    </Page>
  );
}
