import { ArchiveBoxIcon, CameraIcon, MapIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import type { PageLinkProps } from "~/components/features/layout/PageLink";

const scannerLink: PageLinkProps = {
  title: "스크린샷 인식기",
  description: "아이템 화면 스크린샷에서 보유 재화를 인식할 수 있어요",
  to: "/scanner/resource",
  Icon: CameraIcon,
};

const studentGrowthLink: PageLinkProps = {
  title: "학생 성장 플래너",
  description: "학생들의 성장 목표를 입력하면 필요한 재화를 계산할 수 있어요",
  to: "/utils/growth/students",
  Icon: TableCellsIcon,
};

export function getResourcePlannerPageLinks(): PageLinkProps[] {
  return [
    {
      title: "파밍 계산기",
      shortTitle: "파밍 계산기",
      description: "필요 장비를 얻을 스테이지를 계산해요",
      to: "/utils/resources/farming",
      Icon: MapIcon,
    },
    scannerLink,
    studentGrowthLink,
  ];
}

export function getFarmingCalculatorPageLinks(): PageLinkProps[] {
  return [
    {
      title: "재화 플래너",
      shortTitle: "재화 플래너",
      description: "각 재화의 보유·필요 수량을 관리해요",
      to: "/utils/resources/inventory",
      Icon: ArchiveBoxIcon,
    },
    scannerLink,
    studentGrowthLink,
  ];
}
