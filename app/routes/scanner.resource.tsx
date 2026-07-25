import type { MetaFunction } from "react-router";
import ResourceScanner from "./scanner.resource._components/ResourceScanner";

export const meta: MetaFunction = () => [{ title: "아이템 스크린샷 인식 | 몰루로그" }];

export default function ResourceScannerPage() {
  return <ResourceScanner />;
}
