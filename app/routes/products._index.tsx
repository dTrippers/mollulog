import { redirect } from "react-router";

// 상품 / 패키지 opens on its only tab.
export function loader() {
  return redirect("/products/recruit-tickets");
}
