import type { MetaFunction } from "react-router";
import terms from "~/content/legal/terms.md?raw";
import LegalDocument from "~/components/features/legal/LegalDocument";

export const meta: MetaFunction = () => [
  { title: "서비스 이용 약관 | 몰루로그" },
  { name: "description", content: "몰루로그 서비스 이용 약관입니다." },
];

export default function Terms() {
  return <LegalDocument content={terms} />;
}
