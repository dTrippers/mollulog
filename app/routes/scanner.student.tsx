import type { MetaFunction } from "react-router";
import StudentScanner from "./scanner.student._components/StudentScanner";

export const meta: MetaFunction = () => [{ title: "학생 성장도 영상 인식 | 몰루로그" }];

export default function StudentScannerPage() {
  return <StudentScanner />;
}
