import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Button, Textarea } from "~/components/primitives";

type ReplyActionData = {
  success?: boolean;
  error?: {
    content?: string;
  };
};

export default function ReplyForm() {
  const fetcher = useFetcher<ReplyActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const revalidator = useRevalidator();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      formRef.current?.reset();
      revalidator.revalidate();
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  return (
    <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="mb-6">
        <h2 className="text-lg font-bold">추가 문의 남기기</h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          같은 문의에 이어서 내용을 남기면 스레드로 계속 확인할 수 있어요.
        </p>
      </div>

      <fetcher.Form method="post" ref={formRef}>
        <Textarea label="내용" name="content" rows={4} error={fetcher.data?.error?.content} required />
        <Button
          type="submit"
          text={fetcher.state === "submitting" ? "등록 중..." : "답글 등록하기"}
          variant="primary"
          disabled={fetcher.state === "submitting"}
          icon={fetcher.state === "submitting" ? ArrowPathIcon : undefined}
        />
      </fetcher.Form>
    </section>
  );
}
