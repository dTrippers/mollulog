import { Link } from "react-router";

type ServerErrorPageProps = {
  status: number;
  title: string;
  message: string;
};

export default function ServerErrorPage({ status, title, message }: ServerErrorPageProps) {
  return (
    <div className="fixed inset-0 z-layer-modal bg-neutral-900 text-neutral-200 min-h-dvh w-screen flex flex-col items-center justify-center px-4">
      <p className="text-sm font-semibold text-neutral-400">{status}</p>
      <p className="my-2 text-2xl font-bold text-center">{title}</p>
      <p className="text-sm text-neutral-400 text-center">{message}</p>

      <div className="my-4 flex gap-2">
        <Link
          to="/"
          className="px-4 py-2 bg-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors"
        >
          첫 화면으로
        </Link>
        <button
          type="button"
          className="px-4 py-2 bg-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors"
          onClick={() => window.location.reload()}
        >
          새로고침
        </button>
      </div>

      <video
        className="my-4 w-full max-w-lg aspect-video"
        src="https://assets.mollulog.net/assets/videos/site/aropla-sorry.mp4"
        autoPlay
        muted
        loop
      />

      <p className="mt-4 text-sm text-center">
        <Link to="/contact" className="underline text-blue-300">
          문의 메일
        </Link>
        을 통해 상황을 알려주시면 빠르게 해결할 수 있어요.
      </p>
    </div>
  );
}
