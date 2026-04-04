import type { MetaFunction } from "react-router";
import { Outlet } from "react-router";

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

export default function GrowthLayout() {
  return <Outlet />;
}
