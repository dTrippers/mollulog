import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { EmptyView } from "~/components/primitives";

export default function Unauthorized() {
  return (
    <div className="my-32">
      <EmptyView Icon={ExclamationCircleIcon} text="로그인 후 이용해주세요." />
    </div>
  );
}
