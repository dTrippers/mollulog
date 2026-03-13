import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

export default function Footer() {
  return (
    <div className="mt-16 py-16">
      <p className="text-lg text-bold font-ingame"><span className="font-bold">
        몰루</span>로그
      </p>

      <p className="mt-2 mb-4 text-sm text-neutral-500">
        게임 &lt;블루 아카이브&gt;의 각종 에셋 및 컨텐츠의 권리는 넥슨, 넥슨게임즈 및 Yostar에 있습니다.<br />
        몰루로그는 &lt;블루 아카이브&gt;의 팬 사이트이며 컨텐츠를 상업적으로 이용하지 않습니다.
      </p>

      <a href="https://github.com/hellodhlyn/mollulog" target="_blank" rel="noreferrer">
        <div className="flex items-center gap-x-1 hover:opacity-50 transition-opacity">
          <ArrowTopRightOnSquareIcon className="size-5" />
          <span>GitHub</span>
        </div>
      </a>
    </div>
  );
}
