import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import ResourceScanner from "./scanner.resource._components/ResourceScanner";

export const meta: MetaFunction = () => [{ title: "재화 스크린샷 인식 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const sensei = await getActiveSensei(context.cloudflare.env, request);
  if (!sensei) return redirect("/unauthorized");
  return null;
};

export default function ResourceScannerPage() {
  return <ResourceScanner />;
}
