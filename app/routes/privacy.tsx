import type { MetaFunction } from "react-router";
import LegalDocument from "~/components/features/legal/LegalDocument";
import privacy from "~/content/legal/privacy.md?raw";

export const meta: MetaFunction = () => [
  { title: "개인정보처리방침 | 몰루로그" },
  { name: "description", content: "몰루로그 개인정보처리방침입니다." },
];

export default function Privacy() {
  return <LegalDocument content={privacy} />;
}
