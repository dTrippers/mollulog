import { redirect } from "react-router";

// The favorite students page was removed. Registered favorite students live on in the integrated planner.
export const loader = () => redirect("/planner");

export default function UserFuturesRedirect() {
  return null;
}
