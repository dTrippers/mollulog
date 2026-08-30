import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";

export default function Footer() {
  return (
    <div className="mt-16 pt-16 pb-[var(--mobile-page-bottom-padding)] lg:pb-16">
      <p className="font-ingame text-lg">
        <span className="font-bold">몰루</span>로그
      </p>

      <p className="my-2 text-sm text-muted-foreground">
        게임 &lt;블루 아카이브&gt;의 에셋 및 콘텐츠의 권리는 넥슨, 넥슨게임즈 및 Yostar에 있습니다.
        <br />
        몰루로그는 &lt;블루 아카이브&gt;의 비공식 팬 사이트이며 컨텐츠를 상업적으로 이용하지 않습니다.
      </p>

      <p className="mt-2 mb-4 text-xs text-muted-foreground">
        © 2026 Dimension Trippers. All rights reserved.
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <Link to="/terms" className="transition-colors hover:text-foreground">
          서비스 이용 약관
        </Link>
        <Link to="/privacy" className="transition-colors hover:text-foreground">
          개인정보처리방침
        </Link>
        <a
          href="https://github.com/dtrippers/mollulog"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
        >
          <ArrowTopRightOnSquareIcon className="size-3" />
          <span>GitHub</span>
        </a>
      </div>
    </div>
  );
}
