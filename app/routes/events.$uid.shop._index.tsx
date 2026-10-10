import { useOutletContext } from "react-router";
import {
  type EventShopPlanContext,
  ShopCalculatorScreen,
} from "~/components/features/events/shop/ShopCalculatorScreen";

export default function EventShopCalculatorRoute() {
  const plan = useOutletContext<EventShopPlanContext>();
  return <ShopCalculatorScreen {...plan} />;
}
