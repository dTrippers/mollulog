import { ArchiveBoxIcon, CameraIcon, MapIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import type { PageLinkProps } from "~/components/features/layout/PageLink";

const resourcePlannerLink: PageLinkProps = {
  title: "재화 플래너",
  shortTitle: "재화 플래너",
  description: "재화별 보유·필요 수량 관리",
  to: "/utils/resources/inventory",
  Icon: ArchiveBoxIcon,
};

const farmingCalculatorLink: PageLinkProps = {
  title: "파밍 계산기",
  shortTitle: "파밍 계산기",
  description: "필요 장비를 얻을 스테이지 계산",
  to: "/utils/resources/farming",
  Icon: MapIcon,
};

const scannerLink: PageLinkProps = {
  title: "스크린샷 인식기",
  description: "아이템 스크린샷에서 보유 재화 인식",
  to: "/scanner/resource",
  Icon: CameraIcon,
};

const studentGrowthLink: PageLinkProps = {
  title: "학생 성장 플래너",
  description: "성장 목표에 필요한 재화 계산",
  to: "/utils/growth/students",
  Icon: TableCellsIcon,
};

export function getResourcePlannerPageLinks(): PageLinkProps[] {
  return [farmingCalculatorLink, scannerLink, studentGrowthLink];
}

export function getFarmingCalculatorPageLinks(): PageLinkProps[] {
  return [resourcePlannerLink, scannerLink, studentGrowthLink];
}

export function getGrowthPlannerPageLinks(): PageLinkProps[] {
  return [resourcePlannerLink, farmingCalculatorLink];
}
