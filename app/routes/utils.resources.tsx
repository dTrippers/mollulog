import { EyeIcon, EyeSlashIcon } from "@heroicons/react/16/solid";
import { ArchiveBoxIcon, ChartBarIcon, MagnifyingGlassIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, redirect, useLoaderData, useLocation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { PanelActionRow, PanelBody, PanelOptionChip } from "~/components/primitives";
import { getLogger } from "~/lib/observability.server";
import { loadGrowthPlannerData } from "./utils.growth._components/growth-data.server";
import type { GrowthLayoutContext, GrowthStudent } from "./utils.growth._components/types";

const FARMING_SETTINGS_STORAGE_KEY = "mollulog::resources::farming-settings";

type FarmingPlannerSettings = {
  showNormal: boolean;
  showHard: boolean;
  prioritizeHighTier: boolean;
};

const DEFAULT_FARMING_SETTINGS: FarmingPlannerSettings = {
  showNormal: true,
  showHard: false,
  prioritizeHighTier: false,
};

export const meta: MetaFunction = () => {
  return [
    { title: "재화 관리/파밍 계산기 | 몰루로그" },
    {
      name: "description",
      content: "<블루 아카이브> 보유 재화와 필요한 장비 파밍 계획을 확인해보세요.",
    },
    { name: "og:title", content: "재화 관리/파밍 계산기 | 몰루로그" },
    {
      name: "og:description",
      content: "<블루 아카이브> 보유 재화와 필요한 장비 파밍 계획을 확인해보세요.",
    },
  ];
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const logger = getLogger(env, context.cloudflare.ctx, { route: "utils.resources.loader" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  return loadGrowthPlannerData(env, currentUser.id, { logger });
};

export default function ResourcePlannerLayout() {
  const loaderData = useLoaderData<typeof loader>();
  const { pathname } = useLocation();

  const [managedStudents, setManagedStudents] = useState(loaderData.managedStudents);
  const [farmingSettings, setFarmingSettings] = useState(DEFAULT_FARMING_SETTINGS);
  const [farmingSettingsHydrated, setFarmingSettingsHydrated] = useState(false);
  const managedStudentListKey = loaderData.managedStudents.map((student) => student.uid).join(":");
  const syncedManagedStudentListKeyRef = useRef(managedStudentListKey);

  useEffect(() => {
    setFarmingSettings(readStoredFarmingSettings);
    setFarmingSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!farmingSettingsHydrated) return;
    try {
      localStorage.setItem(FARMING_SETTINGS_STORAGE_KEY, JSON.stringify(farmingSettings));
    } catch {
      // Ignore localStorage errors.
    }
  }, [farmingSettings, farmingSettingsHydrated]);

  useEffect(() => {
    if (syncedManagedStudentListKeyRef.current === managedStudentListKey) return;
    syncedManagedStudentListKeyRef.current = managedStudentListKey;
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
      showNormal: farmingSettings.showNormal,
      showHard: farmingSettings.showHard,
      prioritizeHighTier: farmingSettings.prioritizeHighTier,
    },
  };

  return (
    <Page
      title="재화 관리/파밍 계산기"
      description="보유 재화와 필요한 장비 파밍 계획을 확인해보세요."
      contentWidth="full"
      panels={
        pathname === "/utils/resources/farming"
          ? [
              {
                title: "계산 설정",
                Icon: ChartBarIcon,
                children: (
                  <FarmingPlannerSettingsPanel
                    showNormal={farmingSettings.showNormal}
                    showHard={farmingSettings.showHard}
                    prioritizeHighTier={farmingSettings.prioritizeHighTier}
                    onShowNormalChange={(showNormal) => setFarmingSettings((prev) => ({ ...prev, showNormal }))}
                    onShowHardChange={(showHard) => setFarmingSettings((prev) => ({ ...prev, showHard }))}
                    onPrioritizeHighTierChange={(prioritizeHighTier) =>
                      setFarmingSettings((prev) => ({ ...prev, prioritizeHighTier }))
                    }
                  />
                ),
              },
            ]
          : undefined
      }
      screens={[
        {
          text: "재화 관리",
          description: "각 재화별 보유/필요 수량을 관리",
          Icon: ArchiveBoxIcon,
          link: "/utils/resources/inventory",
          active: pathname.startsWith("/utils/resources/inventory"),
        },
        {
          text: "장비 파밍 계산기",
          description: "필요 장비를 획득하기 위한 스테이지를 확인",
          Icon: MagnifyingGlassIcon,
          link: "/utils/resources/farming",
          active: pathname === "/utils/resources/farming",
        },
      ]}
      links={[
        {
          title: "학생 성장 플래너",
          description: "학생들의 성장 목표를 입력하면 필요한 재화를 계산할 수 있어요",
          to: "/utils/growth/students",
          Icon: TableCellsIcon,
        },
      ]}
    >
      <Outlet context={contextValue satisfies GrowthLayoutContext} />
    </Page>
  );
}

function FarmingPlannerSettingsPanel({
  showNormal,
  showHard,
  prioritizeHighTier,
  onShowNormalChange,
  onShowHardChange,
  onPrioritizeHighTierChange,
}: {
  showNormal: boolean;
  showHard: boolean;
  prioritizeHighTier: boolean;
  onShowNormalChange: (value: boolean) => void;
  onShowHardChange: (value: boolean) => void;
  onPrioritizeHighTierChange: (value: boolean) => void;
}) {
  return (
    <PanelBody className="space-y-2">
      <PanelActionRow
        title="스테이지 난이도"
        actions={
          <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
            <PanelOptionChip
              label="노말"
              active={showNormal}
              Icon={showNormal ? EyeIcon : EyeSlashIcon}
              onClick={() => onShowNormalChange(!showNormal)}
            />
            <PanelOptionChip
              label="하드"
              active={showHard}
              Icon={showHard ? EyeIcon : EyeSlashIcon}
              onClick={() => onShowHardChange(!showHard)}
            />
          </div>
        }
      />

      <PanelActionRow
        title="상위티어 우선"
        description="설계도 단가를 반영하여 계산해요"
        actions={
          <PanelOptionChip
            label="적용"
            active={prioritizeHighTier}
            Icon={prioritizeHighTier ? EyeIcon : EyeSlashIcon}
            onClick={() => onPrioritizeHighTierChange(!prioritizeHighTier)}
          />
        }
      />
    </PanelBody>
  );
}

function readStoredFarmingSettings(): FarmingPlannerSettings {
  try {
    const saved = localStorage.getItem(FARMING_SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_FARMING_SETTINGS;
    return normalizeFarmingSettings(JSON.parse(saved));
  } catch {
    return DEFAULT_FARMING_SETTINGS;
  }
}

function normalizeFarmingSettings(value: unknown): FarmingPlannerSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_FARMING_SETTINGS;
  }

  const settings = value as Partial<Record<keyof FarmingPlannerSettings, unknown>>;
  return {
    showNormal: typeof settings.showNormal === "boolean" ? settings.showNormal : DEFAULT_FARMING_SETTINGS.showNormal,
    showHard: typeof settings.showHard === "boolean" ? settings.showHard : DEFAULT_FARMING_SETTINGS.showHard,
    prioritizeHighTier:
      typeof settings.prioritizeHighTier === "boolean"
        ? settings.prioritizeHighTier
        : DEFAULT_FARMING_SETTINGS.prioritizeHighTier,
  };
}
