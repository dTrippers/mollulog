import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { getLogger } from "~/lib/observability.server";
import { loadGrowthPlannerData } from "./utils.growth._components/growth-data.server";
import type { GrowthLayoutContext, GrowthStudent } from "./utils.growth._components/types";

export const meta: MetaFunction = () => {
  return [
    { title: "학생 성장 플래너 | 몰루로그" },
    {
      name: "description",
      content: "<블루 아카이브> 학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요.",
    },
    { name: "og:title", content: "학생 성장 플래너 | 몰루로그" },
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
  const logger = getLogger(env, context.cloudflare.ctx, { route: "utils.growth.loader" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  return loadGrowthPlannerData(env, currentUser.id, { logger });
};

export default function GrowthLayout() {
  const loaderData = useLoaderData<typeof loader>();

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
    farmingStageFilter: {
      showNormal: true,
      showHard: true,
      prioritizeHighTier: false,
    },
  };

  return (
    <Page
      title="학생 성장 플래너"
      description="학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요."
      contentArea="full"
      layout="vertical"
    >
      <Outlet context={contextValue satisfies GrowthLayoutContext} />
    </Page>
  );
}
