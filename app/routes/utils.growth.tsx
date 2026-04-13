import { ArchiveBoxIcon, UserIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Outlet, redirect, useLoaderData, useLocation } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { loadGrowthPlannerData } from "./utils.growth._components/growth-data.server";
import type { GrowthLayoutContext, GrowthStudent } from "./utils.growth._components/types";

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

export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionResult,
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => {
  if (currentUrl.pathname !== nextUrl.pathname) return true;

  if (actionResult && typeof actionResult === "object") {
    if ("kind" in actionResult && actionResult.kind === "listChange") return true;
    if ("kind" in actionResult && actionResult.kind === "studentUpdate") return false;
    if ("error" in actionResult) return false;
  }

  return defaultShouldRevalidate;
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

  const [managedStudents, setManagedStudents] = useState(loaderData.managedStudents);
  const managedStudentListKey = loaderData.managedStudents.map((student) => student.uid).join(":");
  const syncedManagedStudentListKeyRef = useRef(managedStudentListKey);

  useEffect(() => {
    if (syncedManagedStudentListKeyRef.current === managedStudentListKey) return;
    syncedManagedStudentListKeyRef.current = managedStudentListKey;
    // Preserve per-row optimistic updates and only replace the list on real list revalidation.
    setManagedStudents(loaderData.managedStudents);
  }, [loaderData.managedStudents, managedStudentListKey]);

  const updateStudent = useCallback((next: GrowthStudent) => {
    setManagedStudents((prev) => {
      const idx = prev.findIndex((s) => s.uid === next.uid);
      if (idx === -1) return prev;
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const contextValue: GrowthLayoutContext = {
    managedStudents,
    availableStudents: loaderData.availableStudents,
    updateStudent,
  };

  return (
    <Page
      title="성장/재화 플래너 (β)"
      description="학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요."
      contentArea="full"
      layout="vertical"
      screens={[
        {
          text: "학생 성장 목표",
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
        {
          text: "재화 수급처 (준비중)",
          description: "재화별 수급처 정보",
          Icon: ArchiveBoxIcon,
          link: "/utils/growth/sources",
          disabled: true,
        }
      ]}
    >
      <Outlet context={contextValue satisfies GrowthLayoutContext} />
    </Page>
  );
}
