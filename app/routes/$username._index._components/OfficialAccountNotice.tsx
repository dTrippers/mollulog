import { CheckBadgeIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";

// "몰루로그 공식 계정이에요" sits at the top of the profile screen, once.
export function OfficialAccountNotice() {
  return (
    <StatusNotice tone="neutral" boxed Icon={CheckBadgeIcon}>
      <p className="font-semibold text-v2-fg">몰루로그 공식 계정이에요</p>
      <p className="text-v2-fg-secondary">
        문의 사항은{" "}
        <Link to="/contact" className="font-medium text-v2-link underline underline-offset-2 hover:decoration-2">
          제안/문의 페이지
        </Link>
        에 남겨주세요.
      </p>
    </StatusNotice>
  );
}
