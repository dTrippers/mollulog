import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TimelineViewerItem, TimelineViewerStudent } from "./WalkthroughTimelineViewer";
import { WalkthroughTimelineViewer } from "./WalkthroughTimelineViewer";

export { flattenTimelineParties } from "./WalkthroughTimelineViewer";

type WindowWithDocumentPictureInPicture = Window & {
  documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<Window> };
};

function prepareViewerDocument(target: Window) {
  target.document.title = "타임라인 뷰어 | 몰루로그";
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    target.document.head.appendChild(node.cloneNode(true));
  }
  const root = target.document.createElement("div");
  root.id = "timeline-viewer-root";
  target.document.documentElement.className = document.documentElement.className;
  target.document.body.className = document.body.className;
  target.document.body.replaceChildren(root);
  return root;
}

export type WalkthroughViewerWindow = {
  open: () => Promise<void>;
  // "pip" for an always-on-top Document Picture-in-Picture window, "popup" for an ordinary popup, null while closed.
  mode: "pip" | "popup" | null;
  error: string | null;
  // Renders the viewer into the open window. Place it anywhere in the page's tree.
  portal: ReactNode;
};

// Opens the timeline viewer beside the game: a Document Picture-in-Picture window where the browser has one, otherwise
// a popup. The viewer renders into that window from this page, so it follows the page's data. A coarse-pointer device
// opens the viewer page in a new tab instead, which the caller does with a link.
export function useWalkthroughViewerWindow({
  items,
  studentsByUid,
}: {
  items: TimelineViewerItem[];
  studentsByUid: Record<string, TimelineViewerStudent>;
}): WalkthroughViewerWindow {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerWindow, setViewerWindow] = useState<Window | null>(null);
  const [viewerRoot, setViewerRoot] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<"pip" | "popup" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerWindow) return;
    const handleClose = () => {
      setViewerWindow(null);
      setViewerRoot(null);
      setMode(null);
    };
    viewerWindow.addEventListener("pagehide", handleClose);
    return () => viewerWindow.removeEventListener("pagehide", handleClose);
  }, [viewerWindow]);

  const open = async () => {
    if (viewerWindow && !viewerWindow.closed) {
      viewerWindow.focus();
      return;
    }
    setCurrentIndex(0);
    setError(null);
    try {
      const pictureInPicture = (window as WindowWithDocumentPictureInPicture).documentPictureInPicture;
      if (pictureInPicture) {
        const target = await pictureInPicture.requestWindow({ width: 360, height: 720 });
        setViewerRoot(prepareViewerDocument(target));
        setViewerWindow(target);
        setMode("pip");
        return;
      }
      const target = window.open("", "mollulog-timeline-viewer", "popup,width=360,height=720");
      if (!target) {
        setError("팝업이 차단됐어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요.");
        return;
      }
      setViewerRoot(prepareViewerDocument(target));
      setViewerWindow(target);
      setMode("popup");
    } catch {
      setError("보조 창을 열지 못했어요. 일반 뷰어를 이용해 주세요.");
    }
  };

  const portal = viewerRoot
    ? createPortal(
        <WalkthroughTimelineViewer
          items={items}
          studentsByUid={studentsByUid}
          currentIndex={currentIndex}
          onCurrentIndexChange={setCurrentIndex}
        />,
        viewerRoot,
      )
    : null;

  return { open, mode, error, portal };
}
