import { ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";

type ErrorPageProps = {
  Icon?: typeof ExclamationCircleIcon;
  status?: number;
  title?: string;
  message?: string;
  showButtons?: boolean;
};

export default function ErrorPage({ Icon, status, title, message, showButtons = true }: ErrorPageProps) {
  const ShowingIcon = Icon ?? ExclamationCircleIcon;
  const displayTitle = title ?? message ?? "알 수 없는 오류가 발생했어요";
  const displayMessage = title ? message : undefined;

  return (
    <div className="my-16 md:my-48 w-full flex flex-col items-center justify-center">
      <ShowingIcon className="my-2 w-16 h-16" strokeWidth={2} />
      {status && <p className="text-sm font-semibold text-muted-foreground">{status}</p>}
      <p className="my-2 text-2xl font-bold">{displayTitle}</p>
      {displayMessage && <p className="text-sm text-muted-foreground">{displayMessage}</p>}

      {showButtons && (
        <div className="my-4 flex gap-2">
          <Link to="/" className="cursor-pointer rounded-md bg-muted px-4 py-2 transition-colors hover:bg-muted/80">
            첫 화면으로
          </Link>
          <button
            type="button"
            className="cursor-pointer rounded-md bg-muted px-4 py-2 transition-colors hover:bg-muted/80"
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </div>
      )}
    </div>
  );
}
