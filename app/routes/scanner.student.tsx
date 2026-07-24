import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import StudentScanner from "./scanner.student._components/StudentScanner";

export const meta: MetaFunction = () => [{ title: "학생 성장도 영상 인식 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const sensei = await getActiveSensei(context.cloudflare.env, request);
  if (!sensei) return redirect("/unauthorized");
  return null;
};

export default function StudentScannerPage() {
  return <StudentScanner />;
}
