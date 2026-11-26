import { PlayIcon } from "@heroicons/react/24/solid";
import { Fragment, type ReactNode, useState } from "react";
import type {
  GuideBody,
  GuideBodyBlock,
  GuideBodyInline,
  GuideBodyList,
  GuideBodyListItemBlock,
} from "~/domain/guide-body";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { type GuideMentionContext, GuideMentionChip } from "./GuideMentionChip";

// Body typography shared by the rendered body and the editor, so a guide reads the same while it is written.
export const guideBodyClassName = cn(
  "break-keep text-[0.9375rem] leading-7 text-v2-fg [overflow-wrap:anywhere]",
  "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
  "[&_p]:my-2.5 [&_p]:min-h-7",
  "[&_h2]:mt-6 [&_h2]:mb-1.5 [&_h2]:text-lg [&_h2]:leading-7 [&_h2]:font-bold",
  "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5.5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5.5",
  "[&_li]:my-0.5 [&_li>p]:my-0 [&_li::marker]:text-v2-fg-tertiary [&_li>ul]:my-0 [&_li>ol]:my-0",
  "[&_a]:text-v2-link [&_a]:underline [&_a]:decoration-v2-link [&_a]:underline-offset-2 [&_a:hover]:decoration-2",
  "[&_strong]:font-bold",
  "[&_hr]:my-6 [&_hr]:border-v2-divider",
);

// A YouTube video as its thumbnail with a play button. The player loads only when it is pressed, so a guide with
// videos does not load YouTube on open.
export function GuideYouTubeEmbed({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="my-4 aspect-video w-full max-w-[35rem] overflow-hidden rounded-lg bg-v2-inset">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title="유튜브 영상"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="size-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="유튜브 영상 재생"
          className={cn("group relative block size-full cursor-pointer", v2FocusRing)}
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-14 items-center justify-center rounded-lg bg-v2-scrim text-v2-on-media group-hover:bg-v2-danger-solid v2-interaction-transition">
              <PlayIcon className="size-6" aria-hidden="true" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

function renderInline(content: GuideBodyInline[] | undefined, context: GuideMentionContext): ReactNode {
  return (content ?? []).map((node, index) => {
    if (node.type === "hardBreak") {
      // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes have no ids and keep their order
      return <br key={index} />;
    }
    if (node.type === "mention") {
      // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes have no ids and keep their order
      return <GuideMentionChip key={index} kind={node.attrs.kind} id={node.attrs.id} context={context} />;
    }
    let text: ReactNode = node.text;
    const link = node.marks?.find((mark) => mark.type === "link");
    if (node.marks?.some((mark) => mark.type === "bold")) text = <strong>{text}</strong>;
    if (link?.type === "link") {
      text = (
        <a href={link.attrs.href} target="_blank" rel="nofollow noopener noreferrer">
          {text}
        </a>
      );
    }
    // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes have no ids and keep their order
    return <Fragment key={index}>{text}</Fragment>;
  });
}

function renderList(list: GuideBodyList, context: GuideMentionContext, key: number): ReactNode {
  const items = list.content.map((item, itemIndex) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids and keep their order
    <li key={itemIndex}>
      {item.content.map((block: GuideBodyListItemBlock, blockIndex) => renderBlock(block, context, blockIndex))}
    </li>
  ));
  return list.type === "bulletList" ? (
    <ul key={key}>{items}</ul>
  ) : (
    <ol key={key} start={list.attrs?.start}>
      {items}
    </ol>
  );
}

function renderBlock(block: GuideBodyBlock, context: GuideMentionContext, key: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={key}>{renderInline(block.content, context)}</p>;
    case "heading":
      return <h2 key={key}>{renderInline(block.content, context)}</h2>;
    case "bulletList":
    case "orderedList":
      return renderList(block, context, key);
    case "horizontalRule":
      return <hr key={key} />;
    case "youtube":
      return <GuideYouTubeEmbed key={key} videoId={block.attrs.videoId} />;
  }
}

// A stored guide body, drawn on the server and hydrated for the mention previews and the video players.
export function GuideBodyContent({
  body,
  context,
  className,
}: {
  body: GuideBody;
  context: GuideMentionContext;
  className?: string;
}) {
  return (
    <div className={cn(guideBodyClassName, className)}>
      {body.content.map((block, index) => renderBlock(block, context, index))}
    </div>
  );
}
