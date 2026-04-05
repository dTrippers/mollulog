import { ArchiveBoxIcon, UserIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, redirect, useLoaderData, useLocation } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { loadGrowthPlannerData } from "./utils.growth._components/growth-data.server";
import type { GrowthLayoutContext } from "./utils.growth._components/types";

export const meta: MetaFunction = () => {
  return [
    { title: "학생 성장/재화 플래너 | 몰루로그" },
    {
      name: "description",
      content: "<블루 아카이브> 학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요.",
    },
    { name: "og:title", content: "학생 성장/재화 플래너 | 몰루로그" },
    {
      name: "og:description",
      content: "<블루 아카이브> 학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요.",
    },
  ];
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  return loadGrowthPlannerData(env, currentUser.id);
};

export default function GrowthLayout() {
  const loaderData = useLoaderData<typeof loader>();
  const { pathname } = useLocation();

  return (
    <Page
      title="성장/재화 플래너 (β)"
      description="학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요."
      contentArea="full"
      screens={[
        {
          text: "학생 성장",
          description: "학생별 현재 성장 상태와 목표 관리",
          Icon: UserIcon,
          link: "/utils/growth/students",
          active: pathname === "/utils/growth/students",
        },
        {
          text: "재화 관리",
          description: "현재 보유한 재화와 필요한 재화 수량 계산",
          Icon: ArchiveBoxIcon,
          link: "/utils/growth/resources",
          active: pathname === "/utils/growth/resources",
        },
      ]}
    >
      <Outlet context={loaderData satisfies GrowthLayoutContext} />
    </Page>
  );
}
