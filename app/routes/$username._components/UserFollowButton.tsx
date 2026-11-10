import {
  ArrowPathIcon,
  CheckIcon,
  ExclamationCircleIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@heroicons/react/16/solid";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/v2/primitives/Button";
import { Popover } from "~/components/v2/primitives/Popover";
import { useSignIn } from "~/contexts/SignInProvider";
import type { ActionData } from "../api.followerships";
import { FOLLOW_FAILURE_MESSAGE, UNFOLLOW_FAILURE_MESSAGE } from "./user-layout";

// The visitor's primary header action. The action contract is `/api/followerships`: POST follows, DELETE unfollows,
// and the layout loader revalidates afterwards, so `following` always comes from the server.
export function UserFollowButton({
  username,
  following,
  signedIn,
}: {
  username: string;
  following: boolean;
  signedIn: boolean;
}) {
  const fetcher = useFetcher<ActionData>();
  const { showSignIn } = useSignIn();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [signInPromptOpen, setSignInPromptOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const pending = fetcher.state !== "idle";
  // The server answers a failure with an error body, whose text is not meant for people. The layout says what failed.
  const failed = !pending && Boolean(fetcher.data?.error);

  const submit = (method: "post" | "delete") => fetcher.submit({ username }, { method, action: "/api/followerships" });

  const onClick = () => {
    if (pending) return;
    if (!signedIn) {
      setSignInPromptOpen((open) => !open);
      return;
    }
    submit(following ? "delete" : "post");
  };

  let content = (
    <>
      <UserPlusIcon className="size-4" aria-hidden="true" />
      팔로우
    </>
  );
  if (pending) {
    content = (
      <>
        <ArrowPathIcon className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        {following ? "팔로우 해제" : "팔로우"}
      </>
    );
  } else if (following) {
    content = hovered ? (
      <>
        <UserMinusIcon className="size-4" aria-hidden="true" />
        팔로우 해제
      </>
    ) : (
      <>
        <CheckIcon className="size-4" aria-hidden="true" />
        팔로우 중
      </>
    );
  }

  return (
    <div className="relative flex flex-col items-end">
      <Button
        ref={buttonRef}
        variant={pending ? "secondary" : following ? (hovered ? "danger-subtle" : "secondary") : "primary"}
        onClick={onClick}
        disabled={pending}
        // The visible "팔로우 중" says the state; the name also says that pressing it unfollows.
        aria-label={following && !pending ? "팔로우 중, 누르면 팔로우 해제" : undefined}
        aria-haspopup={signedIn ? undefined : "dialog"}
        aria-expanded={signedIn ? undefined : signInPromptOpen}
        onPointerEnter={(event) => setHovered(event.pointerType === "mouse")}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(false)}
      >
        {content}
      </Button>
      {failed ? (
        <p
          role="alert"
          // Overlays the space below the header, so a failure never pushes the content down.
          className="absolute top-full right-0 z-20 mt-1 flex w-max max-w-56 items-start gap-1 rounded-md bg-v2-danger-subtle px-2 py-1 text-xs text-v2-danger"
        >
          <ExclamationCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {/* A failed request leaves `following` unchanged, so it still says which action failed. */}
          {following ? UNFOLLOW_FAILURE_MESSAGE : FOLLOW_FAILURE_MESSAGE}
        </p>
      ) : null}
      <Popover
        open={!signedIn && signInPromptOpen}
        label="로그인이 필요해요"
        onClose={() => setSignInPromptOpen(false)}
        returnFocusRef={buttonRef}
      >
        <p className="text-sm font-semibold text-v2-fg">로그인이 필요해요</p>
        <p className="mt-1 text-sm text-v2-fg-secondary">로그인하면 이 선생님을 팔로우할 수 있어요.</p>
        <Button
          variant="primary"
          size="sm"
          className="mt-3"
          onClick={() => {
            setSignInPromptOpen(false);
            showSignIn();
          }}
        >
          로그인
        </Button>
      </Popover>
    </div>
  );
}
