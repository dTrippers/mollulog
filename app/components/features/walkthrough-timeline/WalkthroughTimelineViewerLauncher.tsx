import { WindowIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Button from "~/components/primitives/Button";
import type { TimelineViewerItem, TimelineViewerStudent } from "./WalkthroughTimelineViewer";
import { WalkthroughTimelineViewer } from "./WalkthroughTimelineViewer";

type WindowWithDocumentPictureInPicture = Window & {
  documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<Window> };
};

function prepareViewerDocument(target: Window) {
  target.document.title = "몰루로그 실전 타임라인 뷰어";
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

export function WalkthroughTimelineViewerLauncher({
  items,
  studentsByUid,
}: {
  items: TimelineViewerItem[];
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
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

  const openViewer = async () => {
    if (viewerWindow && !viewerWindow.closed) {
      viewerWindow.focus();
      return;
    }
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
        setError("팝업이 차단됐어요. 브라우저에서 이 사이트의 팝업을 허용해주세요.");
        return;
      }
      setViewerRoot(prepareViewerDocument(target));
      setViewerWindow(target);
      setMode("popup");
    } catch {
      setError("보조 창을 열지 못했어요. 일반 뷰어를 이용해주세요.");
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={WindowIcon}
          text={mode ? "실전 뷰어로 돌아가기" : "실전 보조 창 열기"}
          variant="primary"
          onClick={openViewer}
        />
        {mode === "popup" && (
          <p className="text-xs text-muted-foreground">일반 팝업은 항상 위 표시를 보장하지 않습니다.</p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {viewerRoot &&
        createPortal(
          <WalkthroughTimelineViewer
            items={items}
            studentsByUid={studentsByUid}
            currentIndex={currentIndex}
            onCurrentIndexChange={setCurrentIndex}
          />,
          viewerRoot,
        )}
    </>
  );
}
