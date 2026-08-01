import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Await, Outlet, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { getLogger } from "~/lib/observability.server";
import { loadDeferredGrowthPlannerData } from "./utils.growth._components/growth-data.server";
import type {
  GrowthLayoutContext,
  GrowthResourceRequirementsByStudent,
  GrowthStudent,
} from "./utils.growth._components/types";

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

  return loadDeferredGrowthPlannerData(env, currentUser.id, { logger });
};

function GrowthResourceRequirementsSync({
  resourceRequirements,
  onResolve,
}: {
  resourceRequirements: GrowthResourceRequirementsByStudent;
  onResolve: (resourceRequirements: GrowthResourceRequirementsByStudent) => void;
}) {
  useEffect(() => {
    onResolve(resourceRequirements);
  }, [onResolve, resourceRequirements]);

  return null;
}

export default function GrowthLayout() {
  const loaderData = useLoaderData<typeof loader>();

  const [managedStudents, setManagedStudents] = useState(loaderData.managedStudents);
  const managedStudentListKey = loaderData.managedStudents.map((student) => student.uid).join(":");
  const syncedManagedStudentListKeyRef = useRef(managedStudentListKey);
  const latestResourceRequirementsRef = useRef<GrowthResourceRequirementsByStudent>({});

  useEffect(() => {
    if (syncedManagedStudentListKeyRef.current === managedStudentListKey) return;
    syncedManagedStudentListKeyRef.current = managedStudentListKey;
    // Preserve per-row optimistic updates and resource results that may have resolved before this list sync.
    setManagedStudents(
      loaderData.managedStudents.map((student) => ({
        ...student,
        resourceRequirements: latestResourceRequirementsRef.current[student.uid] ?? student.resourceRequirements,
      })),
    );
  }, [loaderData.managedStudents, managedStudentListKey]);

  const updateStudent = useCallback((next: GrowthStudent) => {
    setManagedStudents((prev) => {
      const idx = prev.findIndex((s) => s.uid === next.uid);
      if (idx === -1) return prev;
      const copy = prev.slice();
      copy[idx] = {
        ...next,
        resourceRequirements: next.resourceRequirements ?? prev[idx].resourceRequirements,
      };
      return copy;
    });
  }, []);

  const updateResourceRequirements = useCallback((resourceRequirements: GrowthResourceRequirementsByStudent) => {
    latestResourceRequirementsRef.current = resourceRequirements;
    setManagedStudents((prev) =>
      prev.map((student) => ({
        ...student,
        resourceRequirements: resourceRequirements[student.uid] ?? student.resourceRequirements,
      })),
    );
  }, []);

  const contextValue: GrowthLayoutContext = {
    managedStudents,
    availableStudents: loaderData.availableStudents,
    updateStudent,
  };

  return (
    <Page
      title="학생 성장 플래너"
      description="학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요."
      contentWidth="full"
      maxWidth="full"
      layout="vertical"
    >
      <Suspense fallback={null}>
        <Await resolve={loaderData.resourceRequirements}>
          {(resourceRequirements) => (
            <GrowthResourceRequirementsSync
              resourceRequirements={resourceRequirements}
              onResolve={updateResourceRequirements}
            />
          )}
        </Await>
      </Suspense>
      <Outlet context={contextValue satisfies GrowthLayoutContext} />
    </Page>
  );
}
