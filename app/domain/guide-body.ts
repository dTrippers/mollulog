// The body of a 공략/타임라인: a Tiptap document that the server checks against an allowlist of nodes, marks, and
// attributes before it is stored. Only the allowlisted structure is kept; anything else is rejected, so the stored body
// is always something the renderer knows how to draw.

export const GUIDE_BODY_LIMITS = {
  // Characters of text, counting a mention or a video as one character.
  characters: 20_000,
  // Nodes of any kind. Keeps a body of empty paragraphs or deep lists from growing without text.
  nodes: 5_000,
  listDepth: 4,
  urlLength: 2_048,
  mentionIdLength: 64,
} as const;

// A mention points at something by kind and id; the screen looks up its name when it draws the chip. A new kind needs
// an entry here and in the mention registry of the screens.
export const GUIDE_MENTION_KINDS = ["party", "student"] as const;
export type GuideMentionKind = (typeof GUIDE_MENTION_KINDS)[number];

export type GuideBodyMark = { type: "bold" } | { type: "link"; attrs: { href: string } };

export type GuideBodyInline =
  | { type: "text"; text: string; marks?: GuideBodyMark[] }
  | { type: "hardBreak" }
  | { type: "mention"; attrs: { kind: GuideMentionKind; id: string } };

// A list item starts with a paragraph and may hold any block after it, as the editor's list item does.
export type GuideBodyListItem = { type: "listItem"; content: GuideBodyListItemBlock[] };
export type GuideBodyList =
  | { type: "bulletList"; content: GuideBodyListItem[] }
  | { type: "orderedList"; attrs?: { start: number }; content: GuideBodyListItem[] };
export type GuideBodyParagraph = { type: "paragraph"; content?: GuideBodyInline[] };
export type GuideBodyListItemBlock = GuideBodyBlock;

export type GuideBodyBlock =
  | GuideBodyParagraph
  | { type: "heading"; attrs: { level: 2 }; content?: GuideBodyInline[] }
  | GuideBodyList
  | { type: "horizontalRule" }
  | { type: "youtube"; attrs: { videoId: string } };

export type GuideBody = { type: "doc"; content: GuideBodyBlock[] };

export class InvalidGuideBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGuideBodyError";
  }
}

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGuideMentionKind(value: unknown): value is GuideMentionKind {
  return GUIDE_MENTION_KINDS.some((kind) => kind === value);
}

// The http(s) URL a link may point to, or null. Other schemes such as javascript: are never stored.
export function normalizeGuideLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > GUIDE_BODY_LIMITS.urlLength) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

// The video id of a YouTube watch, share, Shorts, live, or embed URL, or null for any other URL.
export function parseYouTubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "shorts" || first === "live" || first === "embed") id = second ?? null;
  }
  return id && YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

// `limited` is false for a local draft, which keeps a body over the limits so the Sensei can shorten it.
type ParseState = { characters: number; nodes: number; limited: boolean };

function countNode(state: ParseState) {
  state.nodes += 1;
  if (state.limited && state.nodes > GUIDE_BODY_LIMITS.nodes) {
    throw new InvalidGuideBodyError("본문이 너무 길어요.");
  }
}

function countCharacters(state: ParseState, count: number) {
  state.characters += count;
  if (state.limited && state.characters > GUIDE_BODY_LIMITS.characters) {
    throw new InvalidGuideBodyError(
      `본문은 ${GUIDE_BODY_LIMITS.characters.toLocaleString("ko-KR")}자까지 쓸 수 있어요.`,
    );
  }
}

function unsupported(): never {
  throw new InvalidGuideBodyError("본문에 지원하지 않는 형식이 있어요.");
}

function parseMarks(value: unknown): GuideBodyMark[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) unsupported();
  const marks: GuideBodyMark[] = [];
  for (const mark of value) {
    if (!isObject(mark)) unsupported();
    if (mark.type === "bold") {
      if (!marks.some((existing) => existing.type === "bold")) marks.push({ type: "bold" });
    } else if (mark.type === "link") {
      const href = normalizeGuideLinkHref(isObject(mark.attrs) ? mark.attrs.href : undefined);
      if (!href) throw new InvalidGuideBodyError("본문의 링크 주소를 확인해 주세요.");
      if (!marks.some((existing) => existing.type === "link")) marks.push({ type: "link", attrs: { href } });
    } else {
      unsupported();
    }
  }
  return marks.length > 0 ? marks : undefined;
}

function parseInline(value: unknown, state: ParseState): GuideBodyInline | null {
  if (!isObject(value)) unsupported();
  countNode(state);
  if (value.type === "text") {
    if (typeof value.text !== "string") unsupported();
    if (value.text.length === 0) return null;
    countCharacters(state, value.text.length);
    const marks = parseMarks(value.marks);
    return marks ? { type: "text", text: value.text, marks } : { type: "text", text: value.text };
  }
  if (value.type === "hardBreak") return { type: "hardBreak" };
  if (value.type === "mention") {
    const attrs = isObject(value.attrs) ? value.attrs : {};
    if (!isGuideMentionKind(attrs.kind)) unsupported();
    if (
      typeof attrs.id !== "string" ||
      attrs.id.length === 0 ||
      attrs.id.length > GUIDE_BODY_LIMITS.mentionIdLength
    ) {
      unsupported();
    }
    countCharacters(state, 1);
    return { type: "mention", attrs: { kind: attrs.kind, id: attrs.id } };
  }
  return unsupported();
}

function parseInlineContent(value: unknown, state: ParseState): GuideBodyInline[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) unsupported();
  const content = value.flatMap((node) => {
    const inline = parseInline(node, state);
    return inline ? [inline] : [];
  });
  return content.length > 0 ? content : undefined;
}

function parseParagraph(value: Record<string, unknown>, state: ParseState): GuideBodyParagraph {
  const content = parseInlineContent(value.content, state);
  return content ? { type: "paragraph", content } : { type: "paragraph" };
}

function parseList(value: Record<string, unknown>, state: ParseState, depth: number): GuideBodyList {
  if (depth > GUIDE_BODY_LIMITS.listDepth) unsupported();
  if (!Array.isArray(value.content) || value.content.length === 0) unsupported();
  const items = value.content.map((item): GuideBodyListItem => {
    if (!isObject(item) || item.type !== "listItem") unsupported();
    countNode(state);
    if (!Array.isArray(item.content) || item.content.length === 0) unsupported();
    const content = item.content.map((block, index): GuideBodyListItemBlock => {
      if (index === 0 && (!isObject(block) || block.type !== "paragraph")) unsupported();
      return parseBlock(block, state, depth);
    });
    return { type: "listItem", content };
  });
  if (value.type === "bulletList") return { type: "bulletList", content: items };
  const start = isObject(value.attrs) ? value.attrs.start : undefined;
  if (start !== undefined && start !== null && (!Number.isInteger(start) || Number(start) < 0)) unsupported();
  return typeof start === "number" && start !== 1
    ? { type: "orderedList", attrs: { start }, content: items }
    : { type: "orderedList", content: items };
}

// `depth` is the number of lists around the block.
function parseBlock(value: unknown, state: ParseState, depth = 0): GuideBodyBlock {
  if (!isObject(value)) unsupported();
  countNode(state);
  switch (value.type) {
    case "paragraph":
      return parseParagraph(value, state);
    case "heading": {
      if (!isObject(value.attrs) || value.attrs.level !== 2) unsupported();
      const content = parseInlineContent(value.content, state);
      return content ? { type: "heading", attrs: { level: 2 }, content } : { type: "heading", attrs: { level: 2 } };
    }
    case "bulletList":
    case "orderedList":
      return parseList(value, state, depth + 1);
    case "horizontalRule":
      return { type: "horizontalRule" };
    case "youtube": {
      const videoId = isObject(value.attrs) ? value.attrs.videoId : undefined;
      if (typeof videoId !== "string" || !YOUTUBE_VIDEO_ID.test(videoId)) {
        throw new InvalidGuideBodyError("본문의 유튜브 영상 주소를 확인해 주세요.");
      }
      countCharacters(state, 1);
      return { type: "youtube", attrs: { videoId } };
    }
    default:
      return unsupported();
  }
}

// Checks a body against the allowlist and returns a copy with only the allowlisted fields. Returns null for a body
// with no content, so an empty editor stores nothing. A local draft is read with `limits: false`: it keeps a body the
// Sensei has not shortened yet, and the save checks the limits.
export function parseGuideBody(value: unknown, { limits = true }: { limits?: boolean } = {}): GuideBody | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || value.type !== "doc" || !Array.isArray(value.content)) unsupported();
  const state: ParseState = { characters: 0, nodes: 0, limited: limits };
  const content = value.content.map((block) => parseBlock(block, state));
  const body: GuideBody = { type: "doc", content };
  return isGuideBodyEmpty(body) ? null : body;
}

function isBlockEmpty(block: GuideBodyBlock): boolean {
  if (block.type === "paragraph" || block.type === "heading") return !block.content?.length;
  return false;
}

export function isGuideBodyEmpty(body: GuideBody | null): boolean {
  return !body || body.content.every(isBlockEmpty);
}

export type GuideMentionLabelResolver = (kind: GuideMentionKind, id: string) => string;

function inlinePlainText(content: GuideBodyInline[] | undefined, label: GuideMentionLabelResolver): string {
  return (content ?? [])
    .map((node) => {
      if (node.type === "text") return node.text;
      if (node.type === "hardBreak") return " ";
      return label(node.attrs.kind, node.attrs.id);
    })
    .join("");
}

function blockPlainText(block: GuideBodyBlock, label: GuideMentionLabelResolver): string[] {
  if (block.type === "paragraph" || block.type === "heading") return [inlinePlainText(block.content, label)];
  if (block.type === "bulletList" || block.type === "orderedList") {
    return block.content.flatMap((item) => item.content.flatMap((child) => blockPlainText(child, label)));
  }
  return [];
}

// The body as plain text, one line per paragraph, heading, or list item, with mentions as their current names. Videos and
// rules are left out. For list cards and feed previews.
export function guideBodyPlainText(body: GuideBody | null, label: GuideMentionLabelResolver): string {
  if (!body) return "";
  return body.content
    .flatMap((block) => blockPlainText(block, label))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
