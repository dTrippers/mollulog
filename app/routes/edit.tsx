import { Outlet } from "react-router";
import { useLocation } from "react-router";

export default function EditTemplate() {
  const { pathname } = useLocation();
  const wide = pathname.startsWith("/edit/resources");

  return (
    <div className={wide ? "max-w-none" : "max-w-3xl"}>
      <Outlet />
    </div>
  );
}
