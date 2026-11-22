import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Await, Outlet, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { AsideLinks, LinkTarget, MobileActionBar, PageAside, PageHeader, V2Page } from "~/components/v2/layout";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";
import { getLogger } from "~/lib/observability.server";
import { socialMeta } from "~/lib/seo";
import { loadDeferredGrowthPlannerData } from "./utils.growth._components/growth-data.server";
import type {
  GrowthLayoutContext,
  GrowthResourceRequirementsByStudent,
  GrowthStudent,
} from "./utils.growth._components/types";
import { getGrowthPlannerPageLinks } from "./utils.resources._components/resource-page-links";

export const meta: MetaFunction = ({ location }) => {
  const title = "학생 성장 플래너 | 몰루로그";
  const description = "<블루 아카이브> 학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요.";
  return [
    { title },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
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
    // The screen already shows a saved sort choice or order.
    if ("kind" in actionResult && (actionResult.kind === "sortOrder" || actionResult.kind === "order")) return false;
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

  const setStudentPositions = useCallback((positions: Record<string, number | null>) => {
    setManagedStudents((prev) =>
      prev.map((student) =>
        Object.hasOwn(positions, student.uid)
          ? { ...student, plannerPosition: positions[student.uid] ?? null }
          : student,
      ),
    );
  }, []);

  const [stacked, setStacked] = useState(true);
  const links = getGrowthPlannerPageLinks();

  const contextValue: GrowthLayoutContext = {
    managedStudents,
    availableStudents: loaderData.availableStudents,
    sortOrder: loaderData.sortOrder,
    sortOrderStored: loaderData.sortOrderStored,
    updateStudent,
    setStudentPositions,
    stacked,
  };

  return (
    <V2Page width="full" onStackedChange={setStacked}>
      <PageHeader
        title="학생 성장 플래너"
        description="학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요."
        trailing={
          <div className="flex flex-wrap gap-2">
            {links.map(({ to, title, Icon }) => (
              <LinkTarget key={to} to={to} className={v2ButtonClassName({ variant: "secondary" })}>
                <Icon className="size-4" aria-hidden="true" />
                {title}
                <ChevronRightIcon className="-ml-0.5 size-3.5 text-v2-fg-tertiary" aria-hidden="true" />
              </LinkTarget>
            ))}
          </div>
        }
        // The Aside holds these links from 96rem; the stacked layout has them in the action bar.
        trailingClassName="hidden @min-[48rem]/page-available:block @min-[96rem]/page-available:hidden"
      />
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
      <PageAside revealAt="extra-wide">
        <AsideLinks
          items={links.map(({ to, title, description, Icon }) => ({ key: to, title, description, Icon, to }))}
        />
      </PageAside>
      <MobileActionBar
        links={links.map(({ to, title, shortTitle, Icon }) => ({ key: to, title, shortTitle, Icon, to }))}
      />
    </V2Page>
  );
}
