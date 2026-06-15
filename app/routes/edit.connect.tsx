import { type MetaFunction, Outlet, useLocation } from "react-router";
import { Title } from "~/components/primitives";

export const meta: MetaFunction = () => [{ title: "API 키 관리 | 몰루로그" }];

export default function EditConnect() {
  const location = useLocation();
  const parentPath = location.pathname.split("/").slice(0, -1).join("/");

  return (
    <>
      <Title text="API 키 관리" parentPath={parentPath} />
      <Outlet />
    </>
  );
}
